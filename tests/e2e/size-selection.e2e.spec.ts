import { expect, test } from '@playwright/test'

test('a size can be chosen and defaults to M', async ({ page }) => {
  await page.goto('/products/midnight-tee')
  await expect(page.getByRole('button', { name: 'M', exact: true, pressed: true })).toBeVisible()
  await page.getByRole('button', { name: 'L', exact: true }).click()
  await expect(page.getByRole('button', { name: 'L', exact: true, pressed: true })).toBeVisible()
})
