import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { v4 as uuid } from "uuid";
import { auth } from "../middleware/auth.js";
const r = Router(),
  dir = path.resolve(process.env.UPLOAD_DIR || "uploads");
fs.mkdirSync(dir, { recursive: true });
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, dir),
  filename: (_, file, cb) => cb(null, uuid() + ".bin"),
});
const upload = multer({ storage, limits: { fileSize: 30 * 1024 * 1024 } });
r.post("/", auth, upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  res.status(201).json({ storageKey: req.file.filename });
});
r.get("/:key", auth, (req, res) => {
  const key = path.basename(req.params.key);
  if (!/^[a-f0-9-]+\.bin$/i.test(key))
    return res.status(400).json({ error: "Invalid key" });
  const file = path.join(dir, key);
  if (!fs.existsSync(file))
    return res.status(404).json({ error: "File not found" });
  res.type("application/octet-stream").sendFile(file);
});
export default r;
