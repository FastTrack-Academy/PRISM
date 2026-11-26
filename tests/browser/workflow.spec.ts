import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import path from 'node:path';
import os from 'node:os';
import { readFile } from 'node:fs/promises';

test('PCCI cockpit workflow, new logo, 3 CVD cards, viewer modes, tabbed inspector, params, exports, privacy, and accessibility', async ({
  page,
}) => {
  const errors: string[] = [];
  const remote: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (r) => {
    if (
      /^https?:/.test(r.url()) &&
      !r.url().startsWith(process.env.PRISM_TEST_URL || 'http://127.0.0.1:3000')
    ) {
      remote.push(r.url());
    }
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: /See every page/ })).toBeVisible();
  await expect(page.locator('img[src="/logo.png"]').first()).toBeVisible();
  await expect(page.locator('canvas').first()).toHaveAttribute('width', /\d{3}/);

  const landingAxe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(landingAxe.violations).toEqual([]);

  await page.getByRole('button', { name: 'Try the sample textbook' }).click();
  await expect(page.getByRole('heading', { name: 'Choose the pages to analyze.' })).toBeVisible();
  await page.getByRole('button', { name: 'Select page 1', exact: true }).click();
  await page.getByRole('button', { name: 'Analyze selected pages' }).click();

  await expect(
    page.getByRole('heading', { name: /Perceptual Color Confusion Index/ }),
  ).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole('heading', { name: /Why this score\?/ })).toBeVisible();

  // Switch CVD directly from the top score strip
  await page.getByRole('button', { name: /Protanopia/ }).click();
  await expect(page.getByRole('heading', { name: /Why this score\? · Protanopia/ })).toBeVisible();

  // Switch between side-by-side (default) and 4-image grid
  await page.getByRole('button', { name: /4-image comparison/ }).click();
  await page.getByRole('button', { name: /Original vs Protanopia/ }).click();
  await expect(page.getByLabel('Zoom in')).toBeVisible();

  // Verify inspector tab order: Why this score? -> Palette -> Params -> Pages
  const tabLabels = await page.getByRole('tab').allTextContents();
  expect(tabLabels.map((t) => t.replace(/\d+/g, '').trim())).toEqual([
    'Why this score?',
    'Palette',
    'Params',
    'Pages',
  ]);

  // Open compact Palette tab on demand
  await page.getByRole('tab', { name: /Palette/ }).click();
  await expect(page.getByRole('heading', { name: /CIELAB Palette/ })).toBeVisible();

  // Open Params tab, test Auto Elbow K-selection + live diagnostic chart, then reset
  await page.getByRole('tab', { name: /Params/ }).click();
  await page.getByLabel('Cluster count K selection').selectOption('elbow');
  await page.getByLabel(/Remaining-distance scale/).fill('16');
  await page.getByRole('button', { name: /Apply & recalculate/ }).click();
  await expect(page.getByText('Non-default experimental parameters active')).toBeVisible({
    timeout: 15000,
  });
  await expect(page.getByText('Elbow inertia curve (CIELAB SSE)')).toBeVisible();

  // Reset defaults
  await page.getByRole('button', { name: 'Reset defaults' }).click();
  await expect(page.getByText('Non-default experimental parameters active')).toHaveCount(0, {
    timeout: 15000,
  });

  // Export Scores CSV, JSON, and PDF report from top Export dropdown
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const csvDownloadPromise = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Scores CSV' }).click();
  const csvFile = await csvDownloadPromise;
  expect(csvFile.suggestedFilename()).toContain('-pcci-scores.csv');

  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const jsonDownloadPromise = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Complete JSON' }).click();
  const jsonFile = await jsonDownloadPromise;
  expect(jsonFile.suggestedFilename()).toContain('-pcci-results.json');

  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const reportPromise = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'PDF analysis report' }).click();
  const reportFile = await reportPromise;
  const reportPath = path.join(os.tmpdir(), 'prism-pcci-report.pdf');
  await reportFile.saveAs(reportPath);
  expect((await PDFDocument.load(await readFile(reportPath))).getPageCount()).toBeGreaterThan(0);

  const workspaceAxe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(workspaceAxe.violations).toEqual([]);

  // Mobile reflow check
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  expect(errors).toEqual([]);
  expect(remote).toEqual([]);
});

test('real multi-page PDF upload, selection cap, Pages tab summary, and standalone routes', async ({
  page,
}) => {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < 12; i++) {
    const p = pdf.addPage([500, 650]);
    p.drawText(`Test page ${i + 1}`, { x: 40, y: 600, size: 20, font });
    p.drawRectangle({ x: 80, y: 240, width: 150, height: 200, color: rgb(0.75, 0.286, 0.251) });
    p.drawRectangle({ x: 230, y: 240, width: 150, height: 200, color: rgb(0.427, 0.514, 0.243) });
  }
  const bytes = await pdf.save();

  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({
    name: 'textbook.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(bytes),
  });
  await expect(page.getByRole('heading', { name: 'Choose the pages to analyze.' })).toBeVisible();
  await page.getByLabel('Page numbers').fill('1-11');
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await expect(page.locator('p[role=alert]')).toContainText('no more than 10');

  await page.getByLabel('Page numbers').fill('1-2');
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.getByRole('button', { name: 'Analyze selected pages' }).click();

  await expect(
    page.getByRole('heading', { name: /Perceptual Color Confusion Index/ }),
  ).toBeVisible({ timeout: 30000 });

  await page.getByRole('tab', { name: /Pages/ }).click();
  await expect(page.getByRole('heading', { name: /Pages \(2 of 12 analyzed\)/ })).toBeVisible();

  await page.goto('/methodology/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('A score you can look inside.');

  await page.goto('/about/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('More ways to see.');
});
