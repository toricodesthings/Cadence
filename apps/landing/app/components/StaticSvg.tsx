import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";

// Awaited only when rendering the site (build time); the client build folds this to nothing, so react-dom/server
// never reaches the browser.
const { renderToStaticMarkup } = import.meta.env.SSR
  ? await import("react-dom/server")
  : ({} as typeof import("react-dom/server"));

/** The browser never renders this: React skips an element that has `dangerouslySetInnerHTML` while it hydrates. */
const KEEP = { __html: "" };

/**
 * An element whose children are scene markup that never changes: it is rendered to a string at build time and
 * the browser keeps it as is, so React builds no fibers for it, hydrates none of it and ships none of its
 * generator code. Pass the body only on the server (`{import.meta.env.SSR ? <Body /> : null}`), so the client
 * build drops the body and everything it draws from. Anything JS reads or writes (`[data-depth]`, `.jsec`, …) is
 * the element itself or stays a React element outside it; the children are only ever drawn.
 */
export function StaticSvg<T extends ElementType = "svg">({
  as,
  children,
  ...props
}: { as?: T; children?: ReactNode } & Omit<ComponentPropsWithoutRef<T>, "children" | "dangerouslySetInnerHTML">) {
  const Tag: ElementType = as ?? "svg";
  const html = import.meta.env.SSR ? { __html: renderToStaticMarkup(<>{children}</>) } : KEEP;
  return <Tag {...props} dangerouslySetInnerHTML={html} suppressHydrationWarning />;
}
