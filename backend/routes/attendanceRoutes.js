const express = require('express');
const mongoose = require('mongoose');

const Attendance = require('../models/Attendance');
const Heartbeat = require('../models/Heartbeat');
const User = require('../models/User');
const { authMiddleware, isEmployee } = require('../middleware/authMiddleware');
const { publishWorkspaceChange } = require('../realtime');

const router = express.Router();
const HEARTBEAT_TIMEOUT_MS = 2 * 60 * 1000;
const AUTO_CLOCKOUT_MINUTES = Math.max(5, Number(process.env.AUTO_CLOCKOUT_MINUTES || 15));
const AUTO_CLOCKOUT_MS = AUTO_CLOCKOUT_MINUTES * 60 * 1000;

function utcDayStart(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

async function calculateAttendanceMinutes(userId, startTime, endTime = new Date()) {
  const totals = await Heartbeat.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        timestamp: { $gte: startTime, $lte: endTime },
        status: { $in: ['active', 'idle'] },
      },
    },
    {
      $group: {
        _id: {
          $dateToString: { format: '%Y-%m-%d %H:%M', date: '$timestamp' },
        },
        hasActive: { $max: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
      },
    },
    {
      $group: {
        _id: null,
        totalActiveMinutes: { $sum: '$hasActive' },
        totalIdleMinutes: { $sum: { $cond: [{ $eq: ['$hasActive', 1] }, 0, 1] } },
      },
    },
  ]);
  const summary = totals[0] || { totalActiveMinutes: 0, totalIdleMinutes: 0 };
  return {
    totalActiveMinutes: summary.totalActiveMinutes || 0,
    totalIdleMinutes: summary.totalIdleMinutes || 0,
  };
}

/**
 * Reconciles open attendance sessions where the user's PC was shut off, slept,
 * or lost network without a clean clock-out.
 *
 * If no heartbeat has arrived for >= AUTO_CLOCKOUT_MS (default 15 minutes)
 * or if the session belongs to a previous day, this automatically clocks the user out.
 * The checkout time is backdated to the exact second of their last known heartbeat,
 * ensuring no phantom hours are accrued while the PC was off.
 */
async function autoCloseStaleAttendance(targetUserId = null, req = null) {
  try {
    const now = new Date();
    const todayStart = utcDayStart(now);

    const filter = {
      checkIn: { $ne: null },
      checkOut: null,
    };
    if (targetUserId) {
      filter.userId = new mongoose.Types.ObjectId(targetUserId);
    }

    const openRecords = await Attendance.find(filter).lean();
    if (!openRecords.length) return [];

    const closedRecords = [];

    for (const record of openRecords) {
      const latestHeartbeat = await Heartbeat.findOne({
        userId: record.userId,
        timestamp: { $gte: record.checkIn },
      })
        .sort({ timestamp: -1 })
        .lean();

      const lastActivityTime = latestHeartbeat?.timestamp
        ? new Date(latestHeartbeat.timestamp)
        : record.lastHeartbeatAt
        ? new Date(record.lastHeartbeatAt)
        : new Date(record.checkIn);

      const msSinceActivity = now.getTime() - lastActivityTime.getTime();
      const isPastDay = new Date(record.date).getTime() < todayStart.getTime();
      const isStale = msSinceActivity >= AUTO_CLOCKOUT_MS;

      if (isStale || isPastDay) {
        const checkOut = new Date(Math.max(lastActivityTime.getTime(), new Date(record.checkIn).getTime()));
        const summary = await calculateAttendanceMinutes(record.userId, record.checkIn, checkOut);

        const updated = await Attendance.findOneAndUpdate(
          { _id: record._id, checkOut: null },
          {
            $set: {
              checkOut,
              totalActiveMinutes: summary.totalActiveMinutes,
              totalIdleMinutes: summary.totalIdleMinutes,
              autoClockedOut: true,
              autoClockedOutReason: isPastDay ? 'day_ended' : 'inactivity_timeout',
            },
          },
          { new: true }
        );

        if (updated) {
          await Heartbeat.create({
            userId: record.userId,
            status: 'offline',
            source: 'system',
            timestamp: checkOut,
          });

          try {
            publishWorkspaceChange(req, 'attendance', {
              action: 'clock-out',
              userId: record.userId.toString(),
              checkOut,
              status: 'offline',
              summary,
              autoClockedOut: true,
              reason: isPastDay ? 'day_ended' : 'inactivity_timeout',
            });
          } catch (_) {}

          closedRecords.push(updated);
        }
      }
    }

    return closedRecords;
  } catch (error) {
    console.error('Error auto-closing stale attendance:', error.message);
    return [];
  }
}

