#!/usr/bin/env node
import '../../lib/env.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const { Client } = pg;

const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) {
  console.error('Missing SUPABASE_DB_URL');
  process.exit(1);
}

async function applyMigration(client, filePath) {
  const sql = await fs.readFile(filePath, 'utf8');
  await client.query(sql);
  console.log(`Applied migration ${path.basename(filePath)}`);
}

async function exec() {
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const migrationsDir = path.resolve(process.cwd(), 'cli', 'migrations');
    const files = (await fs.readdir(migrationsDir)).filter((name) => name.endsWith('.sql')).sort();
    for (const file of files) {
      const fullPath = path.join(migrationsDir, file);
      await applyMigration(client, fullPath);
    }
  } finally {
    await client.end();
  }
}

exec().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
