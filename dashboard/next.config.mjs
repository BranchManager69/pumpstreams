import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

const thisFile = fileURLToPath(import.meta.url);
const thisDir = path.dirname(thisFile);
const repoRoot = path.resolve(thisDir, '..');
const envHint = process.env.PUMPSTREAMS_ENV_FILE ?? '.env.remote';

if (envHint) {
  const hintedPath = path.join(repoRoot, envHint);
  if (fs.existsSync(hintedPath)) {
    loadEnv({ path: hintedPath, override: false });
  }
}

const mode = process.env.NODE_ENV || 'development';
const candidates = [
  `.env.${mode}.local`,
  '.env.local',
  `.env.${mode}`,
];

for (const filename of candidates) {
  const filePath = path.join(repoRoot, filename);
  if (fs.existsSync(filePath)) {
    loadEnv({ path: filePath, override: false });
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'prod-livestream-thumbnails-841162682567.s3.us-east-1.amazonaws.com',
      },
      {
        protocol: 'https',
        hostname: 'ipfs.io',
      },
    ],
  },
};

export default nextConfig;
