import { test, expect } from '@playwright/test';
import path from 'node:path';
import os from 'node:os';
import { PDFDocument, rgb } from 'pdf-lib';
import AxeBuilder from '@axe-core/playwright';

test('plate, profile evidence, masks, segmentation, crop and mobile layout', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/');
  await page.getByRole('link', { name: 'Figure lab' }).click();
  await expect(page).toHaveTitle(/Figure color analysis/);
  await page.getByRole('button', { name: 'Try the 74/21 plate' }).click();
  await expect(page.getByRole('button', { name: /Deuteranopia High concern/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const warnings = page.getByLabel('Inspect warning');
  const selected = page.getByRole('img', { name: /Selected region masks/ });
  const first = await selected.locator('path').first().getAttribute('d');
  await warnings.selectOption({ index: 1 });
  await expect(selected.locator('path').first()).not.toHaveAttribute('d', first!);
  await page.getByRole('button', { name: /Protanopia High concern/ }).click();
  await page.getByLabel('Simulated view').check();
  await expect(page.getByRole('img', { name: 'Simulated figure', exact: true })).toBeVisible();
  await page.getByLabel('Segmentation').selectOption('slic');
  await expect(page.getByText(/eligible pairs examined/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Protanopia High concern/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByLabel('Simulated view')).toBeChecked();
  await page.screenshot({
    path: path.join(os.tmpdir(), 'prism-figure-desktop.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Select a crop' }).click();
  await page.getByRole('spinbutton', { name: 'WIDTH', exact: true }).fill('80');
  await page.getByRole('spinbutton', { name: 'HEIGHT', exact: true }).fill('80');
  await page.getByRole('button', { name: 'Analyze crop' }).click();
  await expect(page.getByText(/80 × 80 px/)).toBeVisible();
  await expect(page.getByText('Insufficient evidence', { exact: true })).toHaveCount(3);
  await page.getByRole('button', { name: 'Use whole page' }).click();
  await expect(page.getByLabel('Inspect warning')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: path.join(os.tmpdir(), 'prism-figure-mobile.png'),
    fullPage: true,
  });
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  expect(errors).toEqual([]);
});

test('PDF page selection and pointer crop use the selected page pixels', async ({ page }) => {
  const pdf = await PDFDocument.create();
  pdf.addPage([300, 300]);
  const second = pdf.addPage([300, 300]);
  second.drawRectangle({ x: 50, y: 100, width: 100, height: 100, color: rgb(0.74, 0.29, 0.27) });
  second.drawRectangle({ x: 150, y: 100, width: 100, height: 100, color: rgb(0.44, 0.53, 0.29) });
  await page.goto('/figure/');
  await page.getByLabel('Choose a figure or PDF').setInputFiles({
    name: 'figures.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(await pdf.save()),
  });
  await expect(page.getByText('Insufficient evidence', { exact: true })).toHaveCount(3);
  await page.getByRole('spinbutton', { name: /Page/ }).fill('2');
  await expect(page.getByLabel('Inspect warning')).toBeVisible();
  await page.getByRole('button', { name: 'Select a crop' }).click();
  const rect = await page.getByLabel('Source page for cropping').boundingBox();
  if (!rect) throw Error('Missing crop preview');
  await page.mouse.move(rect.x + rect.width * 0.4, rect.y + rect.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width * 0.6, rect.y + rect.height * 0.6);
  await page.mouse.up();
  const side = Number(
    await page.getByRole('spinbutton', { name: 'WIDTH', exact: true }).inputValue(),
  );
  expect(side).toBeGreaterThan(260);
  expect(side).toBeLessThan(300);
  await page.getByRole('button', { name: 'Analyze crop' }).click();
  await expect(page.getByLabel('Inspect warning')).toBeVisible();
  await expect(page.getByText(new RegExp(side + ' ×'))).toBeVisible();
});
