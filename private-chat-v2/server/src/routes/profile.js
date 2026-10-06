import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { v4 as uuid } from "uuid";

import { auth } from "../middleware/auth.js";
import { pool } from "../db/mysql.js";

const r = Router();

const profileDir = path.resolve(
  process.env.UPLOAD_DIR || "uploads",
  "profiles",
);

fs.mkdirSync(profileDir, {
  recursive: true,
});

// --------------------------------------------------
// MULTER STORAGE
// --------------------------------------------------

const storage = multer.diskStorage({
  destination: (_, __, cb) => {
    cb(null, profileDir);
  },

  filename: (_, file, cb) => {
    let extension = ".jpg";

    if (file.mimetype === "image/png") {
      extension = ".png";
    } else if (file.mimetype === "image/webp") {
      extension = ".webp";
    } else if (file.mimetype === "image/jpeg") {
      extension = ".jpg";
    }

    cb(null, `${uuid()}${extension}`);
  },
});

const upload = multer({
  storage,

  limits: {
    // Profile pictures should remain reasonably small.
    fileSize: 5 * 1024 * 1024,
  },

  fileFilter: (_, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp"];

    if (!allowed.includes(file.mimetype)) {
      return cb(new Error("Only JPG, PNG and WEBP images are allowed."));
    }

    cb(null, true);
  },
});

// --------------------------------------------------
// GET BOTH CHAT USERS
// --------------------------------------------------

r.get("/users", auth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `
      SELECT
        id,
        username,
        profile_picture
      FROM users
      ORDER BY id ASC
      `,
    );

    return res.json({
      users: rows.map((user) => ({
        id: user.id,
        username: user.username,
        profilePicture: user.profile_picture || null,
      })),
    });
  } catch (error) {
    console.error("[PROFILE] Unable to load users:", error);

    return res.status(500).json({
      error: "Unable to load profiles",
    });
  }
});

// --------------------------------------------------
// UPLOAD / CHANGE MY PROFILE PICTURE
// --------------------------------------------------

r.post("/picture", auth, upload.single("picture"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: "No profile picture uploaded",
      });
    }

    // Get previous picture so we can delete it
    // after the database has successfully updated.
    const [existingRows] = await pool.query(
      `
          SELECT profile_picture
          FROM users
          WHERE id=?
          LIMIT 1
          `,
      [req.user.id],
    );

    const previousPicture = existingRows[0]?.profile_picture;

    await pool.query(
      `
        UPDATE users
        SET profile_picture=?
        WHERE id=?
        `,
      [req.file.filename, req.user.id],
    );

    // Delete previous profile picture.
    if (previousPicture) {
      const oldFile = path.join(profileDir, path.basename(previousPicture));

      if (fs.existsSync(oldFile)) {
        try {
          fs.unlinkSync(oldFile);
        } catch (error) {
          console.error("[PROFILE] Unable to delete old picture:", error);
        }
      }
    }

    return res.json({
      profilePicture: req.file.filename,
    });
  } catch (error) {
    console.error("[PROFILE] Upload failed:", error);

    // If DB update failed, don't leave the newly
    // uploaded file behind.
    if (req.file?.path && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch {
        // Ignore cleanup failure.
      }
    }

    return res.status(500).json({
      error: "Unable to update profile picture",
    });
  }
});

// --------------------------------------------------
// REMOVE MY PROFILE PICTURE
// --------------------------------------------------

r.delete("/picture", auth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `
      SELECT profile_picture
      FROM users
      WHERE id=?
      LIMIT 1
      `,
      [req.user.id],
    );

    const picture = rows[0]?.profile_picture;

    await pool.query(
      `
      UPDATE users
      SET profile_picture=NULL
      WHERE id=?
      `,
      [req.user.id],
    );

    if (picture) {
      const file = path.join(profileDir, path.basename(picture));

      if (fs.existsSync(file)) {
        try {
          fs.unlinkSync(file);
        } catch (error) {
          console.error("[PROFILE] Unable to delete picture:", error);
        }
      }
    }

    return res.json({
      success: true,
    });
  } catch (error) {
    console.error("[PROFILE] Remove failed:", error);

    return res.status(500).json({
      error: "Unable to remove profile picture",
    });
  }
});

// --------------------------------------------------
// GET PROFILE PICTURE
// --------------------------------------------------

r.get("/picture/:filename", auth, (req, res) => {
  try {
    const filename = path.basename(req.params.filename);

    // UUID + supported image extension only.
    if (!/^[a-f0-9-]+\.(jpg|jpeg|png|webp)$/i.test(filename)) {
      return res.status(400).json({
        error: "Invalid profile picture",
      });
    }

    const file = path.join(profileDir, filename);

    if (!fs.existsSync(file)) {
      return res.status(404).json({
        error: "Profile picture not found",
      });
    }

    return res.sendFile(file);
  } catch (error) {
    console.error("[PROFILE] Picture download failed:", error);

    return res.status(500).json({
      error: "Unable to load profile picture",
    });
  }
});

export default r;
