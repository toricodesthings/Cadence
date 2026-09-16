# Cadence Landing — Agent Instructions

The introduction site on the root domain (`cadenceapp.cloud`). React Router v8 **framework mode with SSR** on a Cloudflare Worker, the opposite of the dashboard SPA (`apps/frontend`) on purpose: the first paint is complete server-rendered HTML. It links into the app (`dashboard.cadenceapp.cloud`) and never calls the API.

## 1. Non-Negotiables

- Every route must render on the server. No browser-only APIs (`window`, `localStorage`, `matchMedia`) at module scope or during render; they belong in effects. Pages must work before hydration: CTAs and cross-domain navigation are plain `<a>` links (`components/ButtonLink.tsx`).
- Keep the client bundle small. No auth, Hono RPC, TanStack Query, or `@cadence/*` packages unless a real need appears.
- Colors, fonts, and motion come from `app/app.css`, which mirrors the brand layer of `apps/frontend/app/app.css` (the design source of truth). Change a mirrored token there first, then here in the same change. Reference `--accent-*`/`accent-*`, never `--color-lantern` directly; never hardcode a one-off hex in a component. Scene colours are `--hero-*` tokens derived by `color-mix()` in `app.css`; scene motion uses the `var(--hero-still, …)` gate and `--hero-dur-scale`, with each base rule as the final pose. Keep motion composite-only: never write a custom property on `.hero` per frame (it restyles every SVG node) — pointer parallax writes `translate` on promoted `[data-depth]` layers; anything that loops forever is its own box animating only `transform`/`opacity` (an `<svg>` may fade but never move: Chrome composites no transform on an `<svg>` element, so wrap it; an animated SVG child repaints every frame), ends its shorthand with `var(--hero-loop, running)` so it rests while the page is away (`lib/away.ts`), and never shares a property with a finished `fill: both` animation on the same element (that keeps it off the compositor); no blend modes on anything that moves, and a filter only where it is painted once into a layer that then moves by transform alone (the boughs' blurred halo and heart, a sigil ring's glow). No `IntersectionObserver`: in Chrome a live one costs every running transform loop a main-thread frame per vsync; offscreen state comes from `lib/viewport.ts`. First paint must style only what shows: the journey's sections are skipped until the reader nears them (`content-visibility: auto`, with `overflow-clip-margin` so the bough still overhangs and a `contain-intrinsic-size` where content sets the height), so keep new below-the-fold scenery inside a section. Generated SVG geometry must stay deterministic (`lib/geometry.ts`: integer PRNG, no `Math.sin`/`pow`) so SSR and hydration match.
- Same accessibility floor as the app: visible focus on every interactive element (never `outline-none` without a replacement), hit targets ≥44px, `cursor-pointer` on interactive surfaces, no twilight-muted text below `/90`.
- Canonical URLs and site copy constants live in `app/lib/site.ts`; never inline dashboard, legal, or repo URLs.

## 2. Runtime Shape

- `workers/app.ts`: Worker entry. Builds a `RouterContextProvider` (v8 always passes middleware context; bindings are read through `cloudflareContext` from `app/lib/cloudflare.ts`), hands the request to React Router, and adds security headers to server-rendered responses in production. Files in `build/client` are served by the assets layer before the Worker runs; their headers come from `public/_headers`.
- `vite.config.ts`: `@cloudflare/vite-plugin` with `viteEnvironment: { name: "ssr" }`, so dev and build render inside workerd. `react-router.config.ts`: `ssr: true`.
- `app/root.tsx`: HTML shell, stylesheet + Latin font preloads, error boundary (a 404 renders `components/NotFound.tsx`), and the one inline head script (`lib/intro.ts`: before first paint it holds the hero intro at its first frame until the page has hydrated and gone idle, lifting itself after 3s if the JS never arrives, and flags a return visit so the hero skips its intro without a hydration snap). Routes in `app/routes.ts`; each route owns its SEO via `meta` and its caching via `headers`.
- `wrangler.jsonc` (`cadence-landing`): the root/`www` custom domains are commented out until attached. `Env` comes from `worker-configuration.d.ts` (`cf-typegen`).

## 3. Source Layout

```text
app/
├── app.css            # Mirrored brand tokens, hero scene tokens, base rules, ambient-backdrop utility
├── root.tsx, routes.ts
├── routes/            # home.tsx
├── components/        # ButtonLink (layered lit-glass buttons, styles in app.css), icons, SiteHeader, SiteFooter (mark, wordmark, crest, link groups; `.footer-*`
│                      # in app.css), CursorGlow, NotFound (the 404: the hero's sky and portrait boughs; `.lost` in hero.css, so it beats the unlayered
│                      # `.hero` tokens), CloudPass + cloud-pass.css (sign-up links marked `data-cloud` roll canvas-painted cloud banks over the screen, then navigate)
│   ├── hero/          # Hero (intro release, settle, offscreen pause, parallax effects), HeroSky (+ moon, which sets on the hero's scroll; comets), HeroLandscape (its ridge helpers are
│   │                  # shared with FinaleLand), HeroBough, HeroWordmark, hero.css (intro + return-visit entrance)
│   └── journey/       # Journey (deepening sticky sky, mist, Prelude, the offscreen pause), BoughSegment (weeping-bough segment per section,
│                      # joined head to tail, behind all UI; ends in the crown; gutter strand on narrow screens), Foliage (what each season's tips carry),
│                      # Chapter, Emilie (keystone chapter), Constellation (the star chart: its <ul> placed over the drawing on wide screens),
│                      # Finale (crown, moon, blinking sky, the seal: its one link, vows) + FinaleLand (second valley: hamlet, boats, smoke, lights),
│                      # Sigil (rings of light; plum-crest `blossom` variant for the seal), Drift (particle sets), Panel, journey.css (scroll-timeline motion)
└── lib/               # site.ts (URLs + copy), cloudflare.ts (request context), intro.ts (head script: intro hold + return-visit flag),
                       # geometry.ts (deterministic helpers), branch.ts (bough generator), viewport.ts (which sections are on screen:
                       # cached bounds + scroll, no IntersectionObserver), away.ts (`data-away` on <html> while the tab is hidden or unfocused)
workers/app.ts         # Worker entry
public/                # favicon, logo (logo-mark.png: 96px crop for the header), og-image.png (share image: the hero's still pose,
                       # wordmark only, 1200×630; re-shoot when the hero's look changes), robots.txt, _headers
```

## 4. Commands

```bash
pnpm dev:landing                                    # http://localhost:8791
pnpm --filter @cadence/landing typecheck | build | preview | cf-typegen
pnpm deploy:landing
```

Typecheck and build after changes.
