import { test } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const routes = [
  { slug: 'dashboard', path: '/' },
];

test.describe('Dashboard screenshots', () => {
  for (const route of routes) {
    test(`capture ${route.slug}`, async ({ page }, testInfo) => {
      await page.goto(route.path, { waitUntil: 'networkidle' });

      const dir = path.join(
        'tests',
        'playwright',
        'screenshots',
        testInfo.project.name,
      );
      await fs.mkdir(dir, { recursive: true });

      const filePath = path.join(dir, `${route.slug}.png`);
      await page.screenshot({ path: filePath, fullPage: true });

      await testInfo.attach(`${route.slug}-${testInfo.project.name}`, {
        path: filePath,
        contentType: 'image/png',
      });
    });
  }
});
