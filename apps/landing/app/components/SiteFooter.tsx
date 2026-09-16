import {
  APP_URL,
  CHANGELOG_URL,
  FOOTER,
  ISSUES_URL,
  PRIVACY_URL,
  REPO_URL,
  SIGN_IN_URL,
  SITE_NAME,
  TERMS_URL,
} from "~/lib/site";

/*
 * The ground under everything, standing on the finale valley's last hills. It carries the page's own
 * vocabulary (the mark, the wordmark's treatment, the crest, the crest's gold for the group headings)
 * and says nothing the page has already said: the vows own "free" and "open source", the Prelude owns
 * "the whole year", so the footer's own lines are a sign-off and the way back up.
 */
const GROUPS = [
  {
    title: "The app",
    links: [
      { label: "Open the app", href: APP_URL },
      { label: "Sign in", href: SIGN_IN_URL },
      { label: "What's new", href: CHANGELOG_URL },
    ],
  },
  {
    title: "The code",
    links: [
      { label: "GitHub", href: REPO_URL },
      { label: "Report an issue", href: ISSUES_URL },
    ],
  },
  {
    title: "The fine print",
    links: [
      { label: "Privacy", href: PRIVACY_URL },
      { label: "Terms", href: TERMS_URL },
    ],
  },
];

export function SiteFooter() {
  return (
    // The void, painted: the journey's sticky sky runs on under the footer at the page's end, and would show through
    <footer className="site-footer relative bg-twilight-void">
      {/* The valley's last light, spilling over the ground the footer stands on */}
      <span className="footer-glow" aria-hidden="true" />
      <div className="relative mx-auto w-full max-w-6xl px-6 pt-16 pb-10">
        <div className="grid gap-12 md:grid-cols-[1.2fr_2fr]">
          <div>
            <div className="flex items-center gap-2.5">
              <img
                src="/logo-mark.png"
                alt=""
                width={36}
                height={36}
                className="size-8 drop-shadow-[0_0_12px_var(--accent-glow)]"
              />
              <p className="font-display text-xl font-medium tracking-[0.28em] text-twilight-text uppercase">
                {SITE_NAME}
              </p>
            </div>
            <div className="mt-4 flex max-w-56 items-center gap-3" aria-hidden="true">
              <span className="h-px flex-1 bg-linear-to-r from-transparent to-accent-primary/50" />
              <svg viewBox="-8 -8 16 16" className="size-3 text-accent-primary" focusable="false">
                <path d="M0,-8Q0,0 8,0Q0,0 0,8Q0,0 -8,0Q0,0 0,-8Z" fill="currentColor" />
              </svg>
              <span className="h-px flex-1 bg-linear-to-l from-transparent to-accent-primary/50" />
            </div>
            <p className="mt-4 max-w-xs text-sm text-twilight-text-soft">{FOOTER.line}</p>
          </div>
          <nav aria-label="Footer" className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            {GROUPS.map((group) => (
              <div key={group.title}>
                <h2 className="footer-heading font-display">{group.title}</h2>
                <ul className="mt-2">
                  {group.links.map((link) => (
                    <li key={link.label}>
                      <a href={link.href} className="footer-link">
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>
        <div className="mt-12 flex flex-col items-center justify-between gap-2 border-t border-twilight-border pt-6 text-xs text-twilight-text-muted sm:flex-row">
          <p className="flex items-center gap-2">
            <span className="glint-star size-2.5" aria-hidden="true" />
            {FOOTER.sign}
          </p>
          <a href="#main" className="footer-link footer-top">
            {FOOTER.top}
          </a>
        </div>
      </div>
    </footer>
  );
}
