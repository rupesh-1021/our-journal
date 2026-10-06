import fs from "fs";
import path from "path";
import { verifyToken } from "../middleware/auth.js";
import { pool } from "../db/mysql.js";

const users = new Map();
const composerSockets = new Map();

function addUserSocket(userId, socketId) {
  if (!users.has(userId)) users.set(userId, new Set());
  users.get(userId).add(socketId);
}

function removeUserSocket(userId, socketId) {
  const sockets = users.get(userId);
  if (!sockets) return;
  sockets.delete(socketId);
  if (sockets.size === 0) users.delete(userId);
}

function emitToUser(io, userId, event, payload) {
  // JWT user IDs and MySQL IDs can have different JS types
  // ("2" vs 2). Map.get() is type-sensitive, so normalize by
  // comparing IDs as strings before selecting the recipient sockets.
  let socketIds = null;

  for (const [connectedUserId, connectedSocketIds] of users.entries()) {
    if (String(connectedUserId) === String(userId)) {
      socketIds = connectedSocketIds;
      break;
    }
  }

  if (!socketIds) {
    console.warn(
      `[SOCKET] No connected sockets found for user ${userId} (${event})`,
    );
    return;
  }

  for (const socketId of socketIds) {
    io.to(socketId).emit(event, payload);
  }
}

async function getUserRole(userId) {
  const [rows] = await pool.query("SELECT role FROM users WHERE id=? LIMIT 1", [
    userId,
  ]);
  return rows[0]?.role || "admin";
}

function isPartnerInComposer(currentUserId) {
  for (const [userId, socketIds] of users.entries()) {
    if (String(userId) === String(currentUserId)) continue;
    for (const socketId of socketIds) {
      if (composerSockets.get(socketId)) return true;
    }
  }
  return false;
}

function emitPresence(io) {
  for (const [userId, socketIds] of users.entries()) {
    const partnerOnline = [...users.keys()].some(
      (otherUserId) => String(otherUserId) !== String(userId),
    );
    const partnerViewing = isPartnerInComposer(userId);

    for (const socketId of socketIds) {
      io.to(socketId).emit("presence", {
        online: partnerOnline,
        viewing: partnerViewing,
      });
    }
  }
}

async function getPartnerId(userId) {
  const [rows] = await pool.query(
    "SELECT id FROM users WHERE id <> ? ORDER BY id ASC LIMIT 1",
    [userId],
  );
  return rows[0]?.id || null;
}

async function getCall(callId) {
  const [rows] = await pool.query(
    `SELECT id,caller_id AS callerId,callee_id AS calleeId,call_type AS callType,
            status,started_at AS startedAt,answered_at AS answeredAt,
            ended_at AS endedAt,duration_seconds AS durationSeconds,ended_by AS endedBy
     FROM call_logs WHERE id=? LIMIT 1`,
    [callId],
  );
  return rows[0] || null;
}

async function emitCallUpdate(io, callId) {
  const call = await getCall(callId);
  if (call) io.emit("call:log", call);
}

async function finalizeCall(io, callId, userId, requestedStatus = null) {
  const call = await getCall(callId);
  if (
    !call ||
    ["completed", "missed", "declined", "failed"].includes(call.status)
  ) {
    if (call) io.emit("call:log", call);
    return;
  }

  let status = requestedStatus;
  if (!status) status = call.status === "answered" ? "completed" : "missed";

  await pool.query(
    `UPDATE call_logs
     SET status=?,
         ended_at=NOW(),
         ended_by=?,
         duration_seconds=CASE
           WHEN answered_at IS NULL THEN 0
           ELSE GREATEST(TIMESTAMPDIFF(SECOND, answered_at, NOW()), 0)
         END
     WHERE id=?`,
    [status, userId, callId],
  );

  await emitCallUpdate(io, callId);
}

