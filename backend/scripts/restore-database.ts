/**
 * Restores a database dump produced by `npm run backup` (docs/ARCHITECTURE.md §15). Each
 * collection is fully replaced (`deleteMany({})` then re-inserted from the dump), not merged —
 * a partial merge could leave stale documents behind that the backup never had, which defeats
 * the point of a restore.
 *
 * Requires an explicit `--yes` flag rather than an interactive confirmation prompt — readline's
 * `question()` combined with a `mongoose` import hangs indefinitely under `ts-node` in this
 * project's environment (reproduced with a minimal repro script: the hang happens purely from
 * `import mongoose from 'mongoose'` alongside `readline.createInterface`, before any DB
 * connection is even made — not something a try/catch or timeout here can fix). An explicit flag
 * is also just a better fit for a disaster-recovery tool: it works unattended/scripted and never
 * leaves an operator staring at a terminal wondering whether the process is hung or just slow.
 *
 * Usage: npm run restore -- <path-to-backup-folder> --yes
 */
import 'dotenv/config';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import mongoose from 'mongoose';
import { EJSON } from 'bson';

async function main() {
  const args = process.argv.slice(2);
  const confirmed = args.includes('--yes');
  const dumpDir = args.find((arg) => !arg.startsWith('--'));

  if (!dumpDir) {
    console.error('Usage: npm run restore -- <path-to-backup-folder> --yes');
    process.exit(1);
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set — check your .env file.');
    process.exit(1);
  }

  const files = readdirSync(dumpDir).filter((f) => f.endsWith('.json'));
  if (files.length === 0) {
    console.error(`No .json dump files found in ${dumpDir}`);
    process.exit(1);
  }

  console.log(`This will restore ${files.length} collection(s) from ${dumpDir}`);
  console.log('into the database at MONGODB_URI, REPLACING each collection\'s current contents:');
  for (const file of files) console.log(`  - ${file.replace(/\.json$/, '')}`);

  if (!confirmed) {
    console.log('\nNothing was changed. Re-run with --yes to actually perform the restore:');
    console.log(`  npm run restore -- ${dumpDir} --yes`);
    process.exit(0);
  }

  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  if (!db) {
    console.error('Could not resolve a database from MONGODB_URI.');
    process.exit(1);
  }

  for (const file of files) {
    const collectionName = file.replace(/\.json$/, '');
    const docs = EJSON.parse(readFileSync(join(dumpDir, file), 'utf-8')) as Record<string, unknown>[];
    await db.collection(collectionName).deleteMany({});
    if (docs.length > 0) await db.collection(collectionName).insertMany(docs);
    console.log(`  ${collectionName}: restored ${docs.length} document(s)`);
  }

  console.log('\nRestore complete.');
  await mongoose.disconnect();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
