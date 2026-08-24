import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';

const DATA_DIR = path.join(process.cwd(), 'data');
const hasStaticBlobToken = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
const hasPrivateBlobStore = Boolean(process.env.BLOB_STORE_ID && process.env.VERCEL_OIDC_TOKEN);
const useBlob = Boolean(process.env.VERCEL && (hasStaticBlobToken || hasPrivateBlobStore));

async function blobApi() {
  return import('@vercel/blob');
}

export async function readJson(name, fallback = null) {
  if (useBlob) {
    const pathname = `devtrack/${name}.json`;
    try {
      const { get } = await blobApi();
      const result = await get(pathname, { access: 'private' });
      if (!result || result.statusCode !== 200) return seed(name, fallback);
      const raw = await new Response(result.stream).text();
      return JSON.parse(raw);
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
    await put(`devtrack/${name}.json`, JSON.stringify(value, null, 2), {
      access: 'private',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return value;
  }

  if (process.env.VERCEL) {
    console.error('Persistent storage unavailable', {
      hasStaticBlobToken,
      hasBlobStoreId: Boolean(process.env.BLOB_STORE_ID),
      hasOidcToken: Boolean(process.env.VERCEL_OIDC_TOKEN),
    });
    throw new Error('Persistent storage is not configured. Connect a private Vercel Blob store to this project and redeploy.');
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
