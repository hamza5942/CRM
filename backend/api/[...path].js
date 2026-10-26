const { app } = require('../server');
const { connectToDatabase } = require('../db');

module.exports = async function handler(req, res) {
  if (!process.env.JWT_SECRET || Buffer.byteLength(process.env.JWT_SECRET, 'utf8') < 32) {
    throw new Error('JWT_SECRET must be set to a secret containing at least 32 bytes.');
  }

  await connectToDatabase();
  return app(req, res);
};
