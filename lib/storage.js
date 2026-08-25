import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';

const DATA_DIR = path.join(process.cwd(), 'data');
const hasStaticBlobToken = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
const hasBlobStoreId = Boolean(process.env.BLOB_STORE_ID);
const useBlob = Boolean(process.env.VERCEL && (hasStaticBlobToken || hasBlobStoreId));

async function blobApi() { return import('@vercel/blob'); }

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
  try { return JSON.parse(await fs.readFile(path.join(DATA_DIR, `${name}.json`), 'utf8')); }
  catch { return fallback; }
}

async function seed(name, fallback) {
  try {
    const value = JSON.parse(await fs.readFile(path.join(DATA_DIR, `${name}.json`), 'utf8'));
    if (useBlob) await writeJson(name, value);
    return value;
  } catch (error) { console.error(`seed(${name}) failed:`, error); return fallback; }
}

export async function writeJson(name, value) {
  if (useBlob) {
    const { put } = await blobApi();
    await put(`devtrack/${name}.json`, JSON.stringify(value, null, 2), { access:'private', contentType:'application/json', addRandomSuffix:false, allowOverwrite:true });
    return value;
  }
  if (process.env.VERCEL) {
    console.error('Persistent storage unavailable', {hasStaticBlobToken,hasBlobStoreId});
    throw new Error('Persistent storage is not configured. Connect a Vercel Blob store to this project and redeploy.');
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

// Immutable/versioned state for data that must survive concurrent serverless writes.
// Every write creates a new blob/file; reads choose the newest version instead of overwriting one shared object.
export async function writeVersionedJson(namespace, key, value) {
  const stamp = `${Date.now()}-${cryptoRandom()}`;
  if (useBlob) {
    const { put } = await blobApi();
    const pathname = `devtrack/versioned/${namespace}/${key}/${stamp}.json`;
    await put(pathname, JSON.stringify(value), {access:'private',contentType:'application/json',addRandomSuffix:false});
    return value;
  }
  const dir=path.join(DATA_DIR,'versioned',namespace,key);
  await fs.mkdir(dir,{recursive:true});
  await fs.writeFile(path.join(dir,`${stamp}.json`),JSON.stringify(value));
  return value;
}

export async function readLatestVersionedJson(namespace, key, fallback=null) {
  if (useBlob) {
    const { list, get } = await blobApi();
    const prefix=`devtrack/versioned/${namespace}/${key}/`;
    let cursor, newest=null;
    do {
      const page=await list({prefix,cursor,limit:1000});
      for(const blob of page.blobs||[]) if(!newest || blob.pathname>newest.pathname)newest=blob;
      cursor=page.hasMore?page.cursor:undefined;
    } while(cursor);
    if(!newest)return fallback;
    const result=await get(newest.pathname,{access:'private'});
    if(!result||result.statusCode!==200)return fallback;
    return JSON.parse(await new Response(result.stream).text());
  }
  try {
    const dir=path.join(DATA_DIR,'versioned',namespace,key);
    const names=(await fs.readdir(dir)).filter(x=>x.endsWith('.json')).sort();
    if(!names.length)return fallback;
    return JSON.parse(await fs.readFile(path.join(dir,names[names.length-1]),'utf8'));
  } catch { return fallback; }
}

function cryptoRandom(){return Math.random().toString(36).slice(2,10)}
