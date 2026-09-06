import { expect, test } from '@playwright/test'

test('the catalogue lists products to an anonymous visitor', async ({ page }) => {
  await page.goto('/products')
  await expect(page.getByRole('heading', { name: 'T-Shirts', level: 1 })).toBeVisible()
  await expect(page.locator('li')).not.toHaveCount(0)
})
