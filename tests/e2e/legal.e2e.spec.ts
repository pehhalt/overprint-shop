import { expect, test } from '@playwright/test'

// Scoped to the footer. Since the header also links to /legal, an unscoped
// query matches two elements and fails strict mode — and would pass on a page
// that had lost its footer entirely, which is the thing this test exists to
// catch.
test('every storefront page links to the legal page from the footer', async ({ page }) => {
  for (const path of ['/', '/products', '/products/midnight-tee', '/order/success']) {
    await page.goto(path)
    const footer = page.getByRole('contentinfo')
    await expect(footer.getByRole('link', { name: /legal/i }), `no footer link on ${path}`).toBeVisible()
  }
})

test('the legal page names the contact and the AI disclosure', async ({ page }) => {
  await page.goto('/legal')
  await expect(page.getByText('overprintdemoshop@gmail.com')).toBeVisible()
  await expect(page.getByText(/AI-generated/i).first()).toBeVisible()
})

test('the admin panel has no storefront chrome', async ({ page }) => {
  await page.goto('/admin')
  await expect(page.getByRole('link', { name: /legal/i })).toHaveCount(0)
  await expect(page.getByRole('contentinfo')).toHaveCount(0)
})

test('the footer carries the copyright line', async ({ page }) => {
  await page.goto('/')
  // Fixed year, not the current one: this is a dated coursework demonstration,
  // not a shop that will still be running next year.
  await expect(page.getByRole('contentinfo')).toContainText('Overprint © 2026')
})
