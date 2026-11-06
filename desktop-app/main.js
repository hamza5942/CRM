const fs = require('fs');
const path = require('path');

try {
  require('dotenv').config({ path: path.join(__dirname, '.env') });
} catch (_) {
  require('dotenv').config();
}

const axios = require('axios');
const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  nativeImage,
  powerMonitor,
  safeStorage,
  ipcMain,
} = require('electron');

const HEARTBEAT_INTERVAL_MS = 60_000;
const SYNC_INTERVAL_MS = 10_000;
const IDLE_THRESHOLD_SECONDS = Math.max(
  1,
  Number.parseInt(process.env.IDLE_THRESHOLD_SECONDS, 10) || 180
);
const DEFAULT_API_BASE = 'https://crm-backend-sepia-mu.vercel.app/api';
let rawApiBase = (process.env.API_BASE_URL || DEFAULT_API_BASE).trim().replace(/\/+$/, '');
if (!rawApiBase.endsWith('/api')) {
  rawApiBase += '/api';
}
const API_BASE_URL = rawApiBase;
const API_TIMEOUT_MS = 10_000;
const SESSION_FILE = path.join(app.getPath('userData'), 'session.json');

let mainWindow;
let tray;
let heartbeatTimer;
let syncTimer;
let session = null;
let tracking = false;
let forcedStatus = null;
let lastError = '';
let isQuitting = false;
let todayStats = { activeMinutes: 0, idleMinutes: 0 };

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT_MS,
  headers: { 'Content-Type': 'application/json' },
});

// Register custom protocol for one-click deep link pairing from web
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('crm-tracker', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('crm-tracker');
}

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, commandLine) => {
    const deepLinkUrl = commandLine.find((arg) => typeof arg === 'string' && arg.startsWith('crm-tracker://'));
    if (deepLinkUrl) {
      handleDeepLink(deepLinkUrl);
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function getCurrentStatus() {
  if (forcedStatus) return forcedStatus;
  try {
    return powerMonitor.getSystemIdleTime() >= IDLE_THRESHOLD_SECONDS ? 'idle' : 'active';
  } catch (error) {
    console.error('Unable to read system idle time:', error);
    return 'offline';
  }
}

function getPublicState() {
  let currentIdleSeconds = 0;
  try {
    currentIdleSeconds = powerMonitor.getSystemIdleTime();
  } catch (_) {}

  return {
    authenticated: Boolean(session),
    user: session ? session.user : null,
    tracking,
    status: session && tracking ? getCurrentStatus() : 'offline',
    idleThresholdSeconds: IDLE_THRESHOLD_SECONDS,
    currentIdleSeconds,
    todayStats,
    lastError,
  };
}

function publishState() {
  const state = getPublicState();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('tracker:state', state);
  }
  updateTrayMenu();
}

function saveSession() {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Secure local token storage is unavailable on this computer.');
  }

  const serialized = JSON.stringify({
    token: session.token,
    expiresAt: session.expiresAt,
    user: session.user,
    tracking,
  });
  const encrypted = safeStorage.encryptString(serialized).toString('base64');
  const tempFile = `${SESSION_FILE}.tmp`;
  fs.mkdirSync(path.dirname(SESSION_FILE), { recursive: true });
  fs.writeFileSync(tempFile, JSON.stringify({ encrypted }), { mode: 0o600 });
  fs.renameSync(tempFile, SESSION_FILE);
}

function clearSavedSession() {
  try {
    fs.rmSync(SESSION_FILE, { force: true });
  } catch (error) {
    console.error('Unable to remove saved session:', error);
  }
}

function clearSession() {
  session = null;
  tracking = false;
  clearSavedSession();
  publishState();
}

function restoreSession() {
  if (!fs.existsSync(SESSION_FILE)) return;

  try {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Secure local token storage is unavailable on this computer.');
    }
    const saved = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
    const serialized = safeStorage.decryptString(Buffer.from(saved.encrypted, 'base64'));
    const data = JSON.parse(serialized);
    if (
      typeof data.token !== 'string' ||
      typeof data.expiresAt !== 'number' ||
      !data.user ||
      typeof data.user.id !== 'string' ||
      data.user.role !== 'employee'
    ) {
      throw new Error('Saved session data is invalid.');
    }
    if (data.expiresAt <= Date.now()) {
      clearSavedSession();
      return;
    }

    session = {
      token: data.token,
      expiresAt: data.expiresAt,
      user: data.user,
    };
    tracking = Boolean(data.tracking);
  } catch (error) {
    console.error('Unable to restore saved session:', error);
    clearSavedSession();
    lastError = 'Your saved login could not be restored. Please sign in again.';
  }
}

