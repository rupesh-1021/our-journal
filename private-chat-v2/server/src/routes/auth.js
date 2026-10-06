import { Router } from "express";
import argon2 from "argon2";
import jwt from "jsonwebtoken";
import { pool } from "../db/mysql.js";
import { auth } from "../middleware/auth.js";

const r = Router();

// --------------------------------------------------
// LOGIN
// --------------------------------------------------

r.post("/login", async (req, res) => {
  try {
    const username = String(req.body?.username || "").trim();
    const password = String(req.body?.password || "");

    if (!username || !password) {
      return res.status(400).json({
        error: "Username and password are required",
      });
    }

    const [rows] = await pool.query(
      `
      SELECT
        id,
        username,
        password_hash,
        profile_picture
      FROM users
      WHERE username=?
      LIMIT 1
      `,
      [username],
    );

    const user = rows[0];

    if (!user || !(await argon2.verify(user.password_hash, password))) {
      return res.status(401).json({
        error: "Invalid username or password",
      });
    }

    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: process.env.JWT_EXPIRES_IN || "7d",
      },
    );

    return res.json({
      token,

      user: {
        id: user.id,
        username: user.username,
        profilePicture: user.profile_picture || null,
      },
    });
  } catch (error) {
    console.error("[AUTH] Login failed:", error);

    return res.status(500).json({
      error: "Unable to login",
    });
  }
});

// --------------------------------------------------
// CURRENT USER
// --------------------------------------------------

r.get("/me", auth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `
      SELECT
        id,
        username,
        profile_picture
      FROM users
      WHERE id=?
      LIMIT 1
      `,
      [req.user.id],
    );

    const user = rows[0];

    if (!user) {
      return res.status(404).json({
        error: "User not found",
      });
    }

    return res.json({
      user: {
        id: user.id,
        username: user.username,
        profilePicture: user.profile_picture || null,
      },
    });
  } catch (error) {
    console.error("[AUTH] Unable to load current user:", error);

    return res.status(500).json({
      error: "Unable to load user",
    });
  }
});

export default r;
