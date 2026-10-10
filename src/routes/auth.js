const userService = require("../services/userService");
const { auth } = require("../middleware/auth");
const { reply } = require("../router");

function register(router) {
  router.post("/api/auth/register", async ({ body }) => reply(201, userService.register(body)));

  router.post("/api/auth/login", async ({ body }) => userService.login(body));

  router.post(
    "/api/auth/logout",
    auth(async ({ token }) => {
      userService.logout(token);
      return { ok: true };
    })
  );

  router.get(
    "/api/auth/me",
    auth(async ({ user }) => user)
  );
}

module.exports = register;
