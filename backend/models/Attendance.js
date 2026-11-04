const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    checkIn: { type: Date },
    checkOut: { type: Date },
    date: { type: Date, default: Date.now },
    totalActiveMinutes: { type: Number, default: 0, min: 0 },
    totalIdleMinutes: { type: Number, default: 0, min: 0 },
    lastHeartbeatAt: { type: Date },
    lastHeartbeatSource: { type: String, enum: ['desktop', 'web'], default: 'desktop' },
  },
  { timestamps: true }
);

attendanceSchema.index({ userId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Attendance', attendanceSchema);
