// server.js
import express from "express";
import http from "http";
import { Server as SocketIOServer } from "socket.io";
import cors from "cors";
import rateLimit from "express-rate-limit";

const app = express();

// --- basic middleware ---
app.use(cors({ origin: "*"}));
app.use(express.json({ limit: "256kb" }));       // JSON bodies
app.use(express.text({ type: "*/*", limit: "256kb" })); // fallback if someone posts text

// --- http + socket.io ---
const server = http.createServer(app);
const io = new SocketIOServer(server, { cors: { origin: "*" } });

// Optional secret (NOT required). If not set, webhook is open.
const SECRET = process.env.WEBHOOK_SECRET || "";

// Slight protection from spammy sources
const limiter = rateLimit({ windowMs: 5_000, max: 100 });
app.use("/webhooks/tikfinity", limiter);

// Health checks
app.get("/", (_req, res) => res.status(200).send("TikFinity Relay OK"));
app.get("/health", (_req, res) => res.status(200).json({ ok: true, ts: Date.now() }));

// Normalize incoming TikFinity-like events to a simple schema
function normalizeEvent(raw) {
  let body = raw;
  if (typeof raw === "string") {
    try { body = JSON.parse(raw); } catch { body = { type: "unknown", payload: { raw } }; }
  }

  const type = body.type || body.event || "unknown";
  const data = body.data || body.payload || {};

  // standardize user if exists
  const user = body.user || body.sender || (data.user || null);

  // standardize live payload
  const payload =
    type === "live_status"
      ? {
          isLive: data?.live?.isLive ?? data?.isLive ?? false,
          viewers: data?.live?.viewers ?? data?.viewers ?? 0,
        }
      : body.payload || body.data || {};

  return {
    type,
    user: user || null,
    payload,
    ts: Date.now(),
  };
}

// Main webhook endpoint (POST)
app.post("/webhooks/tikfinity", (req, res) => {
  // If SECRET is set, enforce header check. Otherwise, accept everything.
  if (SECRET) {
    const sig = req.header("x-webhook-secret");
    if (sig !== SECRET) return res.status(401).send("unauthorized");
  }

  const raw = req.is("application/json") ? req.body : req.body ?? {};
  const event = normalizeEvent(raw);

  // broadcast to site
  io.emit("tikfinity:event", event);

  // small OK
  res.sendStatus(200);
});

// Socket.io basic hello
io.on("connection", (socket) => {
  console.log("[relay] client connected", socket.id);
  socket.emit("relay:hello", { ok: true, ts: Date.now() });
  socket.on("disconnect", () => {
    console.log("[relay] client disconnected", socket.id);
  });
});

// Start
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`[relay] listening on :${PORT}`);
  if (SECRET) {
    console.log(`[relay] WEBHOOK_SECRET is enabled.`);
  } else {
    console.log(`[relay] No WEBHOOK_SECRET set (webhook is open).`);
  }
});
