const { test, expect } = require('@playwright/test');

test('新增並移除自選股', async ({ page }) => {
  // 自動接受可能出現的 confirm() 對話框
  page.on('dialog', dialog => dialog.accept());

  await page.goto('/');
  await page.getByRole('button', { name: '自選股' }).click();

  const codeInput = page.getByPlaceholder('股票代號');
  await codeInput.fill('2330');
  await codeInput.press('Enter');

  // 等待查詢完成並顯示在清單中
  await expect(page.getByText('台積電').first()).toBeVisible({ timeout: 15000 });

  // 新增成功後會跳出「新增買入記錄」彈窗，先關閉
  const closeBtn = page.getByRole('button', { name: '×' });
  if (await closeBtn.count() > 0) {
    await closeBtn.first().click();
  }

  // 移除剛新增的股票
  await page.getByRole('button', { name: '刪除' }).first().click();
  await expect(page.getByText('尚未加入任何股票')).toBeVisible();
});
