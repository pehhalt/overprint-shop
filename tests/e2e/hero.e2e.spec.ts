import { expect, test } from '@playwright/test'

// Where the two "The Chilis" marks sit in shop-banner.png, as a fraction of the
// image. Measured off the file: the one on the shirt starts at ~29% of the
// width and runs from ~59% of the height down; the one on the stage screen sits
// between 85% and 99% of the width. The headline must not reach either.
const SHIRT_MARK_LEFT = 29
const SHIRT_MARK_TOP = 59

test('the banner carries the headline and the shop button', async ({ page }) => {
  await page.goto('/')
  const figure = page.locator('figure')

  // One paragraph broken by <br>, so assert on its text rather than looking for
  // three separate elements. The words are uppercased in CSS, not in the DOM.
  const headline = figure.locator('p').first()
  await expect(headline).toContainText('Good')
  await expect(headline).toContainText('Music')
  await expect(headline).toContainText('Lives on')

  // "Music" is the only part in brand red, so it has to be its own element.
  await expect(headline.locator('span')).toHaveText('Music')

  const button = figure.getByRole('link', { name: /shop t-shirts/i })
  await expect(button).toHaveAttribute('href', '/products')
})

test('the shop button reaches the catalogue', async ({ page }) => {
  await page.goto('/')
  await page.locator('figure').getByRole('link', { name: /shop t-shirts/i }).click()
  await expect(page).toHaveURL(/\/products$/)
})

// The reason this is measured rather than eyeballed: the overlay is positioned
// in percentages, but the type is sized in steps, so a font-size change at one
// breakpoint can push the text over a mark without touching any other width.
for (const width of [390, 768, 1440]) {
  test(`the headline clears both Chilis marks at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')

    const measured = await page.evaluate(() => {
      const img = document.querySelector('figure img')!.getBoundingClientRect()
      const headline = document.querySelector('figure p')!
      // The <p> is a block, so its box is the container's width, not the type's.
      // Range rects give the ink.
      const range = document.createRange()
      range.selectNodeContents(headline)
      const inkRight = [...range.getClientRects()].reduce((m, r) => Math.max(m, r.right), 0)
      const button = document.querySelector('figure a')!.getBoundingClientRect()
      const pctX = (v: number) => ((v - img.x) / img.width) * 100
      const pctY = (v: number) => ((v - img.y) / img.height) * 100
      return {
        headlineRight: pctX(inkRight),
        buttonRight: pctX(button.right),
        buttonBottom: pctY(button.bottom),
      }
    })

    expect(measured.headlineRight).toBeLessThan(SHIRT_MARK_LEFT)

    // The button may sit lower than the mark's top edge only while it stays
    // left of the mark.
    const overlapsShirtMark =
      measured.buttonRight > SHIRT_MARK_LEFT && measured.buttonBottom > SHIRT_MARK_TOP
    expect(overlapsShirtMark).toBe(false)
  })
}
