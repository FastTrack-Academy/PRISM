import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import path from 'node:path';
import os from 'node:os';
import { readFile } from 'node:fs/promises';
const screenshot = (name: string) => path.join(os.tmpdir(), `prism-${name}.png`);

test('sample workflow, privacy, simulations, mobile, accessibility, and PDF exports', async ({
  page,
}) => {
  const errors: string[] = [],
    remote: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (r) => {
    if (
      /^https?:/.test(r.url()) &&
      !r.url().startsWith(process.env.PRISM_TEST_URL || 'http://127.0.0.1:3000')
    )
      remote.push(r.url());
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /See every page/ })).toBeVisible();
  await expect(page.locator('canvas').first()).toHaveAttribute('width', /\d{3}/);
  await page.screenshot({ path: screenshot('landing-desktop'), fullPage: true });
  const landingAxe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(landingAxe.violations).toEqual([]);
  await page.getByRole('button', { name: 'Try the sample textbook' }).click();
  await page.getByRole('button', { name: 'Select page 1', exact: true }).click();
  await page.getByRole('button', { name: 'Analyze selected pages' }).click();
  await expect(page.getByRole('status').last()).toHaveText('Analysis completed locally', {
    timeout: 150000,
  });
  await expect(page.getByRole('heading', { name: 'Page 1', exact: true })).toBeVisible();
  await expect(page.getByText('Preparing page…')).toHaveCount(0, { timeout: 30000 });
  await page.screenshot({ path: screenshot('workspace-desktop'), fullPage: true });
  await page.getByRole('button', { name: 'Deuteranopia', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Deuteranopia', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByText('Preparing page…')).toHaveCount(0, { timeout: 30000 });
  await page.getByRole('checkbox', { name: 'Compare view' }).check();
  await page.getByRole('slider', { name: 'Comparison divider' }).fill('37');
  await page.screenshot({ path: screenshot('workspace-simulation'), fullPage: true });
  console.log(
    'sample issues:',
    await page.getByRole('heading', { name: /potential issues?/ }).textContent(),
  );
  const preview = page.getByRole('button', { name: 'Preview fix', exact: true });
  await expect(preview).toBeVisible();
  {
    await preview.click();
    await expect(page.getByRole('button', { name: 'Approve change' })).toBeEnabled({
      timeout: 30000,
    });
    await page.getByRole('button', { name: 'Deuteranopia', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Approve change' })).toBeEnabled();
    await page.getByRole('button', { name: 'Approve change' }).click();
    await expect(page.getByRole('button', { name: 'Change approved', exact: true })).toBeDisabled();
    await expect(page.getByRole('heading', { name: 'Approved changes' })).toBeVisible();
    await page.getByRole('button', { name: 'Download corrected PDF' }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download PDF', exact: true }).click();
    const file = await download;
    expect(file.suggestedFilename()).toContain('corrected');
    const correctedPath = path.join(os.tmpdir(), 'prism-corrected.pdf');
    await file.saveAs(correctedPath);
    expect((await PDFDocument.load(await readFile(correctedPath))).getPageCount()).toBe(3);
  }
  const report = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export report' }).click();
  const reportFile = await report;
  expect(reportFile.suggestedFilename()).toBe('PRISM-analysis-report.pdf');
  await reportFile.saveAs(path.join(os.tmpdir(), 'prism-report.pdf'));
  expect(
    (
      await PDFDocument.load(await readFile(path.join(os.tmpdir(), 'prism-report.pdf')))
    ).getPageCount(),
  ).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Download simulated PDF' }).click();
  const simulation = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PDF', exact: true }).click();
  expect((await simulation).suggestedFilename()).toContain('deutan');
  const workspaceAxe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(workspaceAxe.violations).toEqual([]);
  await page.setViewportSize({ width: 1024, height: 768 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: screenshot('workspace-tablet'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: screenshot('workspace-mobile'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Inspector', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Inspector', exact: true })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await page.goto('/');
  await page.screenshot({ path: screenshot('landing-mobile'), fullPage: true });
  expect(errors).toEqual([]);
  expect(remote).toEqual([]);
});

test('real PDF upload, selection cap, cancellation, native text, report and reload', async ({
  page,
}) => {
  const pdf = await PDFDocument.create(),
    font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < 12; i++) {
    const p = pdf.addPage([500, 650]);
    p.drawText(`Test page ${i + 1}`, { x: 40, y: 600, size: 20, font });
    p.drawRectangle({ x: 80, y: 240, width: 150, height: 200, color: rgb(0.75, 0.286, 0.251) });
    p.drawRectangle({ x: 230, y: 240, width: 150, height: 200, color: rgb(0.427, 0.514, 0.243) });
  }
  const bytes = await pdf.save();
  await page.goto('/');
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'test.pdf', mimeType: 'application/pdf', buffer: Buffer.from(bytes) });
  await expect(page.getByRole('heading', { name: 'Choose the pages to explore.' })).toBeVisible();
  await page.getByLabel('Page numbers').fill('1-11');
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await expect(page.locator('p[role=alert]')).toContainText('no more than 10');
  await page.getByLabel('Page numbers').fill('1-2');
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.getByRole('button', { name: 'Analyze selected pages' }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('status').last()).toContainText('cancelled');
  await page.getByRole('button', { name: 'Choose pages again' }).click();
  await page.getByRole('button', { name: 'Select page 1', exact: true }).click();
  await page.getByRole('button', { name: 'Analyze selected pages' }).click();
  await expect(page.getByRole('status').last()).toHaveText('Analysis completed locally', {
    timeout: 150000,
  });
  await expect(page.getByRole('heading', { name: 'Page 1', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Download simulated PDF' }).click();
  const simulation = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PDF', exact: true }).click();
  const download = await simulation;
  const output = path.join(os.tmpdir(), 'prism-real-simulation.pdf');
  await download.saveAs(output);
  const exported = await PDFDocument.load(await readFile(output));
  expect(exported.getPageCount()).toBe(12);
  expect(exported.getPage(11).getSize()).toEqual({ width: 500, height: 650 });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Start with a textbook.' })).toBeVisible();
});

test('invalid uploads and standalone content routes', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({
    name: 'bad.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('invalid'),
  });
  await expect(page.locator('p[role=alert]')).toContainText('not a valid');
  await page.locator('input[type=file]').setInputFiles({
    name: 'corrupt.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.7\ncorrupted'),
  });
  await expect(page.locator('p[role=alert]')).toContainText('could not be opened');
  for (const [url, title] of [
    ['/methodology/', 'A score you can look inside.'],
    ['/about/', 'More ways to see.More ways to learn.'],
  ]) {
    await page.goto(url);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
  }
});

test('PNG and JPEG upload; OCR failure keeps visual results; mobile accessibility', async ({
  page,
}) => {
  await page.goto('/');
  const images = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 480;
    c.height = 600;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 480, 600);
    ctx.fillStyle = '#172338';
    ctx.font = '24px Arial';
    ctx.fillText('A local textbook page', 25, 55);
    ctx.fillStyle = '#bf4940';
    ctx.fillRect(60, 150, 170, 250);
    ctx.fillStyle = '#6d833e';
    ctx.fillRect(230, 150, 170, 250);
    return [c.toDataURL('image/png').split(',')[1], c.toDataURL('image/jpeg').split(',')[1]];
  });
  await page.locator('input[type=file]').setInputFiles({
    name: 'page.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from(images[1], 'base64'),
  });
  await expect(page.getByRole('heading', { name: 'Choose the pages to explore.' })).toBeVisible();
  await page.getByRole('link', { name: 'Choose a different file' }).click();
  await page.locator('input[type=file]').setInputFiles({
    name: 'page.png',
    mimeType: 'image/png',
    buffer: Buffer.from(images[0], 'base64'),
  });
  await page.route('**/vendor/ocr-worker.min.js', (route) => route.abort());
  await page.getByRole('button', { name: 'Analyze selected pages' }).click();
  await expect(page.getByRole('status').last()).toHaveText('Analysis completed locally', {
    timeout: 150000,
  });
  await expect(page.getByRole('heading', { name: 'Page 1', exact: true })).toBeVisible();
  await page.getByText('Analysis notes & limitations').click();
  await expect(
    page.getByText('English text recognition was unavailable. Visual-region analysis continued.'),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(result.violations).toEqual([]);
});
