import { randomBytes, randomUUID, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";
import { resolve } from "node:path";
import Sqlite from "better-sqlite3";

const scrypt = promisify(scryptCallback);
const [emailInput, password] = process.argv.slice(2);

if (!emailInput || !password) {
  console.error("Usage: pnpm dev:create-superadmin -- <email> <password>");
  process.exit(1);
}

const email = emailInput.trim().toLocaleLowerCase("en-US");

if (!/^\S+@\S+\.\S+$/.test(email)) {
  console.error("Provide a valid email address");
  process.exit(1);
}

if (password.length < 12 || password.length > 128) {
  console.error("Password must be between 12 and 128 characters");
  process.exit(1);
}

const databasePath = resolve("data/aaidle.db");
const salt = randomBytes(16).toString("base64url");
const derivedKey = await scrypt(password, salt, 64);
const passwordHash = `scrypt$${salt}$${derivedKey.toString("base64url")}`;
const now = Date.now();
const database = new Sqlite(databasePath);

try {
  database.pragma("foreign_keys = ON");
  database.pragma("busy_timeout = 5000");

  database
    .prepare(
      `INSERT INTO users (
      id, email, email_normalized, password_hash, email_verified_at, permission, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'superadmin', ?, ?)
    ON CONFLICT(email_normalized) DO UPDATE SET
      email = excluded.email,
      password_hash = excluded.password_hash,
      email_verified_at = excluded.email_verified_at,
      permission = excluded.permission,
      updated_at = excluded.updated_at`,
    )
    .run(randomUUID(), email, email, passwordHash, now, now, now);

  console.log(
    database
      .prepare("SELECT email, email_verified_at, permission FROM users WHERE email_normalized = ?")
      .get(email),
  );
} finally {
  database.close();
}
