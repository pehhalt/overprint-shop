import { expect, test } from '@playwright/test'

test('the buy button is locked until the terms are accepted', async ({ page }) => {
  await page.goto('/products/midnight-tee')

  const buy = page.getByRole('button', { name: /buy this shirt/i })
  await expect(buy).toBeDisabled()

  await page.getByRole('checkbox', { name: /accept the terms/i }).check()
  await expect(buy).toBeEnabled()
})

test('the terms checkbox links to the legal page', async ({ page }) => {
  await page.goto('/products/midnight-tee')
  await expect(page.getByRole('link', { name: /terms and privacy notice/i })).toHaveAttribute(
    'href',
    '/legal',
  )
})
