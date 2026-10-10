const crypto = require("crypto");
const db = require("../db");
const { requireString, requireNumber, badRequest } = require("../utils/validate");

const FEE_PERCENT = 0.05;
const FEE_MIN = 99;
const EVENT_TYPES = ["Birthday", "Wedding", "Corporate", "College fest", "Social / charity", "Other"];

function calcFee(budget) {
  return Math.max(FEE_MIN, Math.round(Number(budget) * FEE_PERCENT));
}

function forbidden(message) {
  return Object.assign(new Error(message), { status: 403 });
}
function conflict(message) {
  return Object.assign(new Error(message), { status: 409 });
}
function notFound(message = "Event not found") {
  return Object.assign(new Error(message), { status: 404 });
}

function getEventOr404(id) {
  const event = db.prepare("SELECT * FROM events WHERE id = ?").get(id);
  if (!event) throw notFound();
  return event;
}

function listEvents({ status, type } = {}) {
  let sql = "SELECT * FROM events WHERE 1=1";
  const params = [];
  if (status) { sql += " AND status = ?"; params.push(status); }
  if (type) { sql += " AND type = ?"; params.push(type); }
  sql += " ORDER BY created_at DESC";
  return db.prepare(sql).all(...params);
}

function createEvent(hostId, input) {
  const title = requireString(input.title, "title", { min: 1, max: 200 });
  const type = EVENT_TYPES.includes(input.type) ? input.type : "Other";
  const date = requireString(input.date, "date", { min: 1, max: 40 });
  const location = requireString(input.location, "location", { min: 1, max: 200 });
  const budget = requireNumber(input.budget, "budget", { min: 1, max: 100000000 });

  const id = "ev_" + crypto.randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO events (id, title, type, date, location, budget, status, host_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)`
  ).run(id, title, type, date, location, Math.round(budget), hostId, now, now);

  return getEventOr404(id);
}

function claimEvent(eventId, volunteerId) {
  const event = getEventOr404(eventId);
  if (event.status !== "open") throw conflict(`Event is already ${event.status}`);
  if (event.host_id === volunteerId) throw forbidden("You cannot claim your own event");

  const fee = calcFee(event.budget);
  db.prepare(
    `UPDATE events SET status='assigned', volunteer_id=?, fee=?, fee_paid=0, updated_at=? WHERE id=?`
  ).run(volunteerId, fee, new Date().toISOString(), eventId);
  return getEventOr404(eventId);
}

function payFee(eventId, hostId) {
  const event = getEventOr404(eventId);
  if (event.host_id !== hostId) throw forbidden("Only the event's host can pay the fee");
  if (event.status !== "assigned") throw conflict("Fee can only be paid once a volunteer is assigned");
  if (event.fee_paid) throw conflict("Fee already paid");

  db.prepare(`UPDATE events SET fee_paid=1, updated_at=? WHERE id=?`).run(new Date().toISOString(), eventId);
  return getEventOr404(eventId);
}

function completeEvent(eventId, volunteerId) {
  const event = getEventOr404(eventId);
  if (event.volunteer_id !== volunteerId) throw forbidden("Only the assigned volunteer can complete this event");
  if (event.status !== "assigned") throw conflict("Only an assigned event can be completed");
  if (!event.fee_paid) throw conflict("The service fee must be paid before the event can be completed");

  db.prepare(`UPDATE events SET status='completed', updated_at=? WHERE id=?`).run(new Date().toISOString(), eventId);
  return getEventOr404(eventId);
}

function rateEvent(eventId, hostId, rating) {
  const event = getEventOr404(eventId);
  if (event.host_id !== hostId) throw forbidden("Only the event's host can rate it");
  if (event.status !== "completed") throw conflict("Only a completed event can be rated");

  rating = requireNumber(rating, "rating", { min: 1, max: 5 });
  db.prepare(`UPDATE events SET rating=?, updated_at=? WHERE id=?`).run(Math.round(rating), new Date().toISOString(), eventId);
  return getEventOr404(eventId);
}

function cancelEvent(eventId, user) {
  const event = getEventOr404(eventId);
  const isOwner = event.host_id === user.id;
  const isAdmin = user.role === "admin";
  if (!isOwner && !isAdmin) throw forbidden("Only the host or an admin can cancel this event");
  if (!isAdmin && event.status !== "open") throw conflict("A host can only cancel an event that is still open");

  db.prepare(`UPDATE events SET status='cancelled', updated_at=? WHERE id=?`).run(new Date().toISOString(), eventId);
  return getEventOr404(eventId);
}

function stats() {
  const rows = db.prepare("SELECT status, fee, fee_paid, rating FROM events").all();
  const byStatus = rows.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});
  const revenue = rows.filter((r) => r.fee_paid).reduce((s, r) => s + (r.fee || 0), 0);
  const rated = rows.filter((r) => r.rating != null);
  const avgRating = rated.length
    ? Number((rated.reduce((s, r) => s + r.rating, 0) / rated.length).toFixed(2))
    : null;
  return {
    totalEvents: rows.length,
    open: byStatus.open || 0,
    assigned: byStatus.assigned || 0,
    completed: byStatus.completed || 0,
    cancelled: byStatus.cancelled || 0,
    feeRevenue: revenue,
    averageRating: avgRating
  };
}

module.exports = {
  calcFee, listEvents, getEventOr404, createEvent, claimEvent,
  payFee, completeEvent, rateEvent, cancelEvent, stats, EVENT_TYPES
};
