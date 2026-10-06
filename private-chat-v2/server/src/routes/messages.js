import { Router } from "express";
import { pool } from "../db/mysql.js";
import { auth } from "../middleware/auth.js";

const r = Router();

// --------------------------------------------------
// GET CHAT MESSAGES
// --------------------------------------------------

r.get("/", auth, async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);

    const [userRows] = await pool.query(
      "SELECT role FROM users WHERE id=? LIMIT 1",
      [req.user.id],
    );
    const role = userRows[0]?.role || "admin";

    let rows;

    if (role === "super_admin") {
      // Super Admin always receives the permanent/master conversation history.
      [rows] = await pool.query(
        `
        SELECT
          id,
          sender_id AS senderId,
          type,
          ciphertext,
          iv,
          salt,
          mime,
          file_name AS fileName,
          file_size AS fileSize,
          is_pinned AS isPinned,
          pinned_at AS pinnedAt,
          pinned_by AS pinnedBy,
          edited_at AS editedAt,
          created_at AS createdAt
        FROM (
          SELECT *
          FROM messages
          ORDER BY id DESC
          LIMIT ?
        ) x
        ORDER BY id ASC
        `,
        [limit],
      );
    } else {
      // Admin does not receive messages that were hidden from the Admin view.
      [rows] = await pool.query(
        `
        SELECT
          m.id,
          m.sender_id AS senderId,
          m.type,
          m.ciphertext,
          m.iv,
          m.salt,
          m.mime,
          m.file_name AS fileName,
          m.file_size AS fileSize,
          m.is_pinned AS isPinned,
          m.pinned_at AS pinnedAt,
          m.pinned_by AS pinnedBy,
          m.edited_at AS editedAt,
          m.created_at AS createdAt
        FROM messages m
        LEFT JOIN message_hidden h
          ON h.message_id = m.id
         AND h.user_id = ?
        WHERE h.message_id IS NULL
        ORDER BY m.id DESC
        LIMIT ?
        `,
        [req.user.id, limit],
      );

      rows.reverse();
    }

    return res.json({ messages: rows });
  } catch (error) {
    console.error("[MESSAGES] Unable to load messages:", error);
    return res.status(500).json({ error: "Unable to load messages" });
  }
});

// --------------------------------------------------
// GET CALL HISTORY
// --------------------------------------------------

r.get("/calls", auth, async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);

    const [rows] = await pool.query(
      `
      SELECT
        c.id,

        c.caller_id AS callerId,
        caller.username AS callerName,

        c.callee_id AS calleeId,
        callee.username AS calleeName,

        c.call_type AS callType,
        c.status,

        c.started_at AS startedAt,
        c.answered_at AS answeredAt,
        c.ended_at AS endedAt,

        c.duration_seconds AS durationSeconds,

        c.ended_by AS endedBy

      FROM call_logs c

      JOIN users caller
        ON caller.id = c.caller_id

      JOIN users callee
        ON callee.id = c.callee_id

      ORDER BY c.started_at DESC

      LIMIT ?
      `,
      [limit],
    );

    return res.json({
      calls: rows,
    });
  } catch (error) {
    console.error("[CALLS] Unable to load call history:", error);

    return res.status(500).json({
      error: "Unable to load call history",
    });
  }
});

export default r;
