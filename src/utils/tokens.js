const crypto = require("crypto");

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function sessionExpiry(fromDate = new Date()) {
  return new Date(fromDate.getTime() + SESSION_TTL_MS).toISOString();
}

module.exports = { generateToken, hashToken, sessionExpiry, SESSION_TTL_MS };
