import type { Media } from '@/payload-types'

type ProductImageProps = {
  /** The populated media document. Both pages already query with `depth: 1`. */
  media: Pick<Media, 'url' | 'alt' | 'generatedBy'>
  /** Passed straight through to the `<img>`, so callers keep their existing classes. */
  className?: string
}

export function ProductImage({ media, className }: ProductImageProps) {
  // An empty `src` is not a blank image: the browser resolves it to the current document
  // and re-requests the page. Both call sites happen to guard first, so this is
  // unreachable today — but the fix belongs here once, not in every future caller.
  if (!media.url) return null

  return (
    <figure>
      <img src={media.url} alt={media.alt} className={className} />
      {media.generatedBy === 'ai' && (
        <figcaption className="mt-1 text-xs text-neutral-600">AI-generated image</figcaption>
      )}
    </figure>
  )
}
