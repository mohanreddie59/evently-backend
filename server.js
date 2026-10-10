const http = require("http");
const { createRouter } = require("./src/router");

const PORT = process.env.PORT || 4000;
const router = createRouter();

router.get("/api/health", async () => ({ status: "ok", time: new Date().toISOString() }));

require("./src/routes/auth")(router);
require("./src/routes/events")(router);
require("./src/routes/admin")(router);

const server = http.createServer((req, res) => router.handle(req, res));

server.listen(PORT, () => {
  console.log(`Evently backend (proper) listening on http://localhost:${PORT}`);
});
