const events = require("../services/eventService");
const { role } = require("../middleware/auth");

function register(router) {
  router.get("/api/admin/stats", role("admin", async () => events.stats()));
}

module.exports = register;
