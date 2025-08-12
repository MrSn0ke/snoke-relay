// server.js
import express from "express";
import http from "http";
import { Server as SocketIOServer } from "socket.io";
import cors from "cors";
import rateLimit from "express-rate-limit";

const app = express();

// נקבל גם JSON, גם form, וגם text (fallback)
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "512kb" }));
app.use(express.urlencoded({ extended: true, limit: "512kb" }));
app.use(express.text({ type: "*/*", limit: "512kb" })); // אם יגיע text/plain

const server = http.createServer(app);
const io = new SocketIOServer(server, { cors: { origin: "*" } });

const SECRET = process.env.WEBHOOK_SECRET || ""; // אפשר להשאיר ריק

const limiter = rateLimit({ windowMs: 5_000, max: 100 });
app.use("/webhooks/tikfinity", limiter);

// בדיקות חיים
app.get("/", (_req, res) => res.send("TikFinity Relay OK"));
app.get("/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));

// עזר קטן
const pick = (obj, ...keys) => {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
};

// נורמליזציה ממקורות שונים (query / form / json), כולל עטיפות data/payload/gift
function normalizeFromRaw(raw) {
  let r = raw || {};
  if (typeof r === "string") {
    try { r = JSON.parse(r); } catch { r = {}; }
  }

  // לפרוס עטיפות נפוצות
  const data = r.data || r.payload || r;
  const maybeGift = data.gift || data;

  // סוג האירוע
  let type =
    pick(r, "type", "event") ||
    (pick(maybeGift, "giftName", "name", "gift") ? "gift" : null) ||
    (pick(r, "follow") ? "follow" : null) ||
    "unknown";

  // משתמש
  const user = {
    name:   pick(r, "nickname", "username", "user", "sender", "name"),
    avatar: pick(r, "pfp", "avatar", "profileImageUrl", "profilePictureUrl", "image")
  };

  // payload לפי סוג
  let payload = {};
  if (type === "gift") {
    payload.gift = {
      name:   pick(maybeGift, "giftName", "name", "gift") || "Gift",
      amount: Number(pick(maybeGift, "repeatCount", "amount", "count")) || 1,
      value:  Number(pick(maybeGift, "coins", "diamonds", "diamondCount", "value")) || 0
    };
  } else if (type === "live_status") {
    payload.isLive  = String(pick(r, "isLive", "live")).toLowerCase() === "true";
    payload.viewers = Number(pick(r, "viewers")) || 0;
  } else if (type === "follow") {
    // אין צורך במידע נוסף כאן – רק לשמור user.name/avatar אם קיימים
    payload = {};
  } else {
    // עבור כל דבר אחר – נשמור כמו שהגיע (fallback)
    payload = r.payload || r.data || r;
  }

  return {
    type,
    user: (user.name || user.avatar) ? user : null,
    payload,
    ts: Date.now(),
  };
}

// Webhook ראשי (POST)
app.post("/webhooks/tikfinity", (req, res) => {
  if (SECRET) {
    const sig = req.header("x-webhook-secret");
    if (sig !== SECRET) return res.status(401).send("unauthorized");
  }

  // מאחדים query + body (form/json/text)
  const raw = { ...(req.query || {}), ...(req.body || {}) };
  const event = normalizeFromRaw(raw);

  io.emit("tikfinity:event", event);
  res.sendStatus(200);
});

// תמיכה גם ב-GET (נוח לבדוק ידנית בדפדפן)
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
