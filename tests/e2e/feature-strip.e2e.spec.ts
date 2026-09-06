import { expect, test } from '@playwright/test'

// Wording taken 1:1 from the design, minus "Worldwide Shipping" — three items
// to match the shop's three product columns.
const FEATURES = [
  ['Printed on demand', 'No overproduction. A smaller footprint.'],
  ['Support independent art', 'Wear what you believe in.'],
  ['High-quality tees', 'Great shirts. Long-lasting prints.'],
]

test('the start page carries the three feature items', async ({ page }) => {
  await page.goto('/')

  for (const [heading, blurb] of FEATURES) {
    await expect(page.getByText(heading, { exact: true }), `missing: ${heading}`).toBeVisible()
    await expect(page.getByText(blurb, { exact: true }), `missing: ${blurb}`).toBeVisible()
  }
})

test('the dropped shipping claim is nowhere on the start page', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText(/worldwide shipping/i)).toHaveCount(0)
})

test('the feature strip sits below the banner', async ({ page }) => {
  await page.goto('/')
  const banner = await page.getByRole('img', { name: /gig/i }).boundingBox()
  const first = await page.getByText('Printed on demand', { exact: true }).boundingBox()
  expect(first!.y).toBeGreaterThan(banner!.y + banner!.height)
})
