# Cadence Landing — Agent Instructions

The introduction site on the root domain (`cadenceapp.cloud`). React Router v8 **framework mode, prerendered** to static files and served by Cloudflare Workers Static Assets (no Worker runs), the opposite of the dashboard SPA (`apps/frontend`) on purpose: the first paint is complete HTML. It links into the app (`dashboard.cadenceapp.cloud`) and never calls the API.

## 1. Non-Negotiables

- Every route is prerendered at build time (`ssr: false` + `prerender`), so there is no request to read. No browser-only APIs (`window`, `localStorage`, `matchMedia`) at module scope or during render; they belong in effects. Pages must work before hydration: CTAs and cross-domain navigation are plain `<a>` links (`components/ButtonLink.tsx`).
- Keep the client bundle small. No auth, Hono RPC, TanStack Query, or `@cadence/*` packages beyond `@cadence/geometry` (pure scene math shared with the app's loading screen) unless a real need appears.
- Colors, fonts, and motion come from `app/app.css`, which mirrors the brand layer of `apps/frontend/app/app.css` (the design source of truth). Change a mirrored token there first, then here in the same change. Reference `--accent-*`/`accent-*`, never `--color-lantern` directly; never hardcode a one-off hex in a component. Scene colours are `--hero-*` tokens derived by `color-mix()` in `app.css`; scene motion uses the `var(--hero-still, …)` gate and `--hero-dur-scale`, with each base rule as the final pose. Keep motion composite-only: never write a custom property on `.hero` per frame (it restyles every SVG node) — pointer parallax writes `translate` on promoted `[data-depth]` layers; anything that loops forever is its own box animating only `transform`/`opacity` (an `<svg>` may fade but never move: Chrome composites no transform on an `<svg>` element, so wrap it; an animated SVG child repaints every frame), ends its shorthand with `var(--hero-loop, running)` so it rests while the page is away (`lib/away.ts`), and never shares a property with a finished `fill: both` animation on the same element (that keeps it off the compositor); no blend modes on anything that moves, and a filter only where it is painted once into a layer that then moves by transform alone (the boughs' blurred halo and heart, a sigil ring's glow). No `IntersectionObserver`: in Chrome a live one costs every running transform loop a main-thread frame per vsync; offscreen state comes from `lib/viewport.ts`. First paint must style only what shows: the journey's sections are skipped until the reader nears them (`content-visibility: auto`, with `overflow-clip-margin` so the bough still overhangs and a `contain-intrinsic-size` where content sets the height), so keep new below-the-fold scenery inside a section. Generated SVG geometry must stay deterministic (`lib/geometry.ts` re-exports `@cadence/geometry`: integer PRNG, no `Math.sin`/`pow`) so prerender and hydration match. Static scene SVG goes through `components/StaticSvg.tsx`: it is rendered to a string at build time and never hydrated, and its body is passed only under `import.meta.env.SSR` so the generator code stays out of the client bundle (each scene lives in a `*Scene.tsx` module that only the SSR branch imports). Anything JS reads or writes (`[data-depth]`, `.jsec`, `.prelude-branch`, `.bough-crossing`) stays a React element outside the static body, or is the `StaticSvg` element itself.
- Same accessibility floor as the app: visible focus on every interactive element (never `outline-none` without a replacement), hit targets ≥44px, `cursor-pointer` on interactive surfaces, no twilight-muted text below `/90`.
- Canonical URLs and site copy constants live in `app/lib/site.ts`; never inline dashboard, legal, or repo URLs.

## 2. Runtime Shape

- No Worker. `pnpm build` prerenders `/`, `/terms`, `/privacy` and `/404` into `build/client` (terms, privacy and 404 are flattened to `terms.html` etc., so `/terms` answers without a redirect). `wrangler.jsonc` serves that folder with `not_found_handling: "404-page"`, so unknown paths get `404.html` and a 404 status without running code. Security headers for every response live in `public/_headers` (`/assets/*` is immutable; the root icons, share image, robots and sitemap cache for a week or a day; HTML revalidates by ETag).
- `vite.config.ts`: Tailwind + React Router only (prerender runs in Node). `react-router.config.ts`: `ssr: false`, `prerender`. `package.json` `sideEffects: ["**/*.css"]` lets the client build drop scene modules it never calls.
- `app/root.tsx`: HTML shell, stylesheet + Latin font preloads, error boundary (real errors only), and the one inline head script (`lib/intro.ts`: before first paint it holds the hero intro at its first frame until the page has hydrated and gone idle, lifting itself after 3s if the JS never arrives, and flags a return visit so the hero skips its intro without a hydration snap). Routes in `app/routes.ts`; each route owns its SEO via `meta` (`/` also carries the JSON-LD); the speculation rules (prefetch between the landing's own pages) sit in `root.tsx`, and `public/` holds `sitemap.xml` and `robots.txt`. `routes/not-found.tsx` is the splat route that renders `components/NotFound.tsx` (a 404 is a page, not an error).
- `wrangler.jsonc` (`cadence-landing`): assets only, `workers_dev: false`; `cadenceapp.cloud` and `www` are attached as custom domains in the Cloudflare dashboard.

## 3. Source Layout

```text
app/
├── app.css            # Mirrored brand/scene tokens, blue-mauve dusk and coral-gold light shared across the journey, base rules
├── root.tsx, routes.ts
├── routes/            # home.tsx, not-found.tsx (the splat), terms.tsx, privacy.tsx (both render components/legal/LegalPage; the footer and the app's About tab link to them)
├── components/        # ButtonLink (lit-glass buttons; every primary wears one copper, `--accent-ember`), icons, SiteHeader, SiteFooter (mark, wordmark, crest, link groups; `.footer-*`
│                      # in app.css), CursorGlow, StaticSvg (build-time-only SVG islands), NotFound (the 404: the hero's sky and portrait boughs; `.lost` in hero.css, so it beats the unlayered
│                      # `.hero` tokens), CloudPass + cloud-pass.css (sign-up links marked `data-cloud` roll canvas-painted cloud banks over the screen, preconnect to the app, then navigate)
│   ├── hero/          # Hero (intro release, settle, offscreen pause, parallax effects), HeroSky (+ moon, which sets on the hero's scroll; comets), HeroLandscape (its ridge helpers are
│   │                  # shared with FinaleLand), HeroBough, HeroWordmark, hero.css; `*Scene.tsx` / `HeroSkyStage` hold the static drawings the wrappers render at build time (intro + return-visit entrance)
│   ├── legal/         # LegalPage (masthead, contents, "In short" panel, one seasonal section per clause; renders a LegalDoc) + legal.css
│   └── journey/       # Journey (`.journey` is the size container narrow-screen maths reads with `cqw`; the crown is watched only once the finale is near; deepening sticky sky, mist, Prelude with a mobile reading pause before its side-entering branch, offscreen pause), BoughSegment (+ boughSpecs.ts, BoughSegmentScene; per-section bough,
│                      # joined head to tail, behind all UI; fades into the copper crown; narrow strands alternate sides with curved crossings, then join the right-sweeping crown), Foliage (what each season's tips carry),
│                      # Chapter, Emilie (keystone chapter), Constellation (one <ul> over a compact faceted desktop atlas and a tall portrait chart with alternating labels),
│                      # Finale (crown, soft sky, the blossom seal around the signup link, one reassurance) + FinaleLand (wooded valley, lamplit hamlet, boats; shared canvas for mobile crop),
│                      # Sigil (rings of light; `blossom` seal that holds the finale's link), Drift (particle sets; finale depth layers), Panel, journey.css (scroll-timeline motion)
├── assets/            # logo-mark.png (96px crop for the header and footer; hashed by the bundler)
└── lib/               # site.ts (URLs + copy), legal/ (terms.ts, privacy.ts with its assistant sections in privacy-ai.ts: the documents as data, shape in types.ts; edit the text there, never in LegalPage), intro.ts (head script: intro hold + return-visit flag),
                       # geometry.ts (`@cadence/geometry` + `cssVars`), branch.ts (bough generator), viewport.ts (which sections are on screen:
                       # cached bounds, one shared scroll/resize listener and ResizeObserver, no IntersectionObserver), away.ts (`data-away` on <html> while the tab is hidden or unfocused)
public/                # favicon, apple-touch-icon.png (180px), sitemap.xml, og-image.png (share image: the hero's still pose,
                       # wordmark only, 1200×630; re-shoot when the hero's look changes), robots.txt, _headers
```

## 4. Commands

```bash
pnpm dev:landing                                    # http://localhost:8791
pnpm --filter @cadence/landing typecheck | build | preview   # preview builds, then serves build/client with wrangler dev
pnpm deploy:landing
```

Typecheck and build after changes.
