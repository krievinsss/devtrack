import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';

const DATA_DIR = path.join(process.cwd(), 'data');
const useBlob = Boolean(process.env.BLOB_READ_WRITE_TOKEN && process.env.VERCEL);

async function blobApi() {
  return import('@vercel/blob');
}

export async function readJson(name, fallback = null) {
  if (useBlob) {
    try {
      const { get } = await blobApi();
      const result = await get(`devtrack/${name}.json`, { access: 'private' });
      if (!result) return seed(name, fallback);
      return JSON.parse(await new Response(result.stream).text());
    } catch {
      return seed(name, fallback);
    }
  }
  try {
    const raw = await fs.readFile(path.join(DATA_DIR, `${name}.json`), 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function seed(name, fallback) {
  try {
    const raw = await fs.readFile(path.join(DATA_DIR, `${name}.json`), 'utf8');
    const value = JSON.parse(raw);
    if (useBlob) await writeJson(name, value);
    return value;
  } catch { return fallback; }
}

export async function writeJson(name, value) {
  if (useBlob) {
    const { put } = await blobApi();
    await put(`devtrack/${name}.json`, JSON.stringify(value, null, 2), {
      access: 'private', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true
    });
    return value;
  }
  await fs.writeFile(path.join(DATA_DIR, `${name}.json`), JSON.stringify(value, null, 2));
  return value;
}

export async function updateJson(name, fallback, updater) {
  const current = await readJson(name, fallback);
  const next = await updater(structuredClone(current));
  await writeJson(name, next);
  return next;
}
