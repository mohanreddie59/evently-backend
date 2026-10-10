const crypto = require("crypto");
const db = require("../db");
const { hashPassword, verifyPassword } = require("../utils/password");
const { generateToken, hashToken, sessionExpiry } = require("../utils/tokens");
const { requireString, requireEmail, requireOneOf, badRequest } = require("../utils/validate");

const ROLES = ["host", "volunteer", "admin"];

function toPublicUser(row) {
  if (!row) return null;
  return { id: row.id, name: row.name, email: row.email, role: row.role };
}

function register({ name, email, password, role, adminCode }) {
  name = requireString(name, "name", { min: 1, max: 120 });
  email = requireEmail(email);
  requireString(password, "password", { min: 8, max: 200 });
  role = requireOneOf(role, "role", ROLES);

  // Public signup can never create an admin unless the caller knows the
  // secret ADMIN_SIGNUP_CODE configured on the server.
  if (role === "admin") {
    const expected = process.env.ADMIN_SIGNUP_CODE;
    const given = typeof adminCode === "string" ? adminCode : "";
    const ok =
      expected &&
      given.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
    if (!ok) {
      throw Object.assign(new Error("Admin accounts require a valid adminCode"), { status: 403 });
    }
  }

  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) throw badRequest("An account with this email already exists");

  const { salt, hash } = hashPassword(password);
  const id = "u_" + crypto.randomUUID();
  db.prepare(
    `INSERT INTO users (id, name, email, password_hash, password_salt, role, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, name, email, hash, salt, role, new Date().toISOString());

  return createSession(id);
}

function login({ email, password }) {
  email = requireEmail(email);
  requireString(password, "password", { min: 1, max: 200 });

  const row = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!row || !verifyPassword(password, row.password_salt, row.password_hash)) {
    throw Object.assign(new Error("Invalid email or password"), { status: 401 });
  }
  return createSession(row.id, row);
}

function createSession(userId, userRow) {
  const token = generateToken();
  const now = new Date();
  db.prepare(
    `INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`
  ).run(hashToken(token), userId, now.toISOString(), sessionExpiry(now));

  const user = userRow || db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
  return { token, user: toPublicUser(user) };
}

function getUserFromToken(token) {
  if (!token) return null;
  const session = db
    .prepare("SELECT * FROM sessions WHERE token_hash = ?")
    .get(hashToken(token));
  if (!session) return null;
  if (new Date(session.expires_at).getTime() < Date.now()) {
    db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(session.token_hash);
    return null;
  }
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(session.user_id);
  return toPublicUser(row);
}

function logout(token) {
  if (!token) return;
  db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
}

module.exports = { register, login, logout, getUserFromToken, toPublicUser, ROLES };