function authenticatedRequest(config) {
  if (!session) throw new Error('Sign in to continue.');
  if (session.expiresAt <= Date.now()) {
    clearSession();
    throw new Error('Your login has expired. Please sign in again.');
  }
  return api.request({
    ...config,
    headers: {
      ...config.headers,
      Authorization: `Bearer ${session.token}`,
    },
  });
}

async function sendHeartbeat(status = getCurrentStatus()) {
  if (!session || !tracking) return;
  const heartbeatSession = session;
  try {
    await authenticatedRequest({
      method: 'post',
      url: '/attendance/heartbeat',
      data: {
        userId: session.user.id,
        status,
        source: 'desktop',
        timestamp: new Date().toISOString(),
      },
    });
    if (status === 'active') todayStats.activeMinutes += 1;
    if (status === 'idle') todayStats.idleMinutes += 1;
    if (lastError) lastError = '';
    publishState();
  } catch (error) {
    if (session !== heartbeatSession) return;
    const statusCode = error.response && error.response.status;
    const message = error.response && error.response.data && error.response.data.error;
    if (statusCode === 401) {
      clearSession();
      lastError = 'Your login has expired. Please sign in again.';
    } else if (statusCode === 409) {
      tracking = false;
      try {
        saveSession();
      } catch (saveError) {
        console.error('Unable to save tracking state:', saveError);
      }
      lastError = message || 'Attendance is not open. Start tracking again after clocking in.';
    } else {
      lastError = message || error.message || 'Unable to send the tracking heartbeat.';
      console.error('Unable to send heartbeat:', error.message);
    }
    publishState();
  }
}

function startHeartbeatTimer() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(() => {
    void sendHeartbeat();
  }, HEARTBEAT_INTERVAL_MS);
}

async function syncAttendanceStatus() {
  if (!session) return;
  try {
    const res = await authenticatedRequest({ method: 'get', url: '/attendance/today' });
    const attendance = res.data && res.data.attendance;
    if (attendance) {
      todayStats = {
        activeMinutes: attendance.totalActiveMinutes || 0,
        idleMinutes: attendance.totalIdleMinutes || 0,
      };
    }
    const isClockedInOnServer = Boolean(attendance && attendance.checkIn && !attendance.checkOut);

    if (isClockedInOnServer && !tracking) {
      console.log('Employee clocked in on web portal. Starting activity tracking...');
      tracking = true;
      lastError = '';
      try {
        saveSession();
      } catch (err) {
        console.error('Unable to save tracking state:', err);
      }
      publishState();
      void sendHeartbeat();
    } else if (!isClockedInOnServer && tracking) {
      console.log('Employee clocked out on web portal. Stopping activity tracking...');
      tracking = false;
      lastError = '';
      try {
        saveSession();
      } catch (err) {
        console.error('Unable to save tracking state:', err);
      }
      publishState();
    }
  } catch (error) {
    const statusCode = error.response && error.response.status;
    if (statusCode === 401) {
      clearSession();
      lastError = 'Your login has expired. Please sign in again.';
      publishState();
    }
  }
}

function startSyncTimer() {
  if (syncTimer) clearInterval(syncTimer);
  syncTimer = setInterval(() => {
    void syncAttendanceStatus();
  }, SYNC_INTERVAL_MS);
  void syncAttendanceStatus();
}

function handleDeepLink(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return;
  try {
    const parsed = new URL(urlStr);
    const hostOrPath = (parsed.hostname || parsed.pathname || '').replace(/^\/+/, '');
    if (hostOrPath === 'login' || hostOrPath === 'auth') {
      const token = parsed.searchParams.get('token');
      const id = parsed.searchParams.get('id');
      const fullName = parsed.searchParams.get('name') || 'Employee';
      const email = parsed.searchParams.get('email') || '';

      if (token && id) {
        session = {
          token,
          expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
          user: { id, fullName, email, role: 'employee' },
        };
        tracking = false;
        lastError = '';
        saveSession();
        publishState();
        void syncAttendanceStatus();
        console.log(`Connected session via deep link for ${email}`);
      }
    }
  } catch (err) {
    console.error('Failed to parse deep link URL:', err);
  }
}

