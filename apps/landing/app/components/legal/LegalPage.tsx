import { useEffect } from "react";
import type { MetaDescriptor } from "react-router";

import { ButtonLink } from "~/components/ButtonLink";
import { CursorGlow } from "~/components/CursorGlow";
import { SiteFooter } from "~/components/SiteFooter";
import { SiteHeader } from "~/components/SiteHeader";
import { watchAway } from "~/lib/away";
import { startIntro } from "~/lib/intro";
import type { LegalBlock, LegalDoc } from "~/lib/legal/types";
import { SITE_NAME, SITE_URL } from "~/lib/site";

/*
 * A legal document in the page's own night: a masthead under twinkling stars, a lit "In short" panel, then one
 * section per clause, each wearing the next season (the journey's palettes) so a long read keeps a rhythm.
 * All styling is legal.css; the text lives in lib/legal/*.ts and this file never decides what it says.
 */

const SEASONS = ["spring", "summer", "autumn", "winter"] as const;
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "2026-09-30" → "30 September 2026", by hand so the server and the browser can never disagree on a timezone. */
function formatDay(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;
const SAFE_HREF = /^(https?:\/\/|mailto:|\/|#)/;

/** `**bold**`, `` `code` `` and `[label](href)`: the only markup the documents may use. */
function Inline({ text }: { text: string }) {
  return text.split(INLINE).map((part, i) => {
    if (part.startsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`")) return <code key={i}>{part.slice(1, -1)}</code>;
    const link = part.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
    if (link && SAFE_HREF.test(link[2])) {
      const external = /^https?:\/\//.test(link[2]);
      return (
        <a key={i} href={link[2]} {...(external ? { target: "_blank", rel: "noreferrer" } : {})}>
          {link[1]}
        </a>
      );
    }
    return part;
  });
}

function Block({ block }: { block: LegalBlock }) {
  switch (block.kind) {
    case "p":
      return (
        <p>
          <Inline text={block.text} />
        </p>
      );
    case "sub":
      return <h3 className="legal-sub font-display">{block.title}</h3>;
    case "list":
      return (
        <ul className="legal-list">
          {block.items.map((item) => (
            <li key={item}>
              <Inline text={item} />
            </li>
          ))}
        </ul>
      );
    case "table":
      return (
        <div className="legal-table-wrap">
          <table className="legal-table">
            <thead>
              <tr>
                {block.head.map((h) => (
                  <th key={h} scope="col">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row) => (
                <tr key={row[0]}>
                  {row.map((cell, i) => (
                    // The header text rides along as a label, for the stacked phone layout
                    <td key={i} data-label={block.head[i]}>
                      <Inline text={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "gap":
      return (
        <aside className="legal-gap">
          <p className="legal-gap-label font-display">
            <span className="glint-star" aria-hidden="true" />
            Not yet · {block.title}
          </p>
          <p>
            <Inline text={block.text} />
          </p>
        </aside>
      );
  }
}

function words(doc: LegalDoc) {
  const text = [doc.lede, ...doc.inShort];
  for (const s of doc.sections)
    for (const b of s.blocks) {
      if (b.kind === "p") text.push(b.text);
      else if (b.kind === "list") text.push(...b.items);
      else if (b.kind === "gap") text.push(b.text);
      else if (b.kind === "table") text.push(...b.rows.flat());
    }
  return text.join(" ").split(/\s+/).length;
}

export function legalMeta(doc: LegalDoc, path: string): MetaDescriptor[] {
  const title = `${doc.title} · ${SITE_NAME}`;
  return [
    { title },
    { name: "description", content: doc.description },
    { tagName: "link", rel: "canonical", href: `${SITE_URL}${path}` },
    { property: "og:type", content: "article" },
    { property: "og:site_name", content: SITE_NAME },
    { property: "og:url", content: `${SITE_URL}${path}` },
    { property: "og:title", content: title },
    { property: "og:description", content: doc.description },
    { property: "og:image", content: `${SITE_URL}/og-image.png` },
    { name: "twitter:card", content: "summary_large_image" },
  ];
}

function TocLinks({ doc }: { doc: LegalDoc }) {
  return (
    <ol className="legal-toc-list">
      {doc.sections.map((s, i) => (
        <li key={s.id}>
          <a href={`#${s.id}`} className="legal-toc-link">
            <span className="legal-toc-num font-display">{String(i + 1).padStart(2, "0")}</span>
            {s.title}
          </a>
        </li>
      ))}
    </ol>
  );
}

export function LegalPage({
  doc,
  eyebrow,
  other,
}: {
  doc: LegalDoc;
  eyebrow: string;
  /** The sibling document, offered at the end. */
  other: { label: string; href: string };
}) {
  // No Hero is mounted to lift the head script's hold; idle loops rest while the tab is away.
  useEffect(() => {
    startIntro();
    return watchAway();
  }, []);

  const minutes = Math.max(1, Math.round(words(doc) / 220));

  return (
    <div className="ambient-backdrop legal relative flex min-h-dvh flex-col">
      <span className="legal-progress" aria-hidden="true" />
      <SiteHeader />

      <main id="main" className="flex-1">
        <div className="legal-masthead">
          <span className="legal-stars legal-stars-a" aria-hidden="true" />
          <span className="legal-stars legal-stars-b" aria-hidden="true" />
          <span className="legal-moon" aria-hidden="true" />
          <div className="legal-masthead-copy">
            <p className="legal-eyebrow legal-in" style={{ "--i": 0 } as React.CSSProperties}>
              {eyebrow}
            </p>
            <h1 className="legal-title font-display legal-in" style={{ "--i": 1 } as React.CSSProperties}>
              {doc.title}
            </h1>
            <div className="legal-crest legal-in" style={{ "--i": 2 } as React.CSSProperties} aria-hidden="true">
              <span />
              <svg viewBox="-8 -8 16 16" focusable="false">
                <path d="M0,-8Q0,0 8,0Q0,0 0,8Q0,0 -8,0Q0,0 0,-8Z" fill="currentColor" />
              </svg>
              <span />
            </div>
            <p className="legal-lede legal-in" style={{ "--i": 3 } as React.CSSProperties}>
              {doc.lede}
            </p>
            <p className="legal-meta legal-in" style={{ "--i": 4 } as React.CSSProperties}>
              <span>Updated {formatDay(doc.updated)}</span>
              <span>{minutes} min read</span>
            </p>
          </div>
        </div>

        <div className="legal-layout">
          <nav aria-label="On this page" className="legal-toc">
            <p className="legal-toc-title font-display">On this page</p>
            <TocLinks doc={doc} />
          </nav>
          <details className="legal-toc-mobile">
            <summary className="font-display">On this page</summary>
            <nav aria-label="On this page">
              <TocLinks doc={doc} />
            </nav>
          </details>

          <article className="legal-doc">
            <div className="legal-panel">
              <span className="panel-gem panel-gem-tl" />
              <span className="panel-gem panel-gem-br" />
              <h2 className="legal-panel-title font-display">In short</h2>
              <ul className="grid gap-3">
                {doc.inShort.map((line) => (
                  <li key={line} className="glint">
                    <span className="glint-star" aria-hidden="true" />
                    <span>
                      <Inline text={line} />
                    </span>
                  </li>
                ))}
              </ul>
              <p className="legal-panel-note">
                The full text below is what counts; this is only the gist.
              </p>
            </div>

            {doc.sections.map((s, i) => (
              <section key={s.id} id={s.id} data-season={SEASONS[i % 4]} className="legal-section">
                <header className="legal-section-head">
                  <span className="legal-num font-display" aria-hidden="true">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h2 className="font-display">{s.title}</h2>
                </header>
                <div className="legal-body">
                  {s.blocks.map((b, j) => (
                    <Block key={j} block={b} />
                  ))}
                </div>
              </section>
            ))}

            <div className="legal-end">
              <ButtonLink href={other.href} variant="ghost">
                {other.label}
              </ButtonLink>
              <ButtonLink href="/" variant="quiet">
                Back to Cadence
              </ButtonLink>
            </div>
          </article>
        </div>
      </main>

      <SiteFooter />
      <CursorGlow />
    </div>
  );
}
