import type { CSSProperties } from "react";

/* Deterministic scene math is shared with the app's loading screen through @cadence/geometry. */

export * from "@cadence/geometry";

export const cssVars = (vars: Record<string, string | number>): CSSProperties =>
  vars as CSSProperties;
