const mongoose = require('mongoose');

const leaveSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    leaveType: {
      type: String,
      required: true,
      enum: [
        'sick',
        'casual',
        'annual',
        'paternity',
        'maternity',
        'bereavement',
        'unpaid',
        'other',
      ],
      default: 'casual',
    },
    fromDate: { type: Date, required: true },
    toDate: { type: Date, required: true },
    reason: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    reviewNotes: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

leaveSchema.index({ userId: 1, fromDate: 1, toDate: 1 });
leaveSchema.index({ status: 1 });
leaveSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Leave', leaveSchema);
