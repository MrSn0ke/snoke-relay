// relay/server.js
import express from "express";
import http from "http";
import { Server as SocketIOServer } from "socket.io";
import rateLimit from "express-rate-limit";
import cors from "cors";

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "256kb" }));

const server = http.createServer(app);
const io = new SocketIOServer(server, { cors: { origin: "*" } });

// אם תגדיר WEBHOOK_SECRET ב-Render תתבצע בדיקה; אחרת – אין בדיקה
const SECRET = (process.env.WEBHOOK_SECRET || "").trim();

const limiter = rateLimit({ windowMs: 5_000, max: 100 });
app.use("/webhooks/tikfinity", limiter);

// Health
app.get("/", (_req, res) => res.send("TikFinity Relay OK"));

// Webhook endpoint
app.post("/webhooks/tikfinity", (req, res) => {
  // בדיקת סיקרט רק אם הוגדר
  if (SECRET && req.get("x-webhook-secret") !== SECRET) {
    return res.status(401).send("unauthorized");
  }
  const event = req.body;
  const normalized = {
    type: event.type || event.event || "unknown",
    user: event.user || event.sender || null,
    payload: event.payload || event.data || {},
    ts: Date.now()
  };
  io.emit("tikfinity:event", normalized);
  res.sendStatus(200);
});

io.on("connection", (socket) => {
  console.log("client connected", socket.id);
  socket.emit("relay:hello", { ok: true, ts: Date.now() });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log("Relay listening on " + PORT));
