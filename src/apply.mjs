import * as fs from 'fs/promises';
import * as path from 'path';
import crypto from 'crypto';
import zlib from 'zlib';
import { loadSchema, ValidFor, POE2_LANG_PATH } from './vendor/schema.mjs';
import { patchTable, readScalarStrings } from './vendor/datWriter.mjs';
import { shouldTranslate } from './vendor/translatable.mjs';
import { patchCsd, collectCsdStrings } from './vendor/csd.mjs';
import { makeLoader, listDirFiles } from './vendor/loader.mjs';

const STEAM = process.env.POE2_DIR;
if (!STEAM) {
    console.error("POE2_DIR environment variable is not set. Use install.ps1 to run this script.");
    process.exit(1);
}

const CACHE_FILE = path.join(import.meta.dirname, '..', 'translations', 'uk.json.gz');
const STAGING_DIR = path.join(import.meta.dirname, '..', 'out', 'staging');
const PRISTINE_DIR = path.join(import.meta.dirname, '..', 'out', 'pristine');
const HASHES_FILE = path.join(import.meta.dirname, '..', 'out', 'applied_hashes.json');

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

async function ensureDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function main() {
  const gzippedCache = await fs.readFile(CACHE_FILE);
  const cacheStr = zlib.gunzipSync(gzippedCache).toString('utf-8');
  const cache = JSON.parse(cacheStr);

  let appliedHashes = {};
  try {
    appliedHashes = JSON.parse(await fs.readFile(HASHES_FILE, 'utf-8'));
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }

  const schema = await loadSchema();
  const loader = await makeLoader(STEAM);
  const seen = new Set();
  // ApplyPolish writes every file found here: leftovers from an earlier run would go back into the game
  await fs.rm(STAGING_DIR, { recursive: true, force: true });

  let filesChanged = 0;
  let stringsChanged = 0;
  let filesRestored = 0;

  async function processFile(filePath, isCsd, processFn) {
    const rawBuf = await loader.tryGetFileContents(filePath);
    if (!rawBuf) return;

    let buf = Buffer.from(rawBuf);
    const currentHash = sha256(buf);

    const pristinePath = path.join(PRISTINE_DIR, filePath);
    const wasApplied = appliedHashes[filePath] === currentHash;

    if (wasApplied) {
      try {
        buf = await fs.readFile(pristinePath);
      } catch (e) {
        console.error(`Missing pristine backup for ${filePath} but live hash matches applied version. Skipping.`);
        return;
      }
    } else {
      await ensureDir(pristinePath);
      await fs.writeFile(pristinePath, buf);
    }

    const result = processFn(buf, filePath);
    const stagingPath = path.join(STAGING_DIR, filePath);
    if (!result || result.stats.changed === 0) {
      if (wasApplied && sha256(buf) !== currentHash) {
        // translated by an earlier version, nothing to translate now (e.g. engine ids back to English): restore the original
        await ensureDir(stagingPath);
        await fs.writeFile(stagingPath, buf);
        appliedHashes[filePath] = sha256(buf);
        filesRestored++;
      }
      return;
    }

    await ensureDir(stagingPath);
    await fs.writeFile(stagingPath, result.bytes);

    try {
        if (!isCsd) {
            readScalarStrings(result.bytes, path.parse(filePath).name, schema, ValidFor.PoE2);
        } else {
            [...collectCsdStrings(result.bytes)];
        }
    } catch (e) {
        throw new Error(`Verification failed for ${filePath} after patching: ${e.message}`);
    }

    appliedHashes[filePath] = sha256(result.bytes);
    filesChanged++;
    stringsChanged += result.stats.changed;
    console.log(`Patched ${filePath} (changed ${result.stats.changed} strings)`);
  }

  for (const t of schema.tables) {
    if (!(t.validFor & ValidFor.PoE2) || seen.has(t.name)) continue;
    if (!t.columns.some((c) => c.type === 'string')) continue;
    seen.add(t.name);

    await processFile(`${POE2_LANG_PATH.English}/${t.name}.datc64`, false, (buf) => {
        try {
            return patchTable(buf, t.name, schema, ValidFor.PoE2, (src, ctx) => {
                return shouldTranslate(ctx.column, src, ctx.table) ? (cache[src] ?? null) : null;
            });
        } catch (e) {
            return null;
        }
    });
  }

  // Recursive: per-skill descriptions live in Data/StatDescriptions/specific_skill_stat_descriptions/<skill>/
  const { listDirFilesRecursive } = await import('./vendor/loader.mjs');
  for (const file of await listDirFilesRecursive(STEAM, 'Data/StatDescriptions', '.csd')) {
    // canonical "Data/StatDescriptions/..." spelling: applied_hashes.json and out/pristine already use it
    await processFile(`Data/StatDescriptions/${file.slice('data/statdescriptions/'.length)}`, true, (buf) => {
        return patchCsd(buf, s => cache[s] ?? null);
    });
  }

  await ensureDir(HASHES_FILE);
  await fs.writeFile(HASHES_FILE, JSON.stringify(appliedHashes, null, 2));

  console.log(`\nDone. Modified ${filesChanged} files with ${stringsChanged} translated strings, restored ${filesRestored} originals.`);
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
