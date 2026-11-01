const loginView = document.getElementById('login-view');
const statusView = document.getElementById('status-view');
const loginForm = document.getElementById('login-form');
const message = document.getElementById('message');
const trackingButton = document.getElementById('tracking-button');
const logoutButton = document.getElementById('logout-button');

function render(state) {
  loginView.hidden = state.authenticated;
  statusView.hidden = !state.authenticated;
  message.textContent = state.lastError || '';

  if (!state.authenticated) return;
  document.getElementById('employee-name').textContent = state.user.fullName || 'Employee';
  document.getElementById('employee-email').textContent = state.user.email || '';

  const status = state.tracking ? state.status : 'offline';
  document.getElementById('current-status').textContent = status;
  document.getElementById('status-pill').textContent = state.tracking
    ? status
    : 'Not tracking';
  document.getElementById('status-pill').className = `status-pill ${state.tracking ? status : ''}`;
  document.querySelector('.status-dot').className = `status-dot ${state.tracking ? status : ''}`;
  document.getElementById('status-detail').textContent = state.tracking
    ? status === 'idle'
      ? `No input detected for ${Math.floor(state.idleThresholdSeconds / 60)} minutes or more.`
      : status === 'offline'
        ? 'The computer is locked, asleep, or disconnected.'
        : 'System activity detected (Mouse & keyboard active).'
    : 'Waiting for Clock In on CRM website (or click Start tracking below).';

  trackingButton.textContent = state.tracking ? 'End tracking' : 'Start tracking';
  trackingButton.className = `button ${state.tracking ? 'secondary' : 'primary'}`;
}

function showError(error) {
  message.textContent = error.message || 'Something went wrong.';
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submitButton = loginForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  message.textContent = '';
  try {
    const form = new FormData(loginForm);
    const state = await window.tracker.login({
      email: form.get('email'),
      password: form.get('password'),
    });
    loginForm.reset();
    render(state);
  } catch (error) {
    showError(error);
  } finally {
    submitButton.disabled = false;
  }
});

trackingButton.addEventListener('click', async () => {
  trackingButton.disabled = true;
  message.textContent = '';
  try {
    render(
      trackingButton.textContent === 'End tracking'
        ? await window.tracker.stop()
        : await window.tracker.start()
    );
  } catch (error) {
    showError(error);
  } finally {
    trackingButton.disabled = false;
  }
});

logoutButton.addEventListener('click', async () => {
  logoutButton.disabled = true;
  try {
    render(await window.tracker.logout());
  } catch (error) {
    showError(error);
  } finally {
    logoutButton.disabled = false;
  }
});

window.tracker.onStateChange(render);
window.tracker.getState().then(render).catch(showError);
