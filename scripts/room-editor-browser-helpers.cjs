async function confirmPreview(page) {
  await page.waitForFunction(() => document.querySelector('.room-editor-savebar button')?.disabled === false);
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await page.getByText('已保存', { exact: true }).waitFor();
}
module.exports = { confirmPreview };
