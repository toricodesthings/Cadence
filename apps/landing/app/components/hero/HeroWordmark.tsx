import { ButtonLink } from "~/components/ButtonLink";
import { ArrowIcon, GitHubIcon } from "~/components/icons";
import { HERO_SENTENCE, REPO_URL, SIGN_UP_URL, SITE_NAME, SITE_TAGLINE } from "~/lib/site";
import { cssVars } from "~/lib/geometry";

/** The loading screen's wordmark, larger, then one tagline, one sentence, two buttons and a scroll cue. */
export function HeroWordmark() {
  return (
    <div className="hero-copy" data-depth={-3}>
      <h1 id="hero-title" className="hero-wordmark font-display font-medium uppercase">
        <span className="hero-wordmark-halo" aria-hidden="true" />
        <span className="hero-rule hero-rule-l" aria-hidden="true" />
        <span className="hero-wordmark-text" data-text={SITE_NAME}>
          {SITE_NAME}
        </span>
        <span className="hero-rule hero-rule-r" aria-hidden="true" />
      </h1>
      {/* Filigree crest between the name and the lines under it, drawn in like ink (hero.css): the diamond
          is traced, stems and curls run out of it, the hairlines follow a spark to the sky, the star kindles */}
      <div className="hero-divider" aria-hidden="true">
        <span className="hero-divider-arm hero-divider-arm-l">
          <span className="hero-divider-line" />
          <span className="hero-divider-nib" />
        </span>
        <span className="hero-divider-crest">
          <svg viewBox="-46 -13 92 26" focusable="false">
            <path className="hero-crest-core" d="M0 -6 6 0 0 6 -6 0Z" fill="var(--hero-crest-line)" />
            <g fill="none" stroke="var(--hero-crest)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
              {/* Both halves start at the top point, so the trace runs down each side at once */}
              <path className="hero-ink hero-ink-diamond" d="M0 -11 11 0 0 11" pathLength={1} />
              <path className="hero-ink hero-ink-diamond" d="M0 -11 -11 0 0 11" pathLength={1} />
              {[1, -1].map((side) => (
                <g key={side} transform={side < 0 ? "scale(-1 1)" : undefined}>
                  <path className="hero-ink hero-ink-stem" d="M11 0H46" stroke="var(--hero-crest-line)" pathLength={1} />
                  <path className="hero-ink hero-ink-curl" d="M25 0C28 -6.5 36 -6.5 36 -2.6 36 -0.4 33 -0.4 33 -2.2" pathLength={1} />
                  <path className="hero-ink hero-ink-curl" d="M25 0C28 6.5 36 6.5 36 2.6 36 0.4 33 0.4 33 2.2" pathLength={1} />
                  <path className="hero-crest-bead" d="M20 -2.6 22.6 0 20 2.6 17.4 0Z" fill="var(--hero-crest)" stroke="none" />
                </g>
              ))}
            </g>
          </svg>
          <span className="hero-divider-kindle">
            <span className="hero-divider-star" />
          </span>
        </span>
        <span className="hero-divider-arm hero-divider-arm-r">
          <span className="hero-divider-line" />
          <span className="hero-divider-nib" />
        </span>
      </div>
      <p className="hero-tagline font-display text-xl text-twilight-text sm:text-2xl">
        {SITE_TAGLINE}
      </p>
      <p className="hero-sentence text-base text-pretty text-twilight-text-soft sm:text-lg">
        {HERO_SENTENCE}
      </p>
      <div className="hero-actions">
        <ButtonLink href={SIGN_UP_URL} data-cloud="" className="hero-action" style={cssVars({ "--i": 0 })}>
          Start where you are
          <ArrowIcon className="button-icon button-arrow" />
        </ButtonLink>
        <ButtonLink href={REPO_URL} variant="ghost" className="hero-action" style={cssVars({ "--i": 1 })}>
          <GitHubIcon className="button-icon button-mark" />
          View on GitHub
        </ButtonLink>
      </div>
    </div>
  );
}
