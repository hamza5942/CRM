const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { Server } = require('socket.io');

const User = require('./models/User');

function isAllowedOrigin(origin, allowedOrigins = []) {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  // Allow all localhost and 127.0.0.1 variants on any port
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  // Allow Vercel preview and production deployments
  if (/^https:\/\/[a-zA-Z0-9_-]+\.vercel\.app$/.test(origin)) return true;
  // Allow codexsolutions.pro and any subdomains (*.codexsolutions.pro)
  if (/^https?:\/\/([a-zA-Z0-9_-]+\.)?codexsolutions\.pro$/.test(origin)) return true;
  return false;
}

function attachRealtime(server, allowedOrigins = []) {
  const io = new Server(server, {
    cors: {
      origin(origin, callback) {
        if (isAllowedOrigin(origin, allowedOrigins)) {
          return callback(null, true);
        }
        return callback(new Error('Origin is not allowed by CORS.'));
      },
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    pingInterval: 15000,
    pingTimeout: 10000,
  });

  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '');

      if (typeof token !== 'string' || !token) {
        return next(new Error('Authentication is required.'));
      }

      const payload = jwt.verify(token, process.env.JWT_SECRET);
      if (typeof payload !== 'object' || !payload.sub || !mongoose.isValidObjectId(payload.sub)) {
        return next(new Error('The authentication token is invalid.'));
      }

      const user = await User.findOne({ _id: payload.sub, isActive: { $ne: false } })
        .select('_id role fullName email')
        .lean();
      if (!user || !['admin', 'employee'].includes(user.role)) {
        return next(new Error('This account is no longer active.'));
      }

      socket.data.user = {
        id: user._id.toString(),
        role: user.role,
        fullName: user.fullName,
        email: user.email,
      };
      return next();
    } catch (error) {
      console.warn('Realtime socket authentication rejected:', error.message);
      return next(error);
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;
    if (user?.role === 'admin') {
      socket.join('admins');
    }
    if (user?.id) {
      socket.join(`user:${user.id}`);
    }

    socket.on('disconnect', () => {
      // Disconnected cleanly
    });
  });

  return io;
}

function publishWorkspaceChange(reqOrIo, resource, data = {}) {
  const io = reqOrIo && reqOrIo.app ? reqOrIo.app.get('io') : reqOrIo;
  if (!io) return;

  const payload = {
    resource,
    timestamp: new Date().toISOString(),
    ...data,
  };

  // Broadcast to all connected clients
  io.emit('workspace:changed', payload);

  // Resource-specific events for targeted listeners
  if (resource === 'attendance') {
    io.emit('attendance:updated', payload);
  } else if (resource === 'tasks') {
    io.emit('tasks:updated', payload);
  } else if (resource === 'leads') {
    io.emit('leads:updated', payload);
  } else if (resource === 'leaves') {
    io.emit('leaves:updated', payload);
  } else if (resource === 'employees') {
    io.emit('employees:updated', payload);
  }
}

module.exports = { attachRealtime, publishWorkspaceChange, isAllowedOrigin };
