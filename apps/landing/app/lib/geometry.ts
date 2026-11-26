import type { CSSProperties } from "react";

export * from "@cadence/geometry";

export const cssVars = (vars: Record<string, string | number>): CSSProperties => vars as CSSProperties;
