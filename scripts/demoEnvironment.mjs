import fs from "node:fs/promises";
import dotenv from "dotenv";

function normalizedNeonHost(value) {
  try {
    const url = new URL(value);
    return url.hostname.toLowerCase().replace(/-pooler(?=\.|$)/u, "");
  } catch {
    return "";
  }
}

export async function assertDemoEnvironmentIsolated() {
  if (process.env.VERCEL) throw new Error("Demo setup commands must be run locally.");
  const demoDatabase = process.env.DEVTRACK_DEMO_DATABASE_URL_UNPOOLED ||
    process.env.DEVTRACK_DEMO_DATABASE_URL;
  const demoHost = normalizedNeonHost(demoDatabase);
  const demoBlobToken = process.env.DEVTRACK_DEMO_BLOB_READ_WRITE_TOKEN;
  const normalEnvironments = [];

  for (const file of [".env.local", ".env"]) {
    try {
      normalEnvironments.push(dotenv.parse(await fs.readFile(file, "utf8")));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }

  for (const env of normalEnvironments) {
    const normalDatabaseUrls = [
      env.DEVTRACK_DATABASE_URL_UNPOOLED,
      env.DEVTRACK_POSTGRES_URL_NON_POOLING,
      env.DEVTRACK_POSTGRES_PRISMA_URL,
      env.DEVTRACK_DATABASE_URL,
      env.DEVTRACK_POSTGRES_URL,
      env.DATABASE_URL,
      env.POSTGRES_URL,
    ].filter(Boolean);
    if (normalDatabaseUrls.some((url) => normalizedNeonHost(url) === demoHost && demoHost)) {
      throw new Error("Demo Neon URL matches the normal .env.local/.env database. Use a separate Neon branch.");
    }
    const normalBlobToken = env.BLOB_READ_WRITE_TOKEN;
    if (demoBlobToken && normalBlobToken && demoBlobToken === normalBlobToken) {
      throw new Error("Demo Blob token matches the normal .env.local/.env token. Use a separate Blob store.");
    }
  }
}
