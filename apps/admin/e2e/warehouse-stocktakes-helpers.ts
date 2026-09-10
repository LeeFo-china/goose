import { expect, type Page } from '@playwright/test';
export const backend = 'http://127.0.0.1:4001';
export type Write = { path: string; method: string; key: string; rawBody: string; persona: string;
  body: { expected_version: number; items?: { supplier_sku_id: string; counted_quantity?: string; difference_reason?: string | null }[] } };
export async function open(page: Page, scenario = 'normal', persona = 'all') {
  await page.request.post(`${backend}/__test/reset`, { data: { scenario } });
  await page.request.post('/api/auth/login', { data: { phone: persona } });
  await page.goto('/warehouse-stocktakes');
}
export async function writes(page: Page): Promise<Write[]> {
  const journal: Write[] = await (await page.request.get(`${backend}/__test/requests`)).json();
  return journal.filter(row => row.method === 'POST');
}
export async function scenario(page: Page, value: string) { await page.request.post(`${backend}/__test/scenario`, { data: { scenario: value } }); }
export async function draft(page: Page, count = 1) {
  await page.getByRole('button', { name: '新建盘点', exact: true }).click();
  await page.getByRole('region', { name: '盘点草稿' }).getByLabel('盘点仓库', { exact: true }).click();
  await page.getByRole('option', { name: '仓库01', exact: true }).click();
  await page.getByLabel('盘点原因', { exact: true }).fill('浏览器测试盘点');
  for (let index = 1; index <= count; index++) {
    await page.getByLabel('盘点材料', { exact: true }).click();
    await page.getByRole('option', { name: new RegExp(`节能灯${String(index).padStart(2, '0')}`) }).click();
  }
}
export async function save(page: Page) { await page.getByRole('button', { name: '保存草稿', exact: true }).click(); }
export async function action(page: Page, name: string) {
  await page.getByRole('button', { name, exact: true }).click();
  await expect(page.getByRole('alertdialog')).toHaveAccessibleName(name);
  await page.getByRole('button', { name: '确认执行', exact: true }).click();
}
export const detail = (page: Page) => page.getByRole('region', { name: '盘点单详情' });
export const quantity = (page: Page, index: number) => page.getByRole('textbox', { name: `实盘数量 节能灯${String(index).padStart(2, '0')} LED-${String(index).padStart(2, '0')}`, exact: true });
export const reason = (page: Page, index: number) => page.getByRole('textbox', { name: `差异原因 节能灯${String(index).padStart(2, '0')} LED-${String(index).padStart(2, '0')}`, exact: true });
export async function count(page: Page) { await page.getByRole('button', { name: '录入实盘', exact: true }).click(); }
export async function saveCounts(page: Page) { await page.getByRole('button', { name: '保存实盘', exact: true }).click(); }
