import { Breadcrumbs } from '../../Breadcrumbs'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { notFound } from 'next/navigation'
import { formatPrice } from '@/lib/constants'
import { BuyButton } from './BuyButton'
import { ProductImage } from '../../ProductImage'

export const dynamic = 'force-dynamic'

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const payload = await getPayload({ config: configPromise })
  const { docs } = await payload.find({
    collection: 'products',
    where: { slug: { equals: slug } },
    depth: 1,
    limit: 1,
  })

  const product = docs[0]
  if (!product) notFound()

  return (
    <main className="mx-auto grid max-w-4xl gap-8 p-8 pt-4 md:grid-cols-2">
      {/* main is a two-column grid, so the trail spans both rather than
          becoming a column of its own */}
      <div className="md:col-span-2">
        <Breadcrumbs trail={[{ label: 'T-shirts', href: '/products' }, { label: product.name }]} />
      </div>
      {typeof product.image === 'object' && product.image?.url && (
        <ProductImage
          media={product.image}
          className="aspect-square w-full rounded-lg object-cover"
        />
      )}
      <div>
        <h1 className="text-2xl font-bold">{product.name}</h1>
        <p className="mt-2 text-xl">{formatPrice(product.price)}</p>
        <p className="mt-4 text-neutral-700">{product.description}</p>
        <BuyButton productId={String(product.id)} soldOut={Boolean(product.soldOut)} />
      </div>
    </main>
  )
}
