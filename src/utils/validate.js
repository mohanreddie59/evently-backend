function badRequest(message) {
  return Object.assign(new Error(message), { status: 400 });
}

function requireString(value, field, { min = 1, max = 500 } = {}) {
  if (typeof value !== "string" || value.trim().length < min || value.length > max) {
    throw badRequest(`${field} must be a string between ${min} and ${max} characters`);
  }
  return value.trim();
}

function requireEmail(value, field = "email") {
  const email = requireString(value, field, { min: 3, max: 254 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw badRequest(`${field} is not a valid email address`);
  }
  return email.toLowerCase();
}

function requireNumber(value, field, { min, max } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw badRequest(`${field} must be a number`);
  if (min != null && n < min) throw badRequest(`${field} must be >= ${min}`);
  if (max != null && n > max) throw badRequest(`${field} must be <= ${max}`);
  return n;
}

function requireOneOf(value, field, allowed) {
  if (!allowed.includes(value)) {
    throw badRequest(`${field} must be one of: ${allowed.join(", ")}`);
  }
  return value;
}

module.exports = { badRequest, requireString, requireEmail, requireNumber, requireOneOf };
