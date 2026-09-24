import type { ReactNode } from "react";

/** Quiet trailing count shared by text navigation links. */
export function PlainNavCount({ count }: { count?: ReactNode }) {
    if (count === undefined || count === 0) return null;
    return <span aria-hidden="true" className="shrink-0 text-[13px] tabular-nums text-twilight-text-soft">{count}</span>;
}
