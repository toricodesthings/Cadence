// Injected at build time from the root package.json (see vite.config.ts), e.g. "v0.9.1 Beta".
declare const __CADENCE_PUBLIC_VERSION__: string;

export const CADENCE_PUBLIC_VERSION = __CADENCE_PUBLIC_VERSION__;
export const CADENCE_REPOSITORY_URL = "https://github.com/toricodesthings/Cadence";
export const CADENCE_ISSUES_URL = `${CADENCE_REPOSITORY_URL}/issues`;
