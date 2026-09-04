import { expect, test } from '@playwright/test'
import { SHOP_NAME } from '@/lib/constants'

test('the catalogue lists products to an anonymous visitor', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: SHOP_NAME })).toBeVisible()
  await expect(page.locator('li')).not.toHaveCount(0)
})
