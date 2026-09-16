import type { ReactNode } from "react";

/** The frame every chapter's panel sits in: lit glass with the buttons' gradient rim and a gem at two corners. */
export function Panel({ children }: { children?: ReactNode }) {
  return (
    <div className="panel">
      <span className="panel-gem panel-gem-tl" />
      <span className="panel-gem panel-gem-br" />
      {children}
    </div>
  );
}
