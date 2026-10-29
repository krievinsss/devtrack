import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import {
  generateSemesterSeed,
  mergeSeedDataset,
  mergeSeedMonitor,
} from "../lib/semesterSeed.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = path.join(ROOT, "data");
const OUTPUT_FILE = path.join(DATA_DIR, "semester-seed.generated.json");
const PREFIX = "seed_6m_";
dotenv.config({ path: path.join(ROOT, ".env.local"), quiet: true });
dotenv.config({ path: path.join(ROOT, ".env"), quiet: true });

function parseArgs(args) {
  const options = { action: "preview" };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") options.action = "help";
    else if (arg === "--preview") options.action = "preview";
    else if (arg === "--write") options.action = "write";
    else if (arg === "--apply") options.action = "apply";
    else if (arg === "--from" || arg === "--to") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`Trūkst vērtības ${arg} argumentam.`);
      options[arg.slice(2)] = value;
      index += 1;
    } else {
      throw new Error(`Nezināms arguments: ${arg}`);
    }
  }
  return options;
}

function assertSafeLocalEnvironment() {
  const configuredProductionStorage = [
    "VERCEL",
    "BLOB_READ_WRITE_TOKEN",
    "BLOB_STORE_ID",
    "DEVTRACK_DATABASE_URL",
    "DEVTRACK_DATABASE_URL_UNPOOLED",
  ].some((key) => Boolean(process.env[key]));
  if (process.env.NODE_ENV === "production" || configuredProductionStorage ||
      process.env.DEVTRACK_CORE_STORAGE?.toLowerCase() === "neon") {
    throw new Error("Seederis darbojas tikai lokālā JSON vidē; production, Blob un Neon konfigurācija nav atļauta.");
  }
}

async function readJsonFile(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw new Error(`Nevar nolasīt ${path.relative(ROOT, file)}: ${error.message}`);
  }
}

async function writeJsonAtomic(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temporary, file);
}

function mergeDataset(name, existing, seeded) {
  if (name === "attendanceAutomationMonitor") return mergeSeedMonitor(existing, seeded);
  if (name === "repositoryDemo") {
    const preserved = Object.fromEntries(
      Object.entries(existing).filter(([id]) => !id.startsWith(PREFIX)),
    );
    return { ...preserved, ...seeded };
  }
  if (Array.isArray(seeded)) return mergeSeedDataset(existing, seeded);
  throw new Error(`Neatbalstīts datu kopas formāts: ${name}`);
}

async function applySeed(seed) {
  assertSafeLocalEnvironment();
  const pendingWrites = [];
  for (const [name, seeded] of Object.entries(seed.datasets)) {
    const file = path.join(DATA_DIR, `${name}.json`);
    const fallback = Array.isArray(seeded) ? [] : {};
    const existing = await readJsonFile(file, fallback);
    pendingWrites.push([file, mergeDataset(name, existing, seeded)]);
  }

  const eventWrites = [];
  for (const [namespace, events] of Object.entries(seed.versionedEvents)) {
    const dir = path.join(DATA_DIR, "versioned", `events-${namespace}`, namespace === "music" ? "classroom" : "board");
    for (let index = 0; index < events.length; index += 1) {
      const name = `${PREFIX}${String(index + 1).padStart(6, "0")}.json`;
      eventWrites.push([path.join(dir, name), events[index]]);
    }
  }

  for (const [file, value] of pendingWrites) await writeJsonAtomic(file, value);
  for (const [file, value] of eventWrites) await writeJsonAtomic(file, value);
  console.log(`Pielietoti ${Object.keys(seed.datasets).length} JSON datu kopu un ${eventWrites.length} versijotu notikumu lokālajā data/ direktorijā.`);
}

function printHelp() {
  console.log(`Pusgada sintētisko datu seederis

Lietošana:
  npm run seed:semester -- [--preview | --write | --apply] [--from YYYY-MM-DD] [--to YYYY-MM-DD]

Darbības:
  --preview  Tikai ģenerē un parāda datu kopu skaitu (noklusējums).
  --write    Saglabā pilnu sintētisku fixture failu (droši arī ar DB konfigurāciju).
  --apply    Pievieno vai aizstāj tikai seed_6m_ ierakstus lokālajos JSON datos;
             darbojas tikai JSON lokālajā režīmā bez production/Blob/Neon konfigurācijas.

Konti ir sintētiski un bez paroles hash. --write neveic DB vai production izmaiņas.`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.action === "help") return printHelp();
  const seed = generateSemesterSeed({ from: options.from, to: options.to });
  if (options.action === "write") {
    await writeJsonAtomic(OUTPUT_FILE, seed);
    console.log(`Fixture saglabāts: ${path.relative(ROOT, OUTPUT_FILE)}`);
    console.log(seed.counts);
    return;
  }
  if (options.action === "apply") return applySeed(seed);
  console.log(`Periods: ${seed.window.from} — ${seed.window.to}`);
  console.log(seed.counts);
  console.log("Nekas nav ierakstīts. Izmanto --write vai --apply, lai saglabātu.");
}

main().catch((error) => {
  console.error(`Seedera kļūda: ${error.message}`);
  process.exitCode = 1;
});
