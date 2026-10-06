import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import http from "http";
import { Server } from "socket.io";

import authRoutes from "./routes/auth.js";
import messageRoutes from "./routes/messages.js";
import mediaRoutes from "./routes/media.js";
import profileRoutes from "./routes/profile.js";

import { registerSockets } from "./sockets/index.js";

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error("JWT_SECRET must contain at least 32 characters");
}

const origins = (process.env.CLIENT_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((x) => x.trim());

const app = express();

app.disable("x-powered-by");

app.use(
  helmet({
    crossOriginResourcePolicy: false,
  }),
);

app.use(
  cors({
    origin: origins,
    methods: ["GET", "POST", "DELETE"],
  }),
);

app.use(
  express.json({
    limit: "1mb",
  }),
);

// --------------------------------------------------
// HEALTH
// --------------------------------------------------

app.get("/health", (_, res) => {
  res.json({
    ok: true,
    service: "between-us",
  });
});

// --------------------------------------------------
// API ROUTES
// --------------------------------------------------

app.use("/api/auth", authRoutes);

app.use("/api/messages", messageRoutes);

app.use("/api/media", mediaRoutes);

app.use("/api/profile", profileRoutes);

// --------------------------------------------------
// ERROR HANDLER
// --------------------------------------------------

app.use((err, req, res, next) => {
  console.error(err);

  if (err?.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({
      error: "File too large",
    });
  }

  if (err?.message === "Only JPG, PNG and WEBP images are allowed.") {
    return res.status(400).json({
      error: err.message,
    });
  }

  res.status(500).json({
    error: "Server error",
  });
});

// --------------------------------------------------
// HTTP + SOCKET.IO SERVER
// --------------------------------------------------

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: origins,

    methods: ["GET", "POST"],
  },
});

registerSockets(io);

const port = Number(process.env.PORT || 8080);

server.listen(port, () => {
  console.log(`Between Us API listening on :${port}`);
});
