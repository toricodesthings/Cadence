import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";

const { renderToStaticMarkup } = import.meta.env.SSR
    ? await import("react-dom/server")
    : ({} as typeof import("react-dom/server"));

const KEEP = { __html: "" };

export function StaticSvg<T extends ElementType = "svg">({
    as,
    children,
    ...props
}: { as?: T; children?: ReactNode } & Omit<ComponentPropsWithoutRef<T>, "children" | "dangerouslySetInnerHTML">) {
    const Tag: ElementType = as ?? "svg";
    const html = import.meta.env.SSR ? { __html: renderToStaticMarkup(<>{children}</>) } : KEEP;
    return <Tag {...props} dangerouslySetInnerHTML={html} suppressHydrationWarning />;
}
