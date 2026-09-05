/**
 * Manual database safety net (docs/ARCHITECTURE.md §15) — MongoDB Atlas's own Cloud Backup only
 * exists on paid (M10+) clusters; a free M0 shared cluster has no automated backup at all. This
 * dumps every collection to timestamped EJSON files (preserves ObjectId/Date/etc. exactly, unlike
 * plain JSON.stringify) regardless of Atlas tier, so it's real insurance either way. Run it on a
 * schedule (cron/Task Scheduler) from any machine with network access to MONGODB_URI, then copy
 * the output folder to storage you control (cloud drive, S3, an external disk) — this script only
 * produces the dump, it doesn't upload anywhere, since no cloud storage is configured for this
 * project yet.
 *
 * Usage: npm run backup
 * Restores with: npm run restore -- backups/<timestamp>
 */
import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import mongoose from 'mongoose';
import { EJSON } from 'bson';

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set — check your .env file.');
    process.exit(1);
  }

  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  if (!db) {
    console.error('Could not resolve a database from MONGODB_URI.');
    process.exit(1);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = join(__dirname, '..', 'backups', timestamp);
  mkdirSync(outDir, { recursive: true });

  const collections = await db.listCollections().toArray();
  for (const { name } of collections) {
    const docs = await db.collection(name).find({}).toArray();
    writeFileSync(join(outDir, `${name}.json`), EJSON.stringify(docs, undefined, 2));
    console.log(`  ${name}: ${docs.length} document(s)`);
  }

  console.log(`\nBackup complete: ${outDir}`);
  console.log('Copy this folder to storage you control — it is gitignored and stays local otherwise.');
  await mongoose.disconnect();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