function createWindow(showWindow = true) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 390,
    height: 510,
    minWidth: 350,
    minHeight: 450,
    resizable: true,
    title: 'Employee Tracker',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.once('ready-to-show', () => {
    if (showWindow) mainWindow.show();
    publishState();
  });
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function makeTrayIcon() {
  const icoPath = path.join(__dirname, 'icon.ico');
  if (fs.existsSync(icoPath)) {
    const img = nativeImage.createFromPath(icoPath);
    if (!img.isEmpty()) return img;
  }
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">',
    '<rect x="2" y="2" width="28" height="28" rx="8" fill="#2563eb"/>',
    '<circle cx="16" cy="16" r="8" fill="none" stroke="#fff" stroke-width="3"/>',
    '<path d="M16 11v5l4 2" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/>',
    '</svg>',
  ].join('');
  return nativeImage.createFromDataURL(
    `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
  );
}

function updateTrayMenu() {
  if (!tray) return;
  const stateLabel = session
    ? tracking
      ? `Tracking: ${getCurrentStatus()}`
      : 'Signed in — tracking stopped'
    : 'Not signed in';

  tray.setToolTip(`Employee Tracker — ${stateLabel}`);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: stateLabel, enabled: false },
      { type: 'separator' },
      { label: 'Open Employee Tracker', click: createWindow },
      {
        label: 'Quit',
        click: () => {
          void quitApplication();
        },
      },
    ])
  );
}

async function login({ email, password }) {
  if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
    throw new Error('Enter your work email and password.');
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Secure local token storage is unavailable on this computer.');
  }

  let response;
  try {
    response = await api.post('/auth/login', {
      email: email.trim(),
      password,
    });
  } catch (err) {
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
      throw new Error(`Unable to connect to server (${API_BASE_URL}). Please verify your internet connection.`);
    }
    const message = err.response && err.response.data && err.response.data.error;
    throw new Error(message || err.message || 'Invalid email or password.');
  }
  const { token, expiresIn, user } = response.data;
  if (
    typeof token !== 'string' ||
    !user ||
    typeof user.id !== 'string' ||
    user.role !== 'employee'
  ) {
    throw new Error('This desktop app is for employee accounts only.');
  }

  const durationMatch = /^(\d+)(s|m|h|d|y)?$/.exec(expiresIn || '3650d');
  if (!durationMatch) throw new Error('The server returned an unsupported token expiry.');
  const multiplier = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000, y: 31_536_000_000 }[durationMatch[2] || 'd'] || 86_400_000;
  session = {
    token,
    expiresAt: Date.now() + Number(durationMatch[1]) * multiplier,
    user,
  };
  tracking = false;
  lastError = '';
  try {
    saveSession();
  } catch (error) {
    clearSession();
    throw error;
  }
  publishState();
  return getPublicState();
}

async function beginTracking() {
  if (!session) throw new Error('Sign in before starting tracking.');
  if (tracking) return getPublicState();

  try {
    await authenticatedRequest({ method: 'post', url: '/attendance/clock-in' });
  } catch (error) {
    const statusCode = error.response && error.response.status;
    if (statusCode === 409) {
      try {
        const todayRes = await authenticatedRequest({ method: 'get', url: '/attendance/today' });
        const att = todayRes.data && todayRes.data.attendance;
        if (att && att.checkIn) {
          // Attendance record exists for today - safe to resume tracking
        } else {
          const message = error.response && error.response.data && error.response.data.error;
          throw new Error(message || 'Attendance is not open.');
        }
      } catch (innerErr) {
        const message = error.response && error.response.data && error.response.data.error;
        throw new Error(message || error.message || 'Unable to clock in.');
      }
    } else {
      const message = error.response && error.response.data && error.response.data.error;
      throw new Error(message || error.message || 'Unable to clock in.');
    }
  }

  tracking = true;
  lastError = '';
  try {
    saveSession();
  } catch (error) {
    tracking = false;
    throw error;
  }
  publishState();
  void sendHeartbeat();
  return getPublicState();
}

async function endTracking() {
  if (!session || !tracking) return getPublicState();
  try {
    await authenticatedRequest({ method: 'post', url: '/attendance/clock-out' });
  } catch (error) {
    const message = error.response && error.response.data && error.response.data.error;
    throw new Error(message || error.message || 'Unable to clock out.');
  }

  tracking = false;
  lastError = '';
  saveSession();
  publishState();
  return getPublicState();
}

async function logout() {
  let clockOutWarning = '';
  if (session && tracking) {
    try {
      await authenticatedRequest({ method: 'post', url: '/attendance/clock-out' });
    } catch (error) {
      const message = error.response && error.response.data && error.response.data.error;
      clockOutWarning = `You were signed out, but clock-out failed: ${message || error.message}`;
    }
  }
  clearSession();
  lastError = clockOutWarning;
  publishState();
  return getPublicState();
}

let isCleanedUp = false;

async function quitApplication() {
  if (isQuitting) return;
  isQuitting = true;
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  if (syncTimer) clearInterval(syncTimer);
  if (!isCleanedUp && session && tracking) {
    isCleanedUp = true;
    try {
      await Promise.race([
        authenticatedRequest({ method: 'post', url: '/attendance/clock-out' }),
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ]);
      tracking = false;
      saveSession();
    } catch (error) {
      console.error('Unable to auto clock out on quit:', error.message);
    }
  }
  app.quit();
}

function configureAutoLaunch() {
  const enabled = process.env.AUTO_LAUNCH === 'true';
  if (process.defaultApp && process.argv.length >= 2) return;
  app.setLoginItemSettings({
    openAtLogin: enabled,
    openAsHidden: true,
    args: enabled ? ['--hidden'] : [],
  });
}

ipcMain.handle('tracker:get-state', () => getPublicState());
ipcMain.handle('tracker:login', async (_event, credentials) => login(credentials));
ipcMain.handle('tracker:start', () => beginTracking());
ipcMain.handle('tracker:stop', () => endTracking());
ipcMain.handle('tracker:logout', () => logout());

app.whenReady().then(() => {
  restoreSession();
  configureAutoLaunch();
  tray = new Tray(makeTrayIcon());
  tray.on('click', () => createWindow());
  updateTrayMenu();
  startHeartbeatTimer();
  startSyncTimer();

  const startupUrl = process.argv.find((arg) => typeof arg === 'string' && arg.startsWith('crm-tracker://'));
  if (startupUrl) {
    handleDeepLink(startupUrl);
  }

  powerMonitor.on('lock-screen', () => {
    forcedStatus = 'idle';
    void sendHeartbeat('idle');
    publishState();
  });
  powerMonitor.on('unlock-screen', () => {
    forcedStatus = null;
    publishState();
    void sendHeartbeat();
  });
  powerMonitor.on('suspend', () => {
    forcedStatus = 'offline';
    void sendHeartbeat('offline');
    publishState();
  });
  powerMonitor.on('resume', () => {
    forcedStatus = null;
    publishState();
    void syncAttendanceStatus();
    void sendHeartbeat();
  });
  powerMonitor.on('shutdown', async () => {
    if (session && tracking) {
      try {
        await Promise.race([
          authenticatedRequest({ method: 'post', url: '/attendance/clock-out' }),
          new Promise((resolve) => setTimeout(resolve, 3000)),
        ]);
        tracking = false;
        saveSession();
      } catch (err) {
        console.error('Unable to auto clock out on shutdown:', err.message);
      }
    }
  });

  createWindow(!process.argv.includes('--hidden'));
  if (tracking) void sendHeartbeat();
});

app.on('open-url', (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});

app.on('activate', createWindow);
app.on('before-quit', async (event) => {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  if (syncTimer) clearInterval(syncTimer);
  if (!isCleanedUp && session && tracking) {
    event.preventDefault();
    isQuitting = true;
    isCleanedUp = true;
    try {
      await Promise.race([
        authenticatedRequest({ method: 'post', url: '/attendance/clock-out' }),
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ]);
      tracking = false;
      saveSession();
    } catch (err) {
      console.error('Clock out before-quit error:', err.message);
    } finally {
      app.quit();
    }
  } else {
    isQuitting = true;
  }
});
