const express = require('express');
const mongoose = require('mongoose');

const Task = require('../models/Task');
const User = require('../models/User');
const { authMiddleware } = require('../middleware/authMiddleware');
const { publishWorkspaceChange } = require('../realtime');

const router = express.Router();
const TASK_FIELDS = ['taskTitle', 'status', 'date'];

function parsePagination(query) {
  const page = Math.max(Number.parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(query.limit, 10) || 50, 1), 100);
  return { page, limit };
}

router.use(authMiddleware);

router.post('/', async (req, res) => {
  const { taskTitle, status, date, userId } = req.body || {};
  const assignedUserId = req.user.role === 'admin' ? userId : req.user.id;

  if (typeof taskTitle !== 'string' || !taskTitle.trim() || !assignedUserId) {
    return res.status(400).json({ error: 'taskTitle and an employee assignment are required.' });
  }
  if (!mongoose.isValidObjectId(assignedUserId)) {
    return res.status(400).json({ error: 'The assigned employee ID is invalid.' });
  }

  const assignedUser = await User.findOne({
    _id: assignedUserId,
    role: 'employee',
    isActive: { $ne: false },
  }).select('_id');
  if (!assignedUser) {
    return res.status(400).json({ error: 'Tasks can only be assigned to an existing employee.' });
  }

  const task = await Task.create({
    userId: assignedUser._id,
    taskTitle: taskTitle.trim(),
    ...(status !== undefined && { status }),
    ...(date !== undefined && { date }),
  });

  const populated = await Task.findById(task._id).populate('userId', 'fullName email role').lean();
  publishWorkspaceChange(req, 'tasks', { action: 'create', task: populated });
  return res.status(201).json({ task: populated });
});

router.get('/', async (req, res) => {
  const { page, limit } = parsePagination(req.query);
  const filter = req.user.role === 'admin' ? {} : { userId: req.user.id };

  if (req.user.role === 'admin' && req.query.userId) {
    if (!mongoose.isValidObjectId(req.query.userId)) {
      return res.status(400).json({ error: 'The userId filter is invalid.' });
    }
    filter.userId = req.query.userId;
  }

  const [tasks, total] = await Promise.all([
    Task.find(filter)
      .populate('userId', 'fullName email role')
      .sort({ date: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Task.countDocuments(filter),
  ]);
  return res.json({ tasks, page, limit, total });
});

router.get('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'The task ID is invalid.' });
  }
  const filter = { _id: req.params.id };
  if (req.user.role !== 'admin') filter.userId = req.user.id;

  const task = await Task.findOne(filter).populate('userId', 'fullName email role');
  if (!task) return res.status(404).json({ error: 'Task not found.' });
  return res.json({ task });
});

async function updateTask(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'The task ID is invalid.' });
  }
  const body = req.body || {};
  const updates = {};
  for (const field of TASK_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, field)) updates[field] = body[field];
  }
  if (req.user.role === 'admin' && Object.prototype.hasOwnProperty.call(body, 'userId')) {
    if (!mongoose.isValidObjectId(body.userId)) {
      return res.status(400).json({ error: 'The assigned employee ID is invalid.' });
    }
    const employee = await User.findOne({
      _id: body.userId,
      role: 'employee',
      isActive: { $ne: false },
    }).select('_id');
    if (!employee) return res.status(400).json({ error: 'Tasks can only be assigned to an employee.' });
    updates.userId = employee._id;
  }
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'Provide at least one supported task field to update.' });
  }

  const filter = { _id: req.params.id };
  if (req.user.role !== 'admin') filter.userId = req.user.id;
  const task = await Task.findOneAndUpdate(filter, { $set: updates }, {
    new: true,
    runValidators: true,
  }).populate('userId', 'fullName email role');
  if (!task) return res.status(404).json({ error: 'Task not found.' });

  publishWorkspaceChange(req, 'tasks', { action: 'update', task });
  return res.json({ task });
}

router.put('/:id', updateTask);
router.patch('/:id', updateTask);

router.delete('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'The task ID is invalid.' });
  }
  const filter = { _id: req.params.id };
  if (req.user.role !== 'admin') filter.userId = req.user.id;
  const task = await Task.findOneAndDelete(filter);
  if (!task) return res.status(404).json({ error: 'Task not found.' });

  publishWorkspaceChange(req, 'tasks', { action: 'delete', taskId: req.params.id });
  return res.json({ message: 'Task deleted.' });
});

module.exports = router;
