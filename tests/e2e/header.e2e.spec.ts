import { expect, test } from '@playwright/test'

// The header is scoped with getByRole('banner') throughout, because the footer
// also links to /legal — an unscoped link query would match both and pass for
// the wrong reason.
const STOREFRONT_PAGES = ['/', '/products', '/products/midnight-tee', '/legal', '/order/success']

test('every storefront page carries the header', async ({ page }) => {
  for (const path of STOREFRONT_PAGES) {
    await page.goto(path)
    const header = page.getByRole('banner')
    await expect(header, `header missing on ${path}`).toBeVisible()
    await expect(header.getByRole('link', { name: /overprint/i })).toBeVisible()
  }
})

test('the logo links to the start page', async ({ page }) => {
  await page.goto('/products')
  await expect(page.getByRole('banner').getByRole('link', { name: /overprint/i })).toHaveAttribute(
    'href',
    '/',
  )
})

test('the navigation points at the catalogue and the legal page', async ({ page }) => {
  await page.goto('/')
  const nav = page.getByRole('banner')

  await expect(nav.getByRole('link', { name: 'T-shirts', exact: true })).toHaveAttribute(
    'href',
    '/products',
  )
  await expect(nav.getByRole('link', { name: 'Legal & privacy', exact: true })).toHaveAttribute(
    'href',
    '/legal',
  )
})

test('clicking T-shirts reaches the catalogue', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('banner').getByRole('link', { name: 'T-shirts', exact: true }).click()
  await expect(page).toHaveURL(/\/products$/)
  await expect(page.locator('li')).not.toHaveCount(0)
})

test('the admin panel has no storefront header', async ({ page }) => {
  await page.goto('/admin')
  await expect(page.getByRole('link', { name: /overprint/i })).toHaveCount(0)
})

test('the start page shows the banner, labelled as AI-generated', async ({ page }) => {
  await page.goto('/')

  const banner = page.getByRole('img', { name: /crowd|gig|concert|stage/i })
  await expect(banner).toBeVisible()

  // The label must be real text in the server-rendered page, not a tooltip or a
  // hover state — the disclosure is for whoever looks at the image.
  await expect(page.getByText('AI-generated image', { exact: true })).toBeVisible()
})
