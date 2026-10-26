const mongoose = require('mongoose');

const leadSchema = new mongoose.Schema(
  {
    clientName: { type: String, required: true, trim: true },
    companyName: { type: String, trim: true },
    email: { type: String, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    status: {
      type: String,
      enum: ['new', 'contacted', 'discovery', 'proposal', 'closed'],
      default: 'new',
    },
    dealValue: { type: Number, default: 0, min: 0 },
    notes: { type: String, trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Lead', leadSchema);
