const express = require('express');
const mongoose = require('mongoose');

const Attendance = require('../models/Attendance');
const Heartbeat = require('../models/Heartbeat');
const User = require('../models/User');
const { authMiddleware, isAdmin, isEmployee } = require('../middleware/authMiddleware');
const { publishWorkspaceChange } = require('../realtime');

const router = express.Router();
const HEARTBEAT_TIMEOUT_MS = 2 * 60 * 1000;

function utcDayStart(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

router.post('/clock-in', authMiddleware, isEmployee, async (req, res) => {
  const date = utcDayStart();
  try {
    const checkInTime = new Date();
    const attendance = await Attendance.create({
      userId: req.user.id,
      date,
      checkIn: checkInTime,
    });

    // Create an immediate active heartbeat so the status shows 'active' immediately
    await Heartbeat.create({
      userId: req.user.id,
      status: 'active',
      timestamp: checkInTime,
    });

    publishWorkspaceChange(req, 'attendance', {
      action: 'clock-in',
      userId: req.user.id,
      checkIn: checkInTime,
      status: 'active',
    });

    return res.status(201).json({ attendance });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: 'You have already clocked in today.' });
    }
    throw error;
  }
});

router.post('/clock-out', authMiddleware, isEmployee, async (req, res) => {
  const date = utcDayStart();
  const attendance = await Attendance.findOne({
    userId: req.user.id,
    date,
    checkOut: null,
    checkIn: { $ne: null },
  });

  if (!attendance) {
    return res.status(409).json({ error: 'There is no open attendance record for today.' });
  }

  const checkOut = new Date();
  const totals = await Heartbeat.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(req.user.id),
        timestamp: { $gte: attendance.checkIn, $lte: checkOut },
        status: { $in: ['active', 'idle'] },
      },
    },
    { $group: { _id: '$status', minutes: { $sum: 1 } } },
  ]);
  const summary = totals.reduce(
    (result, item) => {
      if (item._id === 'active') result.totalActiveMinutes = item.minutes;
      if (item._id === 'idle') result.totalIdleMinutes = item.minutes;
      return result;
    },
    { totalActiveMinutes: 0, totalIdleMinutes: 0 }
  );

  const updated = await Attendance.findOneAndUpdate(
    { _id: attendance._id, checkOut: null },
    { $set: { checkOut, ...summary } },
    { new: true, runValidators: true }
  );
  if (!updated) {
    return res.status(409).json({ error: 'Attendance has already been checked out.' });
  }

  // Create an immediate offline heartbeat
  await Heartbeat.create({
    userId: req.user.id,
    status: 'offline',
    timestamp: checkOut,
  });

  publishWorkspaceChange(req, 'attendance', {
    action: 'clock-out',
    userId: req.user.id,
    checkOut,
    status: 'offline',
    summary,
  });

  return res.json({ attendance: updated, summary });
});

router.post('/heartbeat', authMiddleware, isEmployee, async (req, res) => {
  const { status } = req.body || {};
  if (!['active', 'idle', 'offline'].includes(status)) {
    return res.status(400).json({ error: 'Status must be active, idle, or offline.' });
  }

  const attendance = await Attendance.findOne({
    userId: req.user.id,
    date: utcDayStart(),
    checkIn: { $ne: null },
    checkOut: null,
  }).select('_id');
  if (!attendance) {
    return res.status(409).json({ error: 'Clock in before sending a heartbeat.' });
  }

  const heartbeat = await Heartbeat.create({
    userId: req.user.id,
    status,
    timestamp: new Date(),
  });

  publishWorkspaceChange(req, 'attendance', {
    action: 'heartbeat',
    userId: req.user.id,
    status,
    timestamp: heartbeat.timestamp,
  });

  return res.status(201).json({ heartbeat });
});

router.get('/today', authMiddleware, isEmployee, async (req, res) => {
  const attendance = await Attendance.findOne({
    userId: req.user.id,
    date: utcDayStart(),
  }).lean();
  return res.json({ attendance });
});

