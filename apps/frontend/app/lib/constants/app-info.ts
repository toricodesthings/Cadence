// Injected at build time from the root package.json (see vite.config.ts), e.g. "v0.9.1 Beta".
declare const __CADENCE_PUBLIC_VERSION__: string;

export const CADENCE_PUBLIC_VERSION = __CADENCE_PUBLIC_VERSION__;
// Unique per build; the web app compares it with the deployed /version.json to offer a reload.
declare const __CADENCE_BUILD_ID__: string;
export const CADENCE_BUILD_ID = __CADENCE_BUILD_ID__;
export const CADENCE_REPOSITORY_URL = "https://github.com/toricodesthings/Cadence";
export const CADENCE_ISSUES_URL = `${CADENCE_REPOSITORY_URL}/issues`;
