import type { ReactNode } from "react";

export type PageWidth = "narrow" | "default" | "wide" | "full";
export type PageVerticalPadding = "default" | "none";

export const PAGE_WIDTH_CLASS: Record<PageWidth, string> = {
    narrow: "max-w-2xl",
    default: "max-w-3xl",
    wide: "max-w-5xl",
    full: "max-w-[min(100%,96rem)]",
};

const PAGE_VERTICAL_PADDING_CLASS: Record<PageVerticalPadding, string> = {
    default: "py-[var(--cadence-page-padding-y)] lg:py-[var(--cadence-page-padding-y-desktop)]",
    none: "",
};

export function PageContent({
    width = "default",
    verticalPadding = "default",
    className = "",
    children,
}: {
    width?: PageWidth;
    verticalPadding?: PageVerticalPadding;
    className?: string;
    children: ReactNode;
}) {
    return (
        <div className={`mx-auto w-full ${PAGE_WIDTH_CLASS[width]} px-4 sm:px-6 lg:px-8 ${PAGE_VERTICAL_PADDING_CLASS[verticalPadding]} ${className}`.trim()}>
            {children}
        </div>
    );
}
