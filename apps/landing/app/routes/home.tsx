import { useEffect } from "react";

import type { Route } from "./+types/home";
import { CloudPass } from "~/components/CloudPass";
import { CursorGlow } from "~/components/CursorGlow";
import { Hero } from "~/components/hero/Hero";
import { Journey } from "~/components/journey/Journey";
import { SiteFooter } from "~/components/SiteFooter";
import { SiteHeader } from "~/components/SiteHeader";
import { watchAway } from "~/lib/away";
import {
  APP_URL,
  REPO_URL,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TAGLINE,
  SITE_URL,
} from "~/lib/site";

export const meta: Route.MetaFunction = () => [
  { title: `${SITE_NAME} · ${SITE_TAGLINE}` },
  { name: "description", content: SITE_DESCRIPTION },
  { tagName: "link", rel: "canonical", href: SITE_URL },
  { property: "og:type", content: "website" },
  { property: "og:site_name", content: SITE_NAME },
  { property: "og:url", content: SITE_URL },
  { property: "og:title", content: `${SITE_NAME} · ${SITE_TAGLINE}` },
  { property: "og:description", content: SITE_DESCRIPTION },
  { property: "og:image", content: `${SITE_URL}/og-image.png` },
  { property: "og:image:width", content: "1200" },
  { property: "og:image:height", content: "630" },
  { property: "og:image:alt", content: "The Cadence wordmark in a twilight sky, framed by two glowing branches" },
  { property: "og:image:type", content: "image/png" },
  { property: "og:locale", content: "en_US" },
  { name: "twitter:card", content: "summary_large_image" },
  {
    "script:ld+json": {
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "WebSite", "@id": `${SITE_URL}/#website`, url: `${SITE_URL}/`, name: SITE_NAME, description: SITE_DESCRIPTION, inLanguage: "en" },
        {
          "@type": "SoftwareApplication",
          "@id": `${SITE_URL}/#app`,
          name: SITE_NAME,
          url: APP_URL,
          description: SITE_DESCRIPTION,
          applicationCategory: "LifestyleApplication",
          operatingSystem: "Web, Windows",
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
          isAccessibleForFree: true,
          image: `${SITE_URL}/og-image.png`,
          sameAs: [REPO_URL],
        },
      ],
    },
  },
];

export default function Home() {
  // Idle loops rest while the tab is hidden or the window is in the background (lib/away.ts)
  useEffect(() => watchAway(), []);

  return (
    <div className="ambient-backdrop relative flex min-h-dvh flex-col">
      <SiteHeader className="hero-header" />

      <main id="main" className="flex-1">
        <Hero />
        <Journey />
      </main>

      <SiteFooter />
      <CursorGlow />
      <CloudPass />
    </div>
  );
}
