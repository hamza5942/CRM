const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    taskTitle: { type: String, required: true, trim: true },
    status: { type: String, enum: ['pending', 'in_progress', 'completed'], default: 'pending' },
    date: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Task', taskSchema);
