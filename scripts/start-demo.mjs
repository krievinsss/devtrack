import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { assertDemoEnvironmentIsolated } from "./demoEnvironment.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(root, ".env.demo.local");
const result = dotenv.config({ path: envFile, override: true, quiet: true });

if (result.error) {
  console.error("Demo settings missing. Copy .env.demo.example to .env.demo.local and configure the dedicated demo services.");
  process.exitCode = 1;
} else {
  process.env.DEVTRACK_DEMO_MODE = "true";
  process.env.DEVTRACK_CORE_STORAGE = "neon";
  const missing = [
    "DEVTRACK_DEMO_DATABASE_URL",
    "DEVTRACK_DEMO_BLOB_READ_WRITE_TOKEN",
    "DEVTRACK_DEMO_PASSWORD",
    "AUTH_SECRET",
  ].filter((key) => !process.env[key]);
  if (missing.length) {
    console.error(`Missing demo settings in .env.demo.local: ${missing.join(", ")}`);
    process.exitCode = 1;
  } else if (process.env.DEVTRACK_DEMO_PASSWORD.length < 12 ||
      process.env.AUTH_SECRET.length < 32) {
    console.error("DEVTRACK_DEMO_PASSWORD must be at least 12 characters and AUTH_SECRET at least 32 characters.");
    process.exitCode = 1;
  } else {
    try {
      await assertDemoEnvironmentIsolated();
      const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
      const child = spawn(process.execPath, [nextBin, "dev"], {
        cwd: root,
        env: process.env,
        stdio: "inherit",
      });
      child.on("error", (error) => {
        console.error(`Could not start the demo server: ${error.message}`);
        process.exitCode = 1;
      });
      child.on("exit", (code, signal) => {
        if (signal) process.kill(process.pid, signal);
        else process.exitCode = code ?? 1;
      });
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}
