import { FeatureStrip } from './FeatureStrip'

// The start page: the banner, and the claims beneath it. Featured tees and
// whatever else comes from the design are a later round.
//
// The banner sits in the same column as the header and the catalogue rather
// than running full-bleed — same max-w-4xl, same 32px side padding — so the
// page holds one width on a wide monitor and the image is never scaled past
// its natural size.
//
// A plain <img> rather than next/image, for the same reason the product images
// use one: next/image re-encodes, and this project keeps original bytes. See
// CLAUDE.md, "Never add image resizing".
export default function StartPage() {
  return (
    <main className="mx-auto max-w-4xl px-8 py-6">
      <figure className="relative m-0">
        <img
          src="/shop-banner.png"
          alt="A man in a black band t-shirt at a live gig, stage lights and a crowd behind him"
          className="w-full rounded object-cover"
        />
        {/* The banner is AI-generated, so it says so — legibly, in the
            server-rendered page, and with enough contrast that it reads as a
            label on the image rather than part of the artwork. */}
        <figcaption className="absolute bottom-2 left-2 rounded bg-black/70 px-2 py-1 text-xs text-white">
          AI-generated image
        </figcaption>
      </figure>

      <FeatureStrip />
    </main>
  )
}
