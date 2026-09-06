import { expect, test } from '@playwright/test'

test('every storefront page links to the legal page', async ({ page }) => {
  for (const path of ['/', '/products/midnight-tee', '/order/success']) {
    await page.goto(path)
    await expect(page.getByRole('link', { name: /legal/i })).toBeVisible()
  }
})

test('the legal page names the contact and the AI disclosure', async ({ page }) => {
  await page.goto('/legal')
  await expect(page.getByText('overprintdemoshop@gmail.com')).toBeVisible()
  await expect(page.getByText(/AI-generated/i).first()).toBeVisible()
})

test('the admin panel has no storefront footer', async ({ page }) => {
  await page.goto('/admin')
  await expect(page.getByRole('link', { name: /legal/i })).toHaveCount(0)
})
