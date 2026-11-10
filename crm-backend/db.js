const mongoose = require('mongoose');

let connectionPromise;

async function connectToDatabase() {
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is required to connect to the database.');
  }

  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }

  if (!connectionPromise) {
    connectionPromise = mongoose.connect(process.env.MONGO_URI).catch((error) => {
      connectionPromise = undefined;
      throw error;
    });
  }

  await connectionPromise;
  return mongoose;
}

module.exports = { connectToDatabase };
