import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';

const DATA_DIR = path.join(process.cwd(), 'data');
const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
const useBlob = Boolean(process.env.VERCEL && (blobToken || process.env.BLOB_STORE_ID || process.env.VERCEL_OIDC_TOKEN));

async function blobApi() {
  return import('@vercel/blob');
}

function blobOptions(extra = {}) {
  return blobToken ? { ...extra, token: blobToken } : extra;
}

async function readBlobJson(pathname) {
  const { list } = await blobApi();
  const page = await list(blobOptions({ prefix: pathname, limit: 100 }));
  const blob = page.blobs?.find((item) => item.pathname === pathname);
  if (!blob) return null;

  const url = blob.downloadUrl || blob.url;
  const headers = blobToken ? { Authorization: `Bearer ${blobToken}` } : {};
  const response = await fetch(url, { headers, cache: 'no-store' });
  if (!response.ok) throw new Error(`Vercel Blob read failed (${response.status}) for ${pathname}`);
  return JSON.parse(await response.text());
}

export async function readJson(name, fallback = null) {
  if (useBlob) {
    const pathname = `devtrack/${name}.json`;
    try {
      const value = await readBlobJson(pathname);
      if (value !== null) return value;
      return seed(name, fallback);
    } catch (error) {
      console.error(`readJson(${name}) blob error:`, error);
      throw error;
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
  } catch (error) {
    console.error(`seed(${name}) failed:`, error);
    return fallback;
  }
}

export async function writeJson(name, value) {
  if (useBlob) {
    const { put } = await blobApi();
    await put(
      `devtrack/${name}.json`,
      JSON.stringify(value, null, 2),
      blobOptions({
        access: 'private',
        contentType: 'application/json',
        addRandomSuffix: false,
        allowOverwrite: true,
      })
    );
    return value;
  }

  if (process.env.VERCEL) {
    throw new Error('Persistent storage is not configured. Connect Vercel Blob to this project.');
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
