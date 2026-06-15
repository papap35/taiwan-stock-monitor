const { test, expect } = require('@playwright/test');

test('庫存總覽頁面可正常顯示', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '庫存總覽' }).click();

  // 尚未設定任何持股成本時顯示提示文字
  await expect(page.getByText('尚未設定任何持股成本')).toBeVisible();
});
