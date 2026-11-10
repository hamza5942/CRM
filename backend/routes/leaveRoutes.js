const express = require('express');
const mongoose = require('mongoose');

const Leave = require('../models/Leave');
const { authMiddleware, isAdmin } = require('../middleware/authMiddleware');
const { publishWorkspaceChange } = require('../realtime');

const router = express.Router();

function utcDayStart(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function utcDayEnd(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
}

const VALID_LEAVE_TYPES = [
  'sick',
  'casual',
  'annual',
  'paternity',
  'maternity',
  'bereavement',
  'unpaid',
  'other',
];

/**
 * POST /api/leaves
 * Apply for leave (authenticated user).
 * Disallows past dates (only current and future dates allowed).
 */
router.post('/', authMiddleware, async (req, res) => {
  const { leaveType, fromDate, toDate, reason } = req.body || {};

  if (!leaveType || !VALID_LEAVE_TYPES.includes(leaveType)) {
    return res.status(400).json({
      error: `Invalid leave type. Choose from: ${VALID_LEAVE_TYPES.join(', ')}.`,
    });
  }

  if (!fromDate || !toDate) {
    return res.status(400).json({ error: 'Both from date and to date are required.' });
  }

  const parsedFrom = new Date(fromDate);
  const parsedTo = new Date(toDate);

  if (isNaN(parsedFrom.getTime()) || isNaN(parsedTo.getTime())) {
    return res.status(400).json({ error: 'Provided dates are invalid.' });
  }

  const todayStart = utcDayStart();
  const normalizedFrom = utcDayStart(parsedFrom);
  const normalizedTo = utcDayEnd(parsedTo);

  // Validation: Only current and future dates are permitted
  if (normalizedFrom.getTime() < todayStart.getTime()) {
    return res.status(400).json({
      error: 'Cannot apply for leave on past dates. Please select today or a future date.',
    });
  }

  if (normalizedTo.getTime() < normalizedFrom.getTime()) {
    return res.status(400).json({ error: 'To date cannot be earlier than from date.' });
  }

  const trimmedReason = typeof reason === 'string' ? reason.trim() : '';
  if (!trimmedReason || trimmedReason.length < 3) {
    return res.status(400).json({ error: 'Please provide a valid reason for the leave request (at least 3 characters).' });
  }

  const leave = await Leave.create({
    userId: req.user.id,
    leaveType,
    fromDate: normalizedFrom,
    toDate: normalizedTo,
    reason: trimmedReason,
    status: 'pending',
  });

  const populated = await Leave.findById(leave._id)
    .populate('userId', 'fullName email designation')
    .lean();

  publishWorkspaceChange(req, 'leaves', {
    action: 'applied',
    leaveId: leave._id,
    userId: req.user.id,
    leaveType,
    status: 'pending',
  });

  return res.status(201).json({
    leave: populated,
    message: 'Leave application submitted successfully.',
  });
});

/**
 * GET /api/leaves/my
 * Returns leave applications of the logged-in employee.
 */
router.get('/my', authMiddleware, async (req, res) => {
  const leaves = await Leave.find({ userId: req.user.id })
    .populate('reviewedBy', 'fullName email')
    .sort({ fromDate: -1, createdAt: -1 })
    .lean();

  return res.json({ leaves });
});

/**
 * GET /api/leaves
 * Admin: List all leave applications across the organization.
 */
router.get('/', authMiddleware, isAdmin, async (req, res) => {
  const filter = {};

  if (req.query.status && ['pending', 'approved', 'rejected'].includes(req.query.status)) {
    filter.status = req.query.status;
  }

  if (req.query.userId && mongoose.isValidObjectId(req.query.userId)) {
    filter.userId = req.query.userId;
  }

  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));

  const [leaves, total, pendingCount, approvedCount, rejectedCount] = await Promise.all([
    Leave.find(filter)
      .populate('userId', 'fullName email designation')
      .populate('reviewedBy', 'fullName email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Leave.countDocuments(filter),
    Leave.countDocuments({ status: 'pending' }),
    Leave.countDocuments({ status: 'approved' }),
    Leave.countDocuments({ status: 'rejected' }),
  ]);

  return res.json({
    leaves,
    total,
    pagination: {
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    },
    counts: {
      pending: pendingCount,
      approved: approvedCount,
      rejected: rejectedCount,
      total: pendingCount + approvedCount + rejectedCount,
    },
  });
});

/**
 * PATCH /api/leaves/:id/status
 * Admin: Approve or Reject a leave application.
 */
router.patch('/:id/status', authMiddleware, isAdmin, async (req, res) => {
  const { id } = req.params;
  const { status, reviewNotes } = req.body || {};

  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Status must be either "approved" or "rejected".' });
  }

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ error: 'Invalid leave request ID.' });
  }

  const leave = await Leave.findById(id);
  if (!leave) {
    return res.status(404).json({ error: 'Leave request not found.' });
  }

  leave.status = status;
  leave.reviewedBy = req.user.id;
  leave.reviewedAt = new Date();
  if (typeof reviewNotes === 'string') {
    leave.reviewNotes = reviewNotes.trim();
  }

  await leave.save();

  const updated = await Leave.findById(id)
    .populate('userId', 'fullName email designation')
    .populate('reviewedBy', 'fullName email')
    .lean();

  publishWorkspaceChange(req, 'leaves', {
    action: 'status-changed',
    leaveId: leave._id,
    userId: leave.userId.toString(),
    status,
  });

  return res.json({
    leave: updated,
    message: `Leave request has been ${status}.`,
  });
});

/**
 * DELETE /api/leaves/:id
 * Withdraw or delete a leave application.
 */
router.delete('/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ error: 'Invalid leave ID.' });
  }

  const leave = await Leave.findById(id);
  if (!leave) {
    return res.status(404).json({ error: 'Leave request not found.' });
  }

  const isOwner = leave.userId.toString() === req.user.id;
  const isUserAdmin = req.user.role === 'admin';

  // Employees can delete their own leave requests; admins can delete any
  if (!isOwner && !isUserAdmin) {
    return res.status(403).json({ error: 'You are not authorized to delete this leave request.' });
  }

  await Leave.deleteOne({ _id: id });

  publishWorkspaceChange(req, 'leaves', {
    action: 'deleted',
    leaveId: id,
    userId: leave.userId.toString(),
  });

  return res.json({ success: true, message: 'Leave request withdrawn.' });
});

module.exports = router;
