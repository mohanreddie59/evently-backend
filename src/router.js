// Handlers normally just return the response body (implicit 200). To set a
// different status code, return reply(status, body) — using a Symbol key
// means this can never collide with a real field in the body (e.g. our
// event objects have their own domain "status" field like "assigned").
const STATUS = Symbol("routeStatus");
function reply(status, body) {
  return { [STATUS]: status, body };
}

function matchRoute(pattern, pathname) {
  const patternParts = pattern.split("/").filter(Boolean);
  const pathParts = pathname.split("/").filter(Boolean);
  if (patternParts.length !== pathParts.length) return null;

  const params = {};
  for (let i = 0; i < patternParts.length; i++) {
    const p = patternParts[i];
    const v = decodeURIComponent(pathParts[i]);
    if (p.startsWith(":")) params[p.slice(1)] = v;
    else if (p !== v) return null;
  }
  return params;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1e6) {
        reject(Object.assign(new Error("Payload too large"), { status: 413 }));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch { reject(Object.assign(new Error("Invalid JSON body"), { status: 400 })); }
    });
    req.on("error", reject);
  });
}

function createRouter() {
  const routes = [];
  const api = {};
  ["get", "post", "put", "delete"].forEach((method) => {
    api[method] = (pattern, handler) => routes.push({ method: method.toUpperCase(), pattern, handler });
  });

  api.handle = async (req, res) => {
    const host = req.headers.host || "localhost";
    const url = new URL(req.url, `http://${host}`);
    const pathname = url.pathname;

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }

    for (const route of routes) {
      if (route.method !== req.method) continue;
      const params = matchRoute(route.pattern, pathname);
      if (!params) continue;
      try {
        const query = Object.fromEntries(url.searchParams.entries());
        const body = ["POST", "PUT"].includes(req.method) ? await readJsonBody(req) : {};
        const result = await route.handler({ params, query, body, req });
        const isTagged = result && typeof result === "object" && STATUS in result;
        const status = isTagged ? result[STATUS] : 200;
        const payload = isTagged ? result.body : result;
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(payload === undefined ? "" : JSON.stringify(payload));
      } catch (err) {
        const status = err.status || 500;
        if (status === 500) console.error(err);
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message || "Internal server error" }));
      }
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  };

  return api;
}

module.exports = { createRouter, reply };
