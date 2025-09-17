import fs from 'fs/promises';
import path from 'path';

export function sanitizeLabel(value, { fallback = 'item', maxLength = 48 } = {}) {
  const base = (value ?? '').toString().replace(/[^a-zA-Z0-9_-]/g, '');
  if (!base) return fallback;
  return base.slice(0, maxLength);
}

export function formatTimestampForFilename(value = new Date().toISOString()) {
  if (!value) {
    return new Date().toISOString().replace(/[:.]/g, '-');
  }
  return value.toString().replace(/[:.]/g, '-');
}

export function buildJsonFileName({
  prefix = 'snapshot',
  label,
  fallbackLabel = 'item',
  timestamp,
  extension = '.json',
} = {}) {
  const safeLabel = sanitizeLabel(label, { fallback: fallbackLabel });
  const safeStamp = formatTimestampForFilename(timestamp);
  const ext = extension.startsWith('.') ? extension : `.${extension}`;
  return `${prefix}-${safeLabel}-${safeStamp}${ext}`;
}

export async function resolveOutputTarget(outputPath, fileName = 'output.json') {
  if (!outputPath) return null;

  const stats = await fs.stat(outputPath).catch(() => null);

  if (stats?.isDirectory() || outputPath.endsWith(path.sep) || /[\\/]$/.test(outputPath)) {
    const dir = stats?.isDirectory()
      ? outputPath
      : outputPath.replace(/[\\/]+$/, '');

    if (!stats) {
      await fs.mkdir(dir, { recursive: true });
    }

    return path.join(dir, fileName);
  }

  const dir = path.dirname(outputPath);
  if (dir && dir !== '.') {
    await fs.mkdir(dir, { recursive: true }).catch(() => {});
  }

  return outputPath;
}

export function toJson(payload, { pretty = true } = {}) {
  return JSON.stringify(payload, null, pretty ? 2 : 0);
}

export async function writeJsonFile(targetPath, payload, options = {}) {
  const json = toJson(payload, options);
  await fs.writeFile(targetPath, json);
  return json;
}
