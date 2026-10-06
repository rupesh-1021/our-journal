import "dotenv/config";
import argon2 from "argon2";
import { pool } from "./db/mysql.js";
const [, , username, password] = process.argv;
if (!username || !password) {
  console.error("Usage: npm run create-user -- <username> <password>");
  process.exit(1);
}
if (password.length < 10) {
  console.error("Password must be at least 10 characters.");
  process.exit(1);
}
const [[{ count }]] = await pool.query("SELECT COUNT(*) count FROM users");
if (Number(count) >= Number(process.env.MAX_USERS || 2)) {
  console.error(
    "MAX_USERS reached. Delete an account explicitly before creating another.",
  );
  process.exit(1);
}
try {
  const hash = await argon2.hash(password, { type: argon2.argon2id });
  await pool.query("INSERT INTO users(username,password_hash) VALUES(?,?)", [
    username.trim(),
    hash,
  ]);
  console.log(`Created user: ${username}`);
} catch (e) {
  console.error(
    e.code === "ER_DUP_ENTRY" ? "Username already exists." : e.message,
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
