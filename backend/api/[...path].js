const app = require('../server');

module.exports = async function handler(req, res) {
  return app(req, res);
};
