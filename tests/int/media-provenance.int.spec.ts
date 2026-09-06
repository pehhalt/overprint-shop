/**
 * Task 7: the AI disclosure caption (EU AI Act Art. 50(4)).
 *
 * `ProductImage` is a server component, rendered directly with
 * `react-dom/server` the way `order-success.int.spec.ts` renders `SuccessPage`
 * — no database involved, since the component only formats a media document
 * it's handed.
 */
import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ProductImage } from '@/app/(frontend)/ProductImage'

describe('ProductImage (Task 7)', () => {
  it('labels an AI-generated image', () => {
    const html = renderToStaticMarkup(
      createElement(ProductImage, { media: { url: '/x.png', alt: 'A shirt', generatedBy: 'ai' } }),
    )
    expect(html).toContain('AI-generated image')
  })

  it('does not label a photograph', () => {
    const html = renderToStaticMarkup(
      createElement(ProductImage, {
        media: { url: '/x.png', alt: 'A shirt', generatedBy: 'photograph' },
      }),
    )
    expect(html).not.toContain('AI-generated image')
  })
})
