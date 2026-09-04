import { expect, test } from '@playwright/test'

test('anyone may read products', async ({ request }) => {
  const response = await request.get('/api/products')
  expect(response.status()).toBe(200)
})

test('an anonymous visitor may not create a product', async ({ request }) => {
  const before = await request.get('/api/products')
  const { totalDocs: countBefore } = await before.json()

  const response = await request.post('/api/products', {
    data: { name: 'Pirate tee', slug: 'pirate-tee', price: 1, description: 'nope' },
  })
  expect([401, 403]).toContain(response.status())

  const after = await request.get('/api/products')
  const { totalDocs: countAfter } = await after.json()
  expect(countAfter).toBe(countBefore)
})
