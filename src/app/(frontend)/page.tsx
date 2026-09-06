import Link from 'next/link'
import { FeatureStrip } from './FeatureStrip'

// The start page: the banner with its headline, and the claims beneath it.
// Featured tees and whatever else comes from the design are a later round.
//
// The banner sits in the same column as the header and the catalogue rather
// than running full-bleed — same max-w-4xl, same 32px side padding — so the
// page holds one width on a wide monitor and the image is never scaled past
// its natural size.
//
// A plain <img> rather than next/image, for the same reason the product images
// use one: next/image re-encodes, and this project keeps original bytes. See
// CLAUDE.md, "Never add image resizing".
//
// The headline is held to the left ~30% of the image on purpose. Both "The
// Chilis" marks in the photo have to stay clear: the one on the shirt starts
// at about 29% of the width, and the one on the stage screen sits between 85%
// and 99%. Percentages rather than pixels, so the safe zone holds at every
// width the banner is rendered at.
export default function StartPage() {
  return (
    <main className="mx-auto max-w-4xl px-8 py-6">
      <figure className="relative m-0">
        <img
          src="/shop-banner.png"
          alt="A man in a black band t-shirt at a live gig, stage lights and a crowd behind him"
          className="w-full rounded object-cover"
        />

        <div className="absolute inset-y-0 left-[4%] flex w-[36%] flex-col justify-start pt-[4%] sm:w-[30%] sm:justify-center sm:pt-0">
          {/* Same face and weight as the wordmark. The shadow is what keeps
              white type readable over a photograph this busy. */}
          <p className="text-sm font-extrabold uppercase leading-[0.95] tracking-tight text-white [text-shadow:0_2px_6px_rgb(0_0_0/0.7)] sm:text-2xl md:text-4xl">
            Good
            <br />
            <span className="text-red-600">Music</span>
            <br />
            Lives on
          </p>

          <Link
            href="/products"
            className="mt-2 w-fit whitespace-nowrap rounded bg-red-600 px-1.5 py-1 text-[0.5rem] font-bold uppercase tracking-wide text-white hover:bg-red-700 sm:tracking-widest sm:mt-3 sm:px-3 sm:py-1.5 sm:text-[0.6rem] md:mt-4 md:px-4 md:py-2 md:text-xs"
          >
            Shop t-shirts<span className="hidden sm:inline"> →</span>
          </Link>
        </div>

        {/* The banner is AI-generated, so it says so — legibly, in the
            server-rendered page, and with enough contrast that it reads as a
            label on the image rather than part of the artwork. It sits on the
            right so it is clear of the headline block. */}
        <figcaption className="absolute right-1.5 bottom-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[0.6rem] text-white sm:right-2 sm:bottom-2 sm:px-2 sm:py-1 sm:text-xs">
          AI-generated image
        </figcaption>
      </figure>

      <FeatureStrip />
    </main>
  )
}
