const { getUserFromToken } = require("../services/userService");

function bearerToken(req) {
  const header = req.headers["authorization"] || "";
  const [scheme, token] = header.split(" ");
  return scheme === "Bearer" && token ? token : null;
}

/** Wrap a handler so it only runs for an authenticated request; attaches ctx.user. */
function auth(handler) {
  return async (ctx) => {
    const token = bearerToken(ctx.req);
    const user = getUserFromToken(token);
    if (!user) {
      throw Object.assign(new Error("Authentication required"), { status: 401 });
    }
    return handler({ ...ctx, user, token });
  };
}

/** Wrap a handler so it only runs for an authenticated request with one of the given roles. */
function role(roles, handler) {
  const allowed = Array.isArray(roles) ? roles : [roles];
  return auth((ctx) => {
    if (!allowed.includes(ctx.user.role)) {
      throw Object.assign(new Error(`Requires role: ${allowed.join(" or ")}`), { status: 403 });
    }
    return handler(ctx);
  });
}

module.exports = { auth, role, bearerToken };
