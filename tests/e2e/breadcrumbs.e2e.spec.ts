import { expect, test } from '@playwright/test'

const crumbs = (page: import('@playwright/test').Page) =>
  page.getByRole('navigation', { name: 'Breadcrumb' })

test('the start page has no breadcrumb — it is the root', async ({ page }) => {
  await page.goto('/')
  await expect(crumbs(page)).toHaveCount(0)
})

test('the catalogue shows home and itself', async ({ page }) => {
  await page.goto('/products')
  const nav = crumbs(page)

  await expect(nav.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/')
  // The page you are on is not a link — that is the whole point of the pattern.
  await expect(nav.getByText('T-shirts')).toHaveAttribute('aria-current', 'page')
  await expect(nav.getByRole('link', { name: 'T-shirts' })).toHaveCount(0)
})

test('a product shows the trail back through the catalogue', async ({ page }) => {
  await page.goto('/products/midnight-tee')
  const nav = crumbs(page)

  await expect(nav.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/')
  await expect(nav.getByRole('link', { name: 'T-shirts' })).toHaveAttribute('href', '/products')
  // The real product name, not the slug.
  await expect(nav.getByText('Midnight Tee')).toHaveAttribute('aria-current', 'page')
})

test('the legal page shows home and itself', async ({ page }) => {
  await page.goto('/legal')
  await expect(crumbs(page).getByText('Legal & privacy')).toHaveAttribute('aria-current', 'page')
})

test('the order confirmation shows home and itself', async ({ page }) => {
  await page.goto('/order/success')
  await expect(crumbs(page).getByText('Order confirmation')).toHaveAttribute('aria-current', 'page')
})

test('the breadcrumb home link reaches the start page', async ({ page }) => {
  await page.goto('/products/midnight-tee')
  await crumbs(page).getByRole('link', { name: 'Home' }).click()
  await expect(page).toHaveURL(/\/$/)
})

test('the admin panel has no breadcrumb', async ({ page }) => {
  await page.goto('/admin')
  await expect(crumbs(page)).toHaveCount(0)
})

// The product page is a two-column grid on desktop and a single column on a
// phone, so DOM order decides what a phone reader sees first. The title has to
// come before the image, the way every other page leads with its heading.
for (const width of [390, 1280]) {
  test(`the product title sits above the image at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/products/midnight-tee')

    const title = await page.getByRole('heading', { name: 'Midnight Tee', level: 1 }).boundingBox()
    const image = await page.locator('main figure img').first().boundingBox()

    expect(title!.y).toBeLessThan(image!.y)
  })
}
