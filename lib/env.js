import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config as loadEnv } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.resolve(__dirname, '..');

if (!('DOTENV_DISABLE_LOGGING' in process.env)) {
  process.env.DOTENV_DISABLE_LOGGING = 'true';
}

const candidateFiles = [
  process.env.PUMPSTREAMS_ENV_FILE,
  path.join(projectRoot, '.env.local'),
  path.join(projectRoot, '.env'),
].filter(Boolean);

const loaded = new Set();

for (const filePath of candidateFiles) {
  try {
    const stats = fs.statSync(filePath);
    if (stats.isFile() && !loaded.has(filePath)) {
      loadEnv({ path: filePath, override: false });
      loaded.add(filePath);
    }
  } catch {
    // Ignore missing files
  }
}

export function requireEnv(name) {
  const value = process.env[name];
  if (value === undefined) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

export function optionalEnv(name, fallback = undefined) {
  const value = process.env[name];
  return value === undefined ? fallback : value;
}