// Background sweep for environments with long-lived processes (e.g. VPS, local dev, Docker)
setInterval(() => {
  autoCloseStaleAttendance().catch((err) => {
    console.error('Background auto-clockout sweep failed:', err.message);
  });
}, 2 * 60 * 1000);

router.post('/clock-in', authMiddleware, isEmployee, async (req, res) => {
  const date = utcDayStart();
  const checkInTime = new Date();

  // Check if today's record already exists
  let attendance = await Attendance.findOne({ userId: req.user.id, date });

  if (attendance) {
    if (!attendance.checkOut) {
      // Already clocked in and currently active
      return res.json({ attendance, message: 'Already clocked in.' });
    }

    // Previously clocked out today; resume the day's attendance
    attendance.checkOut = null;
    attendance.autoClockedOut = false;
    attendance.autoClockedOutReason = undefined;
    attendance.lastHeartbeatAt = checkInTime;
    attendance.lastHeartbeatSource = 'desktop';
    await attendance.save();

    await Heartbeat.create({
      userId: req.user.id,
      status: 'active',
      source: 'desktop',
      timestamp: checkInTime,
    });

    publishWorkspaceChange(req, 'attendance', {
      action: 'clock-in',
      userId: req.user.id,
      checkIn: attendance.checkIn || checkInTime,
      status: 'active',
    });

    return res.json({ attendance, message: 'Resumed attendance for today.' });
  }

  try {
    attendance = await Attendance.create({
      userId: req.user.id,
      date,
      checkIn: checkInTime,
      lastHeartbeatAt: checkInTime,
      lastHeartbeatSource: 'desktop',
      autoClockedOut: false,
    });

    // Create an immediate active heartbeat so the status shows 'active' immediately
    await Heartbeat.create({
      userId: req.user.id,
      status: 'active',
      source: 'desktop',
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
      const existing = await Attendance.findOne({ userId: req.user.id, date });
      return res.json({ attendance: existing });
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
  const summary = await calculateAttendanceMinutes(req.user.id, attendance.checkIn, checkOut);

  const updated = await Attendance.findOneAndUpdate(
    { _id: attendance._id, checkOut: null },
    {
      $set: {
        checkOut,
        ...summary,
        autoClockedOut: false,
        autoClockedOutReason: null,
      },
    },
    { new: true, runValidators: true }
  );
  if (!updated) {
    return res.status(409).json({ error: 'Attendance has already been checked out.' });
  }

  // Create an immediate offline heartbeat
  await Heartbeat.create({
    userId: req.user.id,
    status: 'offline',
    source: 'desktop',
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
  const { status, source = 'desktop' } = req.body || {};
  if (!['active', 'idle', 'offline'].includes(status)) {
    return res.status(400).json({ error: 'Status must be active, idle, or offline.' });
  }

  const attendance = await Attendance.findOne({
    userId: req.user.id,
    date: utcDayStart(),
    checkIn: { $ne: null },
    checkOut: null,
  });
  if (!attendance) {
    return res.status(409).json({ error: 'Clock in before sending a heartbeat.' });
  }

  const now = new Date();

  // Desktop precedence check:
  // If desktop app is actively running (sent a heartbeat within last 90s), ignore browser tab heartbeats
  // so browser doesn't override desktop OS idle detection or duplicate pulses.
  const hasRecentDesktop =
    attendance.lastHeartbeatSource === 'desktop' &&
    attendance.lastHeartbeatAt &&
    now.getTime() - new Date(attendance.lastHeartbeatAt).getTime() < 90000;

  if (source === 'web' && hasRecentDesktop) {
    return res.json({ message: 'Desktop tracker active, web pulse bypassed.' });
  }

  const heartbeat = await Heartbeat.create({
    userId: req.user.id,
    status,
    source,
    timestamp: now,
  });

  // Deduplication check: only increment minutes if >= 45s since last counted heartbeat
  const timeSinceLast = attendance.lastHeartbeatAt
    ? now.getTime() - new Date(attendance.lastHeartbeatAt).getTime()
    : Infinity;

  const updateDoc = {
    $set: {
      lastHeartbeatAt: now,
      lastHeartbeatSource: source,
    },
  };

  if (timeSinceLast >= 45000) {
    if (status === 'active') {
      updateDoc.$inc = { totalActiveMinutes: 1 };
    } else if (status === 'idle') {
      updateDoc.$inc = { totalIdleMinutes: 1 };
    }
  }

  await Attendance.updateOne({ _id: attendance._id }, updateDoc);

  publishWorkspaceChange(req, 'attendance', {
    action: 'heartbeat',
    userId: req.user.id,
    status,
    source,
    timestamp: heartbeat.timestamp,
  });

  return res.status(201).json({ heartbeat });
});

router.get('/today', authMiddleware, async (req, res) => {
  await autoCloseStaleAttendance(req.user.id, req);

  const attendance = await Attendance.findOne({
    userId: req.user.id,
    date: utcDayStart(),
  }).lean();

  if (attendance && attendance.checkIn && !attendance.checkOut) {
    const summary = await calculateAttendanceMinutes(req.user.id, attendance.checkIn, new Date());
    attendance.totalActiveMinutes = summary.totalActiveMinutes;
    attendance.totalIdleMinutes = summary.totalIdleMinutes;
  }

  return res.json({ attendance });
});

/**
 * Personal Attendance History:
 * - Employees can access ONLY their own attendance history across all days.
 * - Admins can optionally pass ?userId=... to see an employee's history.
 */
router.get('/history', authMiddleware, async (req, res) => {
  const isUserAdmin = req.user.role === 'admin';
  const targetUserId = isUserAdmin && req.query.userId ? req.query.userId : req.user.id;

  if (!mongoose.isValidObjectId(targetUserId)) {
    return res.status(400).json({ error: 'The specified user ID is invalid.' });
  }

  await autoCloseStaleAttendance(targetUserId, req);

  const filter = { userId: new mongoose.Types.ObjectId(targetUserId) };

  if (req.query.startDate || req.query.endDate) {
    filter.date = {};
    if (req.query.startDate) {
      filter.date.$gte = utcDayStart(new Date(req.query.startDate));
    }
    if (req.query.endDate) {
      filter.date.$lte = utcDayStart(new Date(req.query.endDate));
    }
  }

  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));

  const [records, total] = await Promise.all([
    Attendance.find(filter)
      .sort({ date: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Attendance.countDocuments(filter),
  ]);

  const todayStart = utcDayStart();
  const cutoff = new Date(Date.now() - HEARTBEAT_TIMEOUT_MS);

  // If today's attendance is ongoing, calculate live active/idle minutes
  const formattedRecords = await Promise.all(
    records.map(async (record) => {
      const isToday = new Date(record.date).getTime() === todayStart.getTime();
      let activeMinutes = record.totalActiveMinutes || 0;
      let idleMinutes = record.totalIdleMinutes || 0;
      let status = record.checkOut ? 'completed' : record.checkIn ? 'in_progress' : 'absent';

      if (isToday && !record.checkOut && record.checkIn) {
        const latestHeartbeat = await Heartbeat.findOne({
          userId: targetUserId,
          timestamp: { $gte: record.checkIn },
        })
          .sort({ timestamp: -1 })
          .lean();

        const isFresh = latestHeartbeat && latestHeartbeat.timestamp >= cutoff;
        status = isFresh ? latestHeartbeat.status : 'in_progress';

        const summary = await calculateAttendanceMinutes(targetUserId, record.checkIn, new Date());
        activeMinutes = summary.totalActiveMinutes;
        idleMinutes = summary.totalIdleMinutes;
      }

      return {
        _id: record._id,
        date: record.date,
        checkIn: record.checkIn || null,
        checkOut: record.checkOut || null,
        activeMinutes,
        idleMinutes,
        totalMinutes: activeMinutes + idleMinutes,
        status,
        autoClockedOut: Boolean(record.autoClockedOut),
        autoClockedOutReason: record.autoClockedOutReason || null,
      };
    })
  );

  // Aggregate overview statistics for this employee
  const allUserRecords = await Attendance.find({ userId: targetUserId })
    .select('totalActiveMinutes totalIdleMinutes checkIn checkOut')
    .lean();

  const totalActiveMinutes = allUserRecords.reduce((sum, r) => sum + (r.totalActiveMinutes || 0), 0);
  const totalIdleMinutes = allUserRecords.reduce((sum, r) => sum + (r.totalIdleMinutes || 0), 0);
  const completedDays = allUserRecords.filter((r) => r.checkIn && r.checkOut).length;

  return res.json({
    records: formattedRecords,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
    summary: {
      totalDaysPresent: total,
      completedDays,
      totalActiveMinutes,
      totalIdleMinutes,
      averageActiveMinutes: total > 0 ? Math.round(totalActiveMinutes / total) : 0,
    },
  });
});

/**
 * Daily Attendance:
 * - Admin: lists all registered employees for the specified date.
 * - Employee: securely lists ONLY their own attendance for that date.
 */
router.get('/daily', authMiddleware, async (req, res) => {
  let date = utcDayStart();
  if (req.query.date) {
    const parsed = new Date(req.query.date);
    if (!isNaN(parsed.getTime())) {
      date = utcDayStart(parsed);
    }
  }

  if (req.user.role === 'employee') {
    await autoCloseStaleAttendance(req.user.id, req);
  } else {
    await autoCloseStaleAttendance(null, req);
  }

  const cutoff = new Date(Date.now() - HEARTBEAT_TIMEOUT_MS);

  // When called by an employee, return ONLY their own record
  if (req.user.role === 'employee') {
    const employeeId = new mongoose.Types.ObjectId(req.user.id);
    const [attendanceRecord, latestHeartbeat] = await Promise.all([
      Attendance.findOne({ userId: employeeId, date }).lean(),
      Heartbeat.findOne({ userId: employeeId, timestamp: { $gte: date } })
        .sort({ timestamp: -1 })
        .lean(),
    ]);

    const clockedIn = Boolean(attendanceRecord?.checkIn && !attendanceRecord.checkOut);
    const isFresh = clockedIn && latestHeartbeat && latestHeartbeat.timestamp >= cutoff;
    const status = isFresh ? latestHeartbeat.status : 'offline';

    let activeMinutes = attendanceRecord?.totalActiveMinutes || 0;
    let idleMinutes = attendanceRecord?.totalIdleMinutes || 0;

    if (clockedIn && attendanceRecord?.checkIn) {
      const summary = await calculateAttendanceMinutes(employeeId, attendanceRecord.checkIn, new Date());
      activeMinutes = summary.totalActiveMinutes;
      idleMinutes = summary.totalIdleMinutes;
    }

    const record = {
      user: {
        _id: req.user.id,
        fullName: req.user.fullName,
        email: req.user.email,
        designation: req.user.designation || '',
      },
      status,
      clockedIn,
      checkIn: attendanceRecord?.checkIn || null,
      checkOut: attendanceRecord?.checkOut || null,
      activeMinutes,
      idleMinutes,
      lastHeartbeatAt: latestHeartbeat?.timestamp || null,
      autoClockedOut: Boolean(attendanceRecord?.autoClockedOut),
    };

    return res.json({ date, employees: [record], total: 1 });
  }

  // When called by an admin, return all active employees
  const employees = await User.find({ role: 'employee', isActive: { $ne: false } })
    .select('_id fullName email designation')
    .sort({ fullName: 1 })
    .lean();
  const employeeIds = employees.map((employee) => employee._id);

  const [attendanceRecords, heartbeatStats] = await Promise.all([
    Attendance.find({ userId: { $in: employeeIds }, date })
      .select('userId checkIn checkOut totalActiveMinutes totalIdleMinutes autoClockedOut')
      .lean(),
    employeeIds.length
      ? Heartbeat.aggregate([
          { $match: { userId: { $in: employeeIds }, timestamp: { $gte: date } } },
          { $sort: { timestamp: -1 } },
          {
            $group: {
              _id: {
                userId: '$userId',
                minute: { $dateToString: { format: '%Y-%m-%d %H:%M', date: '$timestamp' } },
              },
              status: { $first: '$status' },
              timestamp: { $first: '$timestamp' },
              hasActive: { $max: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
            },
          },
          { $sort: { timestamp: -1 } },
          {
            $group: {
              _id: '$_id.userId',
              status: { $first: '$status' },
              timestamp: { $first: '$timestamp' },
              activeSamples: { $sum: '$hasActive' },
              idleSamples: { $sum: { $cond: [{ $eq: ['$hasActive', 1] }, 0, 1] } },
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
      autoClockedOut: Boolean(attendance?.autoClockedOut),
    };
  });

  return res.json({ date, employees: records, total: records.length });
});

/**
 * Live Attendance:
 * - Admin: lists all employees live status.
 * - Employee: lists only their own live status.
 */
router.get('/live', authMiddleware, async (req, res) => {
  if (req.user.role === 'employee') {
    await autoCloseStaleAttendance(req.user.id, req);
  } else {
    await autoCloseStaleAttendance(null, req);
  }

  const cutoff = new Date(Date.now() - HEARTBEAT_TIMEOUT_MS);

  if (req.user.role === 'employee') {
    const employeeId = new mongoose.Types.ObjectId(req.user.id);
    const [latestHeartbeat, openAttendance] = await Promise.all([
      Heartbeat.findOne({ userId: employeeId }).sort({ timestamp: -1 }).lean(),
      Attendance.findOne({
        userId: employeeId,
        date: utcDayStart(),
        checkIn: { $ne: null },
        checkOut: null,
      }).lean(),
    ]);

    const clockedIn = Boolean(openAttendance);
    const isFresh = clockedIn && latestHeartbeat && latestHeartbeat.timestamp >= cutoff;
    return res.json({
      employees: [
        {
          user: {
            _id: req.user.id,
            fullName: req.user.fullName,
            email: req.user.email,
            designation: req.user.designation || '',
          },
          status: isFresh ? latestHeartbeat.status : 'offline',
          clockedIn,
          lastHeartbeatAt: latestHeartbeat ? latestHeartbeat.timestamp : null,
        },
      ],
    });
  }

  const employees = await User.find({ role: 'employee', isActive: { $ne: false } })
    .select('_id fullName email designation')
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
