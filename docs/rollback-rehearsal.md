# Rollback rehearsal

A deliberate production break, recovered with Vercel's instant rollback, then properly
fixed. Run on 2026-09-06 against the live shop at https://overprint-shop.vercel.app.

The point of rehearsing is to find out what you don't know while it's cheap. Two things
here were not in the plan, and both would have cost time during a real incident.

---

## What was broken, and why that break

`SHOP_NAME` in `src/lib/constants.ts` was changed from `Overprint` to
`THIS RELEASE IS BROKEN — rollback rehearsal in progress`.

Chosen because it is **visible and harmless**: it changes the catalogue heading and nothing
else. No data, no checkout path, no webhook. A rehearsal that risks real damage is not a
rehearsal.

It was also chosen because **no test could catch it**, which turned out to be the most
useful part.

---

## The sequence

| # | Step | Result |
|---|---|---|
| 1 | PR #10 merged into `main` | **CI passed.** Sandbox preview showed the broken heading |
| 2 | PR #11 promoted `main` → `production` | Live site showed `THIS RELEASE IS BROKEN` |
| 3 | Vercel **Instant Rollback** | Live site healthy again in seconds, no rebuild |
| 4 | PR #12 reverted the break in `main` | Repository fixed |
| 5 | PR #13 promoted `main` → `production` | Repository and live site agree again |

Steps 4 and 5 are the ones it is tempting to skip, and the reason they matter is below.

---

## Finding 1 — CI passed on the broken change

The pipeline was completely green on a page any human would immediately call broken.

That is not a gap in the tests. It is what tests are:

- The end-to-end test asserts the catalogue heading **against the same constant that was
  changed**, so it followed the break rather than catching it.
- `tsc` has no opinion about the contents of a string.
- `eslint` has no opinion about the contents of a string.

A test suite encodes what someone thought to check. This change was syntactically perfect,
type-correct, and consistent with itself — and wrong. **A green pipeline means "nothing I
thought to check is broken", not "this is fine to ship".**

That is precisely the class of failure instant rollback exists for, and it is why the
human-checks-the-preview step in this project's production rules is not ceremony.

---

## Finding 2 — Instant Rollback was greyed out on the obvious row

The first attempt failed. The row directly beneath the current production deployment had
**Instant Rollback disabled**, with this tooltip:

> *Only deployments previously aliased to a production domain can be rolled back.*

Accurate, and close to useless mid-incident. What it means is: **you can only roll back to a
deployment that was itself once live.**

The deployments list interleaves preview and production builds, and this project produces a
preview deployment on every merge into `main`. So at the moment of the rollback the list
read:

```
 7m   Production   ← broken, currently live
12m   Preview      ← greyed out, never held the production domain
16m   Preview      ← greyed out
25m   Preview      ← greyed out
59m   Production   ← the actual rollback target
```

**The last good deployment was four rows down.** In a busier pipeline it could be twenty.

**The fix:** set the **Environment** filter on the Deployments tab to **Production**. The
list then shows only rollback-eligible deployments, and the row below the current one is the
right one.

Worth knowing before an incident rather than during one, because the instinct under pressure
is to click the row immediately below and conclude that rollback is broken.

---

## Finding 3 — the rollback fixed the deployment, not the repository

Immediately after the rollback, these two things were both true:

```
Live site:          Overprint                                        ✓ healthy
production branch:  'THIS RELEASE IS BROKEN — rollback rehearsal…'   ✗ still broken
```

Verified directly with `git show origin/production:src/lib/constants.ts`.

The live site was serving a deployment whose source no longer matched any branch. Nothing in
git had changed, and nothing warned about the divergence. **The next deploy from
`production` — for any reason, including an unrelated change — would have silently
reintroduced the break.**

So a rollback restores *service*. A revert restores *truth*. You need both, in that order:

```
rollback   → live site serves an older deployment; repo still broken   (service restored)
revert     → repo fixed; live site still on the old deployment         (truth restored)
promote    → new deployment built from fixed code                      (aligned again)
```

Being in the middle state is fine for minutes and dangerous for days. It is the state where
someone redeploys for an unrelated reason and a bug reappears with no apparent cause.

---

## What this would look like in a real incident

1. **Roll back first.** Recovery in seconds beats a fix-forward that has to pass CI and
   deploy. Do not debug while users are looking at a broken page.
2. **Filter the deployments list to Production** to find a valid target, and expect it not
   to be the row directly below.
3. **Then** revert in git and promote the revert, so the repository matches what is running.
4. Note that if the broken change had also included a **database migration**, rollback would
   not have been enough on its own — Vercel restores code, not schema. This project has no
   such migration in flight, but that is the scenario worth rehearsing next.

---

## Evidence

Screenshots of the broken live site, the healthy site after rollback, and the Vercel
deployments list showing the rollback are in [`docs/evidence/`](./evidence/).

Pull requests: [#10](https://github.com/pehhalt/overprint-shop/pull/10) (break),
[#11](https://github.com/pehhalt/overprint-shop/pull/11) (promote break),
[#12](https://github.com/pehhalt/overprint-shop/pull/12) (revert),
[#13](https://github.com/pehhalt/overprint-shop/pull/13) (promote revert).
