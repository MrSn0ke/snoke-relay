// server.js
import express from "express";
import http from "http";
import { Server as SocketIOServer } from "socket.io";
import cors from "cors";
import rateLimit from "express-rate-limit";

const app = express();

// נקבל גם JSON, גם form, וגם query
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "256kb" }));
app.use(express.urlencoded({ extended: true, limit: "256kb" })); // <- חשוב לתמיכה ב-form

const server = http.createServer(app);
const io = new SocketIOServer(server, { cors: { origin: "*" } });

const SECRET = process.env.WEBHOOK_SECRET || ""; // אפשר להשאיר ריק

const limiter = rateLimit({ windowMs: 5_000, max: 100 });
app.use("/webhooks/tikfinity", limiter);

// בדיקות חיים
app.get("/", (_req, res) => res.send("TikFinity Relay OK"));
app.get("/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));

// נורמליזציה ממקורות שונים (query / form / json)
function normalizeFromRaw(raw) {
  const r = raw || {};

  // סוג האירוע: אם הוגדר ב-query נשתמש בו, אחרת ננסה לנחש מהשדות של טיקפיניטי
  let type =
    r.type || r.event ||
    (r.gifName ? "gift" : null) ||
    (r.follow ? "follow" : null) ||
    "unknown";

  // משתמש
  const user = {
    name: r.nickname || r.username || r.user || r.sender || null,
    avatar: r.pfp || r.avatar || null,
  };

  // payload לפי סוג
  let payload = {};
  if (type === "gift") {
    payload.gift = {
      name: r.gifName || r.giftName || "Gift",
      amount: Number(r.repeatCount || r.count || 1),
      value: Number(r.coins || r.diamonds || 0),
    };
  } else if (type === "live_status") {
    payload.isLive = String(r.isLive).toLowerCase() === "true";
    payload.viewers = Number(r.viewers || 0);
  }

  return {
    type,
    user: (user.name || user.avatar) ? user : null,
    payload,
    ts: Date.now(),
  };
}

// Webhook ראשי
app.post("/webhooks/tikfinity", (req, res) => {
  if (SECRET) {
    const sig = req.header("x-webhook-secret");
    if (sig !== SECRET) return res.status(401).send("unauthorized");
  }

  // מאחדים query + body (form/json)
  const raw = { ...(req.query || {}), ...(req.body || {}) };
  const event = normalizeFromRaw(raw);

  io.emit("tikfinity:event", event);
  res.sendStatus(200);
});

// תמיכה גם ב-GET לסטטוס לייב (לבדיקות ידניות)
app.get("/webhooks/tikfinity", (req, res) => {
  const raw = { ...(req.query || {}) };
  const event = normalizeFromRaw(raw);
  io.emit("tikfinity:event", event);
  res.sendStatus(200);
});

io.on("connection", (socket) => {
  console.log("[relay] client connected", socket.id);
  socket.emit("relay:hello", { ok: true, ts: Date.now() });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`[relay] listening on :${PORT}`);
  console.log(SECRET ? "[relay] SECRET enabled" : "[relay] open webhook (no secret)");
});
