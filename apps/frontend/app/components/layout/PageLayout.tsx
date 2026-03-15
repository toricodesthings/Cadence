import type { ReactNode } from "react";

export type PageWidth = "narrow" | "default" | "wide" | "full";

export const PAGE_WIDTH_CLASS: Record<PageWidth, string> = {
    narrow: "max-w-2xl",
    default: "max-w-3xl",
    wide: "max-w-5xl",
    full: "max-w-[min(100%,96rem)]",
};

export function PageContent({
    width = "default",
    className = "",
    children,
}: {
    width?: PageWidth;
    className?: string;
    children: ReactNode;
}) {
    return (
        <div className={`mx-auto w-full ${PAGE_WIDTH_CLASS[width]} px-4 py-6 sm:px-6 lg:px-8 lg:py-8 ${className}`.trim()}>
            {children}
        </div>
    );
}
