const express = require('express');
const mongoose = require('mongoose');

const Lead = require('../models/Lead');
const { authMiddleware } = require('../middleware/authMiddleware');

const router = express.Router();
const LEAD_FIELDS = [
  'clientName',
  'companyName',
  'email',
  'phone',
  'website',
  'domainName',
  'websiteName',
  'techStack',
  'websiteProjectStartDate',
  'websiteProjectEndDate',
  'status',
  'dealValue',
  'notes',
];

function parsePagination(query) {
  const page = Math.max(Number.parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(query.limit, 10) || 50, 1), 100);
  return { page, limit };
}

router.use(authMiddleware);

router.post('/', async (req, res) => {
  const body = req.body || {};
  if (typeof body.clientName !== 'string' || !body.clientName.trim()) {
    return res.status(400).json({ error: 'clientName is required.' });
  }
  const lead = await Lead.create({
    clientName: body.clientName.trim(),
    ...Object.fromEntries(
      LEAD_FIELDS.filter((field) => field !== 'clientName' && body[field] !== undefined)
        .map((field) => [field, body[field]])
    ),
  });
  return res.status(201).json({ lead });
});

router.get('/', async (req, res) => {
  const { page, limit } = parsePagination(req.query);
  const [leads, total] = await Promise.all([
    Lead.find().sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Lead.countDocuments(),
  ]);
  return res.json({ leads, page, limit, total });
});

router.get('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'The lead ID is invalid.' });
  }
  const lead = await Lead.findById(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found.' });
  return res.json({ lead });
});

async function updateLead(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'The lead ID is invalid.' });
  }
  const body = req.body || {};
  const updates = Object.fromEntries(
    LEAD_FIELDS.filter((field) => Object.prototype.hasOwnProperty.call(body, field))
      .map((field) => [field, body[field]])
  );
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'Provide at least one supported lead field to update.' });
  }
  const lead = await Lead.findByIdAndUpdate(req.params.id, { $set: updates }, {
    new: true,
    runValidators: true,
  });
  if (!lead) return res.status(404).json({ error: 'Lead not found.' });
  return res.json({ lead });
}

router.put('/:id', updateLead);
router.patch('/:id', updateLead);

router.delete('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'The lead ID is invalid.' });
  }
  const lead = await Lead.findByIdAndDelete(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found.' });
  return res.json({ message: 'Lead deleted.' });
});

module.exports = router;
