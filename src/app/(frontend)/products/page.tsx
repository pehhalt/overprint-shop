import { Breadcrumbs } from '../Breadcrumbs'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import Link from 'next/link'
import { formatPrice } from '@/lib/constants'
import { ProductImage } from '../ProductImage'

export const dynamic = 'force-dynamic'

export default async function CataloguePage() {
  const payload = await getPayload({ config: configPromise })
  const { docs: products } = await payload.find({
    collection: 'products',
    depth: 1,
    limit: 20,
  })

  return (
    <main className="mx-auto max-w-4xl p-8 pt-4">
      <Breadcrumbs trail={[{ label: 'T-shirts' }]} />
      <h1 className="text-3xl font-bold">T-Shirts</h1>
      <p className="mt-2 text-neutral-600">Printed to order. Nothing sits in a warehouse.</p>

      <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((product) => (
          <li key={product.id} className="rounded-lg border p-4">
            <Link href={`/products/${product.slug}`}>
              {typeof product.image === 'object' && product.image?.url && (
                <ProductImage
                  media={product.image}
                  className="aspect-square w-full rounded object-cover"
                />
              )}
              <h2 className="mt-3 font-medium">{product.name}</h2>
              <p className="text-neutral-600">{formatPrice(product.price)}</p>
              {product.soldOut && <p className="mt-1 text-sm font-medium">Sold out</p>}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