router.get('/daily', authMiddleware, isAdmin, async (_req, res) => {
  const date = utcDayStart();
  const cutoff = new Date(Date.now() - HEARTBEAT_TIMEOUT_MS);
  const employees = await User.find({ role: 'employee', isActive: { $ne: false } })
    .select('_id fullName email')
    .sort({ fullName: 1 })
    .lean();
  const employeeIds = employees.map((employee) => employee._id);

  const [attendanceRecords, heartbeatStats] = await Promise.all([
    Attendance.find({ userId: { $in: employeeIds }, date })
      .select('userId checkIn checkOut totalActiveMinutes totalIdleMinutes')
      .lean(),
    employeeIds.length
      ? Heartbeat.aggregate([
          { $match: { userId: { $in: employeeIds }, timestamp: { $gte: date } } },
          { $sort: { timestamp: -1 } },
          {
            $group: {
              _id: '$userId',
              status: { $first: '$status' },
              timestamp: { $first: '$timestamp' },
              activeSamples: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
              idleSamples: { $sum: { $cond: [{ $eq: ['$status', 'idle'] }, 1, 0] } },
            },
          },
        ])
      : [],
  ]);

  const attendanceByUser = new Map(attendanceRecords.map((record) => [record.userId.toString(), record]));
  const heartbeatByUser = new Map(heartbeatStats.map((heartbeat) => [heartbeat._id.toString(), heartbeat]));
  const records = employees.map((employee) => {
    const attendance = attendanceByUser.get(employee._id.toString());
    const heartbeat = heartbeatByUser.get(employee._id.toString());
    const clockedIn = Boolean(attendance?.checkIn && !attendance.checkOut);
    const isFresh = clockedIn && heartbeat && heartbeat.timestamp >= cutoff;
    return {
      user: employee,
      status: isFresh ? heartbeat.status : 'offline',
      clockedIn,
      checkIn: attendance?.checkIn || null,
      checkOut: attendance?.checkOut || null,
      activeMinutes: attendance?.checkOut
        ? attendance.totalActiveMinutes
        : heartbeat?.activeSamples || 0,
      idleMinutes: attendance?.checkOut
        ? attendance.totalIdleMinutes
        : heartbeat?.idleSamples || 0,
      lastHeartbeatAt: heartbeat?.timestamp || null,
    };
  });

  return res.json({ date, employees: records, total: records.length });
});

router.get('/live', authMiddleware, isAdmin, async (_req, res) => {
  const cutoff = new Date(Date.now() - HEARTBEAT_TIMEOUT_MS);
  const employees = await User.find({ role: 'employee', isActive: { $ne: false } })
    .select('_id fullName email')
    .sort({ fullName: 1 })
    .lean();
  const employeeIds = employees.map((employee) => employee._id);
  const [latestHeartbeats, openAttendance] = await Promise.all([
    employeeIds.length
      ? Heartbeat.aggregate([
          { $match: { userId: { $in: employeeIds } } },
          { $sort: { userId: 1, timestamp: -1 } },
          {
            $group: {
              _id: '$userId',
              status: { $first: '$status' },
              timestamp: { $first: '$timestamp' },
            },
          },
        ])
      : [],
    employeeIds.length
      ? Attendance.find({
          userId: { $in: employeeIds },
          date: utcDayStart(),
          checkIn: { $ne: null },
          checkOut: null,
        }).select('userId').lean()
      : [],
  ]);

  const latestByUser = new Map(latestHeartbeats.map((heartbeat) => [heartbeat._id.toString(), heartbeat]));
  const clockedInIds = new Set(openAttendance.map((record) => record.userId.toString()));
  const live = employees.map((employee) => {
    const heartbeat = latestByUser.get(employee._id.toString());
    const clockedIn = clockedInIds.has(employee._id.toString());
    const isFresh = clockedIn && heartbeat && heartbeat.timestamp >= cutoff;
    return {
      user: employee,
      status: isFresh ? heartbeat.status : 'offline',
      clockedIn,
      lastHeartbeatAt: heartbeat ? heartbeat.timestamp : null,
    };
  });
  return res.json({ employees: live });
});

module.exports = router;
