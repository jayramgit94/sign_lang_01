#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const args = new Set(process.argv.slice(2));
const enforceProduction = args.has("--production");
const root = path.resolve(process.cwd());
const envPath = path.join(root, ".env");

const result = {
  errors: [],
  warnings: [],
  info: [],
};

const requiredAlways = ["PORT", "NODE_ENV", "FRONTEND_URL"];
const requiredProd = [
  "MONGODB_URI",
  "JWT_ACCESS_SECRET",
  "JWT_REFRESH_SECRET",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "MAIL_FROM",
];

const weakPatterns = [
  /dev-access-secret-change-me/i,
  /dev-refresh-secret-change-me/i,
  /your-access-secret-here/i,
  /your-refresh-secret-here/i,
  /changeme/i,
  /password123/i,
  /test123/i,
];

function parseEnv(text) {
  const map = new Map();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx <= 0) continue;
    const key = line.slice(0, eqIdx).trim();
    const value = line.slice(eqIdx + 1).trim().replace(/^"|"$/g, "");
    map.set(key, value);
  }
  return map;
}

if (!fs.existsSync(envPath)) {
  result.errors.push("Missing backend/.env file.");
} else {
  const envMap = parseEnv(fs.readFileSync(envPath, "utf8"));

  for (const key of requiredAlways) {
    if (!envMap.get(key)) {
      result.errors.push(`Missing required env key: ${key}`);
    }
  }

  const nodeEnv = (envMap.get("NODE_ENV") || "").toLowerCase();
  const prodMode = enforceProduction || nodeEnv === "production";

  if (prodMode) {
    for (const key of requiredProd) {
      if (!envMap.get(key)) {
        result.errors.push(`Missing required production env key: ${key}`);
      }
    }
  }

  const accessSecret = envMap.get("JWT_ACCESS_SECRET") || "";
  const refreshSecret = envMap.get("JWT_REFRESH_SECRET") || "";

  if (accessSecret && accessSecret.length < 32) {
    result.errors.push("JWT_ACCESS_SECRET should be at least 32 characters.");
  }
  if (refreshSecret && refreshSecret.length < 32) {
    result.errors.push("JWT_REFRESH_SECRET should be at least 32 characters.");
  }

  for (const [key, value] of envMap.entries()) {
    if (!value) continue;
    if (weakPatterns.some((re) => re.test(value))) {
      result.errors.push(`Weak or placeholder value detected for ${key}.`);
    }
  }

  const mongoUri = envMap.get("MONGODB_URI") || "";
  if (mongoUri && !/^mongodb(\+srv)?:\/\//.test(mongoUri)) {
    result.errors.push("MONGODB_URI is not a valid MongoDB URI.");
  }

  const mailFrom = envMap.get("MAIL_FROM") || "";
  if (mailFrom && !/@/.test(mailFrom)) {
    result.warnings.push("MAIL_FROM does not look like a valid email sender.");
  }

  if (envMap.get("NODE_ENV") !== "production") {
    result.warnings.push("NODE_ENV is not production.");
  }

  if (prodMode) {
    result.info.push("Production enforcement mode is ON.");
  }
}

if (result.info.length) {
  for (const message of result.info) {
    console.log(`[info] ${message}`);
  }
}

if (result.warnings.length) {
  for (const message of result.warnings) {
    console.warn(`[warn] ${message}`);
  }
}

if (result.errors.length) {
  for (const message of result.errors) {
    console.error(`[error] ${message}`);
  }
  process.exit(1);
}

console.log("Environment hygiene check passed.");
