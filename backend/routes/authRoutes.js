const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const User = require('../models/User');
const { authMiddleware, isAdmin } = require('../middleware/authMiddleware');
const { publishWorkspaceChange } = require('../realtime');

const router = express.Router();
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function serializeEmployee(user) {
  return {
    id: user._id.toString(),
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    isActive: user.isActive !== false,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || !EMAIL_PATTERN.test(email.trim()) || typeof password !== 'string') {
    return res.status(400).json({ error: 'A valid email and password are required.' });
  }

  const user = await User.findOne({
    email: email.trim().toLowerCase(),
    isActive: { $ne: false },
  });
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const token = jwt.sign(
    { role: user.role, fullName: user.fullName, email: user.email },
    process.env.JWT_SECRET,
    { subject: user._id.toString(), ...(process.env.JWT_EXPIRES_IN !== 'never' ? { expiresIn: process.env.JWT_EXPIRES_IN || '3650d' } : {}) }
  );

  return res.json({
    token,
    tokenType: 'Bearer',
    expiresIn: process.env.JWT_EXPIRES_IN || '3650d',
    user: {
      id: user._id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
    },
  });
});

router.get('/users', authMiddleware, isAdmin, async (req, res) => {
  const filter = { role: 'employee' };
  if (req.query.includeInactive !== 'true') filter.isActive = { $ne: false };

  const users = await User.find(filter)
    .select('_id fullName email role isActive createdAt updatedAt')
    .sort({ fullName: 1 })
    .lean();
  return res.json({ users: users.map(serializeEmployee) });
});

router.post('/register', authMiddleware, isAdmin, async (req, res) => {
  const { fullName, email, password, role = 'employee' } = req.body || {};
  if (
    typeof fullName !== 'string' ||
    !fullName.trim() ||
    typeof email !== 'string' ||
    !EMAIL_PATTERN.test(email.trim()) ||
    typeof password !== 'string' ||
    password.length < 8 ||
    !['admin', 'employee'].includes(role)
  ) {
    return res.status(400).json({
      error: 'Provide a name, valid email, password of at least 8 characters, and valid role.',
    });
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (await User.exists({ email: normalizedEmail })) {
    return res.status(409).json({ error: 'A user with that email already exists.' });
  }

  let user;
  try {
    user = await User.create({
      fullName: fullName.trim(),
      email: normalizedEmail,
      password: await bcrypt.hash(password, 12),
      role,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: 'A user with that email already exists.' });
    }
    throw error;
  }

  publishWorkspaceChange(req, 'employees');
  return res.status(201).json({
    user: serializeEmployee(user),
  });
});

router.patch('/users/:id', authMiddleware, isAdmin, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'The employee ID is invalid.' });
  }

  const body = req.body || {};
  const updates = {};
  if (Object.prototype.hasOwnProperty.call(body, 'fullName')) {
    if (typeof body.fullName !== 'string' || !body.fullName.trim()) {
      return res.status(400).json({ error: 'A non-empty full name is required.' });
    }
    updates.fullName = body.fullName.trim();
  }
  if (Object.prototype.hasOwnProperty.call(body, 'email')) {
    if (typeof body.email !== 'string' || !EMAIL_PATTERN.test(body.email.trim())) {
      return res.status(400).json({ error: 'A valid email address is required.' });
    }
    updates.email = body.email.trim().toLowerCase();
  }
  if (Object.prototype.hasOwnProperty.call(body, 'password')) {
    if (typeof body.password !== 'string' || body.password.length < 8) {
      return res.status(400).json({ error: 'Password must contain at least 8 characters.' });
    }
    updates.password = await bcrypt.hash(body.password, 12);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'isActive')) {
    if (typeof body.isActive !== 'boolean') {
      return res.status(400).json({ error: 'isActive must be a boolean.' });
    }
    updates.isActive = body.isActive;
  }
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'Provide employee details or an account status to update.' });
  }

  try {
    const user = await User.findOneAndUpdate(
      { _id: req.params.id, role: 'employee' },
      { $set: updates },
      { new: true, runValidators: true }
    ).select('_id fullName email role isActive createdAt updatedAt');
    if (!user) return res.status(404).json({ error: 'Employee account not found.' });
    publishWorkspaceChange(req, 'employees');
    return res.json({ user: serializeEmployee(user) });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: 'A user with that email already exists.' });
    }
    throw error;
  }
});

router.delete('/users/:id', authMiddleware, isAdmin, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'The employee ID is invalid.' });
  }

  const user = await User.findOneAndUpdate(
    { _id: req.params.id, role: 'employee' },
    { $set: { isActive: false } },
    { new: true }
  ).select('_id fullName email role isActive');
  if (!user) return res.status(404).json({ error: 'Employee account not found.' });

  publishWorkspaceChange(req, 'employees');
  return res.json({
    user: serializeEmployee(user),
    message: 'Employee account deactivated; existing records were kept.',
  });
});

router.delete('/users/:id/permanent', authMiddleware, isAdmin, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'The employee ID is invalid.' });
  }

  const user = await User.findOneAndDelete({ _id: req.params.id, role: 'employee' })
    .select('_id fullName email');
  if (!user) return res.status(404).json({ error: 'Employee account not found.' });

  publishWorkspaceChange(req, 'employees');
  return res.json({
    user: { id: user._id.toString(), fullName: user.fullName, email: user.email },
    message: 'Employee account deleted; existing task and attendance records were kept.',
  });
});

module.exports = router;
