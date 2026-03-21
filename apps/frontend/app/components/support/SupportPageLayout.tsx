import type { ReactNode } from "react";

interface SupportPageLayoutProps {
    eyebrow: string;
    title: string;
    description: ReactNode;
    meta?: string[];
    aside?: ReactNode;
    children: ReactNode;
}

interface SupportFactItem {
    label: string;
    value: ReactNode;
    detail: ReactNode;
}

interface SupportFactGridProps {
    items: SupportFactItem[];
}

interface SupportSectionProps {
    eyebrow: string;
    title: string;
    description?: ReactNode;
    children: ReactNode;
}

export function SupportPageLayout({
    eyebrow,
    title,
    description,
    meta = [],
    aside,
    children,
}: SupportPageLayoutProps) {
    return (
        <div className="flex flex-col gap-6 lg:gap-8">
            <section className="relative overflow-hidden rounded-[2rem] border border-white/[0.06] bg-twilight-surface/30 px-5 py-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl sm:px-7 sm:py-7 lg:px-8 lg:py-8">
                <div
                    aria-hidden="true"
                    className="absolute inset-x-0 top-0 h-32 bg-[radial-gradient(circle_at_top_left,rgba(232,164,74,0.16),transparent_52%),radial-gradient(circle_at_top_right,rgba(126,184,212,0.12),transparent_46%)]"
                />
                <div className="relative grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
                    <div className="max-w-3xl">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-twilight-text-soft">
                            {eyebrow}
                        </p>
                        <h1 className="mt-3 font-display text-[2rem] font-semibold leading-[1.02] tracking-tight text-twilight-text sm:text-[2.35rem]">
                            {title}
                        </h1>
                        <div className="mt-3 max-w-2xl text-sm leading-7 text-twilight-text-soft sm:text-[15px]">
                            {description}
                        </div>
                        {meta.length > 0 ? (
                            <div className="mt-5 flex flex-wrap gap-2.5">
                                {meta.map((item) => (
                                    <span
                                        key={item}
                                        className="inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-twilight-text-soft"
                                    >
                                        {item}
                                    </span>
                                ))}
                            </div>
                        ) : null}
                    </div>

                    {aside ? (
                        <div className="surface-utility rounded-[1.6rem] border border-white/[0.06] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:p-5">
                            {aside}
                        </div>
                    ) : null}
                </div>
            </section>

            {children}
        </div>
    );
}

export function SupportFactGrid({ items }: SupportFactGridProps) {
    return (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {items.map((item) => (
                <div
                    key={item.label}
                    className="surface-utility rounded-[1.45rem] border border-white/[0.06] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
                >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-twilight-text-soft">
                        {item.label}
                    </p>
                    <div className="mt-2 font-display text-lg font-semibold tracking-tight text-twilight-text">
                        {item.value}
                    </div>
                    <div className="mt-2 text-sm leading-6 text-twilight-text-muted">
                        {item.detail}
                    </div>
                </div>
            ))}
        </div>
    );
}

export function SupportSection({
    eyebrow,
    title,
    description,
    children,
}: SupportSectionProps) {
    return (
        <section className="px-1 py-5 sm:px-2 sm:py-6 border-t border-white/[0.04]">
            <div className="max-w-3xl">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-twilight-text-soft">
                    {eyebrow}
                </p>
                <h2 className="mt-2 font-display text-[1.45rem] font-semibold tracking-tight text-twilight-text sm:text-[1.65rem]">
                    {title}
                </h2>
                {description ? (
                    <div className="mt-2 text-sm leading-7 text-twilight-text-muted">
                        {description}
                    </div>
                ) : null}
            </div>
            <div className="mt-5 max-w-3xl space-y-4 text-sm leading-7 text-twilight-text-soft [&_a]:text-lantern [&_a]:underline-offset-4 [&_a:hover]:text-lantern-soft [&_a:hover]:underline [&_li]:ml-5 [&_li]:list-disc [&_strong]:font-semibold [&_strong]:text-twilight-text">
                {children}
            </div>
        </section>
    );
}
