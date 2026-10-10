const events = require("../services/eventService");
const { auth, role } = require("../middleware/auth");
const { reply } = require("../router");

function register(router) {
  // Public: anyone can browse events, no account needed.
  router.get("/api/events", async ({ query }) => events.listEvents({ status: query.status, type: query.type }));
  router.get("/api/events/:id", async ({ params }) => events.getEventOr404(params.id));

  // Host posts an event.
  router.post(
    "/api/events",
    role("host", async ({ user, body }) => reply(201, events.createEvent(user.id, body)))
  );

  // Volunteer claims an open event.
  router.post(
    "/api/events/:id/claim",
    role("volunteer", async ({ params, user }) => events.claimEvent(params.id, user.id))
  );

  // Host pays the service fee once a volunteer is assigned.
  router.post(
    "/api/events/:id/pay",
    role("host", async ({ params, user }) => events.payFee(params.id, user.id))
  );

  // The assigned volunteer marks the event completed (after the fee is paid).
  router.post(
    "/api/events/:id/complete",
    role("volunteer", async ({ params, user }) => events.completeEvent(params.id, user.id))
  );

  // Host rates a completed event.
  router.post(
    "/api/events/:id/rate",
    role("host", async ({ params, user, body }) => events.rateEvent(params.id, user.id, body.rating))
  );

  // Host (if still open) or admin (any status) cancels an event.
  router.post(
    "/api/events/:id/cancel",
    auth(async ({ params, user }) => events.cancelEvent(params.id, user))
  );
}

module.exports = register;
