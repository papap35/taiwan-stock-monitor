const { test, expect } = require('@playwright/test');

test('首頁儀表板顯示大盤指數與市場廣度', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('大盤指數')).toBeVisible();
  await expect(page.getByText('市場廣度')).toBeVisible();
  await expect(page.getByText('漲跌排行')).toBeVisible();

  // 大盤指數面板應顯示一個數值（非單純載入中）
  const taiexPanel = page.locator('text=大盤指數').locator('..');
  await expect(taiexPanel).not.toContainText('載入中');
});

test('導覽列可切換到自選股頁面', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: '自選股' }).click();
  await expect(page.getByPlaceholder('股票代號')).toBeVisible();
});