export function registerSockets(io) {
  io.use((socket, next) => {
    try {
      socket.user = verifyToken(socket.handshake.auth?.token);
      next();
    } catch (error) {
      console.error("[SOCKET] authentication failed:", error?.message);
      next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.user.id;

    addUserSocket(userId, socket.id);
    composerSockets.set(socket.id, false);
    console.log(
      `[SOCKET] user ${userId} (${typeof userId}) connected: ${socket.id}`,
    );
    emitPresence(io);

    socket.on("chat:active", (value) => {
      composerSockets.set(socket.id, Boolean(value));
      emitPresence(io);
    });

    socket.on("typing", (value) => {
      socket.broadcast.emit("typing", Boolean(value));
    });

    socket.on("profile:updated", () => {
      socket.broadcast.emit("profile:updated", { userId });
    });

    socket.on("message:send", async (payload) => {
      try {
        const type = ["text", "image", "video"].includes(payload.type)
          ? payload.type
          : "text";

        if (!payload.ciphertext || !payload.iv || !payload.salt) return;

        const [result] = await pool.query(
          `INSERT INTO messages(
             sender_id,type,ciphertext,iv,salt,mime,file_name,file_size
           ) VALUES(?,?,?,?,?,?,?,?)`,
          [
            userId,
            type,
            String(payload.ciphertext),
            String(payload.iv),
            String(payload.salt),
            payload.mime || null,
            payload.fileName || null,
            payload.fileSize || null,
          ],
        );

        const [rows] = await pool.query(
          `SELECT id,sender_id AS senderId,type,ciphertext,iv,salt,mime,
                  file_name AS fileName,file_size AS fileSize,
                  is_pinned AS isPinned,pinned_at AS pinnedAt,pinned_by AS pinnedBy,
                  edited_at AS editedAt, created_at AS createdAt
           FROM messages WHERE id=?`,
          [result.insertId],
        );

        io.emit("message:new", rows[0]);
      } catch (error) {
        console.error("[MESSAGE] save failed:", error);
        socket.emit("server:error", { message: "Could not save message" });
      }
    });

    socket.on("message:pin", async ({ messageId, pinned }) => {
      try {
        const nextPinned = Boolean(pinned);
        await pool.query(
          `UPDATE messages
           SET is_pinned=?, pinned_at=?, pinned_by=?
           WHERE id=?`,
          [
            nextPinned ? 1 : 0,
            nextPinned ? new Date() : null,
            nextPinned ? userId : null,
            messageId,
          ],
        );

        io.emit("message:pinned", {
          messageId: Number(messageId),
          isPinned: nextPinned,
          pinnedBy: nextPinned ? userId : null,
          pinnedAt: nextPinned ? new Date().toISOString() : null,
        });
      } catch (error) {
        console.error("[MESSAGE] pin failed:", error);
      }
    });

    // Account-local delete/hide.
    // Only the sender can hide their own message. The partner still sees it.
    socket.on("message:delete", async ({ messageId }) => {
      try {
        const [rows] = await pool.query(
          "SELECT id,sender_id AS senderId FROM messages WHERE id=? LIMIT 1",
          [messageId],
        );

        const message = rows[0];
        if (!message) return;

        if (Number(message.senderId) !== Number(userId)) {
          socket.emit("server:error", {
            message: "You can only delete messages sent from your account.",
          });
          return;
        }

        // The super_admin keeps the permanent master history.
        // A delete always hides the message from the ADMIN account only:
        // - admin deletes own message -> disappears from admin, remains for super_admin
        // - super_admin deletes own message -> disappears from admin, remains for super_admin
        const [adminRows] = await pool.query(
          "SELECT id FROM users WHERE role='admin' ORDER BY id ASC LIMIT 1",
        );
        const adminUserId = adminRows[0]?.id;
        if (!adminUserId) {
          socket.emit("server:error", {
            message: "Admin account was not found.",
          });
          return;
        }

        await pool.query(
          `INSERT INTO message_hidden(message_id,user_id)
           VALUES(?,?)
           ON DUPLICATE KEY UPDATE hidden_at=NOW()`,
          [messageId, adminUserId],
        );

        // Only the admin's open tabs remove it from the screen.
        // The super_admin intentionally receives no hide event.
        emitToUser(io, adminUserId, "message:hidden", {
          messageId: Number(messageId),
        });
      } catch (error) {
        console.error("[MESSAGE] local delete failed:", error);
        socket.emit("server:error", { message: "Could not delete message." });
      }
    });

    // Account-wise edit: only the original sender can edit text.
    socket.on("message:edit", async (payload = {}) => {
      try {
        const messageId = Number(payload.messageId);
        if (!messageId || !payload.ciphertext || !payload.iv || !payload.salt)
          return;

        const [rows] = await pool.query(
          "SELECT id,sender_id AS senderId,type FROM messages WHERE id=? LIMIT 1",
          [messageId],
        );
        const message = rows[0];
        if (!message) return;

        if (
          Number(message.senderId) !== Number(userId) ||
          message.type !== "text"
        ) {
          socket.emit("server:error", {
            message: "You can only edit text messages sent from your account.",
          });
          return;
        }

        await pool.query(
          `UPDATE messages
           SET ciphertext=?, iv=?, salt=?, edited_at=NOW()
           WHERE id=?`,
          [
            String(payload.ciphertext),
            String(payload.iv),
            String(payload.salt),
            messageId,
          ],
        );

        const [updated] = await pool.query(
          `SELECT id,sender_id AS senderId,type,ciphertext,iv,salt,mime,
                  file_name AS fileName,file_size AS fileSize,
                  is_pinned AS isPinned,pinned_at AS pinnedAt,pinned_by AS pinnedBy,
                  edited_at AS editedAt,created_at AS createdAt
           FROM messages WHERE id=? LIMIT 1`,
          [messageId],
        );

        io.emit("message:edited", updated[0]);
      } catch (error) {
        console.error("[MESSAGE] edit failed:", error);
        socket.emit("server:error", { message: "Could not edit message." });
      }
    });

    socket.on("call:offer", async (payload) => {
      try {
        const callId = String(payload?.callId || "");
        const calleeId = await getPartnerId(userId);
        if (!callId || !calleeId) return;

        // Deliver the WebRTC offer first. A database logging problem must
        // never prevent the other account from receiving the incoming call.
        emitToUser(io, calleeId, "call:offer", payload);

        try {
          await pool.query(
            `INSERT INTO call_logs(id,caller_id,callee_id,call_type,status)
             VALUES(?,?,?,?, 'ringing')
             ON DUPLICATE KEY UPDATE
               caller_id=VALUES(caller_id),
               callee_id=VALUES(callee_id),
               call_type=VALUES(call_type)`,
            [callId, userId, calleeId, payload.video ? "video" : "voice"],
          );
          await emitCallUpdate(io, callId);
        } catch (logError) {
          console.error(
            "[CALL] offer delivered but call log failed:",
            logError,
          );
        }
      } catch (error) {
        console.error("[CALL] offer/log failed:", error);
      }
    });

    socket.on("call:answer", async (payload) => {
      try {
        await pool.query(
          `UPDATE call_logs
           SET status='answered', answered_at=COALESCE(answered_at,NOW())
           WHERE id=? AND status='ringing'`,
          [payload.callId],
        );

        const call = await getCall(payload.callId);
        if (call) {
          emitToUser(io, call.callerId, "call:answer", payload);
        }
        await emitCallUpdate(io, payload.callId);
      } catch (error) {
        console.error("[CALL] answer failed:", error);
      }
    });

    socket.on("call:ice", async (payload = {}) => {
      try {
        if (!payload.callId) {
          socket.broadcast.emit("call:ice", payload);
          return;
        }
        const call = await getCall(payload.callId);
        if (!call) return;
        const targetId =
          Number(call.callerId) === Number(userId)
            ? call.calleeId
            : call.callerId;
        emitToUser(io, targetId, "call:ice", payload);
      } catch (error) {
        console.error("[CALL] ICE relay failed:", error);
      }
    });

    socket.on("call:reject", async (payload = {}) => {
      try {
        if (payload.callId) {
          await finalizeCall(io, payload.callId, userId, "declined");
        }
        if (payload.callId) {
          const call = await getCall(payload.callId);
          if (call) {
            const targetId =
              Number(call.callerId) === Number(userId)
                ? call.calleeId
                : call.callerId;
            emitToUser(io, targetId, "call:reject", payload);
          }
        } else {
          socket.broadcast.emit("call:reject", payload);
        }
      } catch (error) {
        console.error("[CALL] reject failed:", error);
      }
    });

    socket.on("call:end", async (payload = {}) => {
      try {
        if (payload.callId) {
          await finalizeCall(io, payload.callId, userId);
        }
        if (payload.callId) {
          const call = await getCall(payload.callId);
          if (call) {
            const targetId =
              Number(call.callerId) === Number(userId)
                ? call.calleeId
                : call.callerId;
            emitToUser(io, targetId, "call:end", payload);
          }
        } else {
          socket.broadcast.emit("call:end", payload);
        }
      } catch (error) {
        console.error("[CALL] end failed:", error);
      }
    });

    socket.on("call:failed", async (payload = {}) => {
      try {
        if (payload.callId) {
          await finalizeCall(io, payload.callId, userId, "failed");
        }
        if (payload.callId) {
          const call = await getCall(payload.callId);
          if (call) {
            const targetId =
              Number(call.callerId) === Number(userId)
                ? call.calleeId
                : call.callerId;
            emitToUser(io, targetId, "call:end", payload);
          }
        } else {
          socket.broadcast.emit("call:end", payload);
        }
      } catch (error) {
        console.error("[CALL] failure log failed:", error);
      }
    });

    socket.on("disconnect", () => {
      composerSockets.delete(socket.id);
      removeUserSocket(userId, socket.id);
      emitPresence(io);
    });
  });
}
