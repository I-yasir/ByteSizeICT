/**
 * Storage backup (R1.1, Plan V2.03; RUNBOOK §8): downloads every Supabase Storage bucket with the
 * service-role key into <out_dir>/storage/<bucket>/<path> and writes storage-manifest.json.
 * `pg_dump` only contains Storage *metadata*; the files themselves are saved here.
 *
 *   node --env-file=.env.production.local --import tsx scripts/backup-storage.ts backups/<stamp>
 *
 * Reads only NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from the environment and, unlike
 * the app scripts, never falls back to .env.local (a backup must not silently target the dev stack).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

function required(): { url: string; key: string; outDir: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const outDir = process.argv[2];
  if (url && key && outDir) return { url, key, outDir };
  console.error('Usage: node --env-file=<env file> --import tsx scripts/backup-storage.ts <out_dir>');
  console.error('Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.');
  process.exit(1);
}

const { url, key, outDir } = required();
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const PAGE = 1000;

/** Recursively lists object paths under `prefix` (folders come back with id === null). */
async function listAll(bucket: string, prefix = ''): Promise<string[]> {
  const paths: string[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: PAGE, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`);
    for (const entry of data) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id === null) paths.push(...(await listAll(bucket, path)));
      else paths.push(path);
    }
    if (data.length < PAGE) return paths;
  }
}

async function main(): Promise<void> {
  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) throw new Error(`listBuckets: ${error.message}`);
  const manifest: { bucket: string; public: boolean; files: number; bytes: number }[] = [];

  for (const bucket of buckets) {
    const paths = await listAll(bucket.name);
    let bytes = 0;
    for (const path of paths) {
      const { data: blob, error: downloadError } = await supabase.storage.from(bucket.name).download(path);
      if (downloadError || !blob) throw new Error(`download ${bucket.name}/${path}: ${downloadError?.message ?? 'empty'}`);
      const target = join(outDir, 'storage', bucket.name, path);
      await mkdir(dirname(target), { recursive: true });
      const buffer = Buffer.from(await blob.arrayBuffer());
      await writeFile(target, buffer);
      bytes += buffer.byteLength;
    }
    manifest.push({ bucket: bucket.name, public: bucket.public, files: paths.length, bytes });
    console.log(`${bucket.name}: ${paths.length} files, ${(bytes / 1024).toFixed(1)} KB`);
  }

  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'storage-manifest.json'), `${JSON.stringify({ at: new Date().toISOString(), buckets: manifest }, null, 2)}\n`);
  console.log(`Storage backup complete: ${join(outDir, 'storage')}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
