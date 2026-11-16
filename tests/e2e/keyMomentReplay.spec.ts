import { expect, test } from '@playwright/test';

// Starts a career in the real UI, opens a Key Moment, picks a play and checks the
// 2D court replay plays without console or page errors.
test('a picked Key Moment play replays on the 2D court', async ({ page }) => {
  const problems: string[] = [];
  page.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') problems.push(`console: ${msg.text()}`);
  });

  await page.goto('/');
  const form = page.getByRole('form', { name: 'New career setup' });
  await form.getByRole('button', { name: 'Start MyCareer' }).click();

  // Opening Key Moments from the HUD. The dialog appears once a moment is queued.
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 60_000 });
  await expect(dialog.getByRole('group', { name: 'Choose an action' })).toBeVisible();
  await expect(dialog.getByRole('img', { name: /Court replay/ })).toHaveCount(0);

  // Picking a play starts the replay, which autoplays through the store's court.
  const firstPlay = dialog.getByRole('group', { name: 'Choose an action' }).getByRole('button').first();
  await firstPlay.click();
  const canvas = dialog.getByRole('img', { name: /Court replay/ });
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute('aria-label', /frame \d+ of \d+/);
  const box = await canvas.boundingBox();
  expect(box && box.width > 0 && box.height > 0).toBeTruthy();

  // The playhead advances while autoplaying: a later frame index shows up.
  const frameLabel = async () => (await canvas.getAttribute('aria-label')) ?? '';
  const first = await frameLabel();
  await expect.poll(frameLabel, { timeout: 5_000 }).not.toBe(first);

  expect(problems).toEqual([]);
});
