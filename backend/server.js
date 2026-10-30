require('dotenv').config();

const cors = require('cors');
const express = require('express');
const { createServer } = require('node:http');
const mongoose = require('mongoose');
const { connectToDatabase } = require('./db');
const { attachRealtime, isAllowedOrigin } = require('./realtime');

const attendanceRoutes = require('./routes/attendanceRoutes');
const authRoutes = require('./routes/authRoutes');
const leadRoutes = require('./routes/leadRoutes');
const taskRoutes = require('./routes/taskRoutes');

const app = express();

const allowedOrigins = (process.env.CORS_ORIGINS
  || 'https://crm-frontend-cyan-six.vercel.app,http://localhost:3000,http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.disable('x-powered-by');
app.use(
  cors({
    origin(origin, callback) {
      if (isAllowedOrigin(origin, allowedOrigins)) {
        return callback(null, true);
      }
      return callback(Object.assign(new Error('Origin is not allowed by CORS.'), { status: 403 }));
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.use(express.json({ limit: '100kb' }));

function validateEnvironment() {
  if (!process.env.JWT_SECRET || Buffer.byteLength(process.env.JWT_SECRET, 'utf8') < 32) {
    throw new Error('JWT_SECRET must be set to a secret containing at least 32 bytes.');
  }
}

app.use(async (_req, _res, next) => {
  validateEnvironment();
  await connectToDatabase();
  next();
});

app.get('/', (_req, res) => {
  res.json({ message: 'CRM & Attendance API is running.' });
});

app.use('/api/auth', authRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/leads', leadRoutes);

app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found.' });
});

app.use((error, _req, res, _next) => {
  if (res.headersSent) {
    return;
  }

  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body must contain valid JSON.' });
  }

  if (error.name === 'ValidationError' || error.name === 'CastError' || error.code === 11000) {
    return res.status(400).json({ error: 'Request data is invalid or conflicts with an existing record.' });
  }

  const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 600
    ? error.status
    : 500;
  if (status >= 500) {
    console.error('API request failed:', error);
  }
  return res.status(status).json({
    error: status >= 500 ? 'An unexpected server error occurred.' : error.message,
  });
});

async function startServer() {
  validateEnvironment();
  await connectToDatabase();
  console.log(`Connected to MongoDB database "${mongoose.connection.name}"`);

  const port = Number(process.env.PORT) || 5000;
  const server = createServer(app);
  app.set('io', attachRealtime(server, allowedOrigins));
  server.listen(port, () => {
    console.log(`Backend running on port ${port}`);
  });

  const shutdown = (signal) => {
    console.log(`${signal} received; shutting down.`);
    app.get('io').close(async () => {
      try {
        await mongoose.disconnect();
      } catch (disconnectError) {
        console.error('MongoDB shutdown failed:', disconnectError);
        process.exitCode = 1;
      }
    });
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  return server;
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error('Backend startup failed:', error);
    process.exitCode = 1;
  });
}

module.exports = app;
module.exports.startServer = startServer;
