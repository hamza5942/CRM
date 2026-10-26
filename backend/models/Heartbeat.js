const mongoose = require('mongoose');

const heartbeatSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['active', 'idle', 'offline'], required: true },
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

heartbeatSchema.index({ userId: 1, timestamp: -1 });

module.exports = mongoose.model('Heartbeat', heartbeatSchema);
