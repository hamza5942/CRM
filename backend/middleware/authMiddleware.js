const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');

async function authMiddleware(req, res, next) {
  const authorization = req.get('Authorization');
  if (!authorization || !authorization.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'A Bearer token is required.' });
  }

  const token = authorization.slice('Bearer '.length).trim();
  if (!token) {
    return res.status(401).json({ error: 'A Bearer token is required.' });
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (_error) {
    return res.status(401).json({ error: 'The authentication token is invalid or expired.' });
  }
  if (typeof payload !== 'object' || !payload.sub || !mongoose.isValidObjectId(payload.sub)) {
    return res.status(401).json({ error: 'The authentication token is invalid.' });
  }

  const user = await User.findOne({ _id: payload.sub, isActive: { $ne: false } })
    .select('_id role fullName email')
    .lean();
  if (!user || !['admin', 'employee'].includes(user.role)) {
    return res.status(401).json({ error: 'This account is no longer active.' });
  }

  req.user = {
    id: user._id.toString(),
    role: user.role,
    fullName: user.fullName,
    email: user.email,
  };
  return next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication is required.' });
    }
    if (req.user.role !== role) {
      return res.status(403).json({ error: 'You do not have permission to access this resource.' });
    }
    return next();
  };
}

module.exports = {
  authMiddleware,
  isAdmin: requireRole('admin'),
  isEmployee: requireRole('employee'),
};
