import { SIGN_IN_URL, SIGN_UP_URL, SITE_NAME } from "~/lib/site";

import { ButtonLink } from "./ButtonLink";
import { ArrowIcon } from "./icons";

export function SiteHeader({ className }: { className?: string }) {
  return (
    <header
      className={[
        "mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-5",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <a
        href="#main"
        className="sr-only rounded-xl bg-twilight-surface px-4 py-3 text-sm focus:not-sr-only focus:absolute focus:left-4 focus:top-4"
      >
        Skip to content
      </a>
      <a
        href="/"
        className="flex min-h-11 items-center gap-2.5 rounded-xl font-display text-xl font-semibold tracking-tight sm:text-2xl"
      >
        <img
          src="/logo-mark.png"
          alt=""
          width={40}
          height={40}
          className="size-9 drop-shadow-[0_0_10px_var(--accent-glow)] sm:size-10"
        />
        {/* The smallest phones show the mark alone; the name stays for screen readers */}
        <span className="max-[359px]:sr-only">{SITE_NAME}</span>
      </a>
      <nav aria-label="Primary" className="flex items-center gap-1 sm:gap-2">
        <ButtonLink href={SIGN_IN_URL} variant="quiet" className="max-sm:px-3.5">
          Sign in
        </ButtonLink>
        <ButtonLink href={SIGN_UP_URL} data-cloud="" className="max-sm:px-3.5">
          Get started
          {/* Phones drop the arrow so the header stays on one line */}
          <ArrowIcon className="button-icon button-arrow max-sm:hidden" />
        </ButtonLink>
      </nav>
    </header>
  );
}
