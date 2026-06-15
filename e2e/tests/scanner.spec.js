const { test, expect } = require('@playwright/test');

test('條件選股掃描器可輸入代號並執行掃描', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '條件選股' }).click();

  await expect(page.getByText('條件選股掃描器')).toBeVisible();

  const codesInput = page.getByPlaceholder(/2330 2317 2454/);
  await codesInput.fill('2330');

  // 快速選擇一組篩選條件，否則「開始掃描」按鈕會停用
  await page.getByRole('button', { name: '全選技術' }).click();

  await page.getByRole('button', { name: /開始掃描/ }).click();

  await expect(page.getByText(/掃描完成/)).toBeVisible({ timeout: 60000 });
});
