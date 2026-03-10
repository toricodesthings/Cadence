import * as React from "react";
import { cn } from "../../../lib/utils";

export function SettingsSection({
    title,
    children,
    className,
}: {
    title: string;
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <section className={cn("flex flex-col gap-4 mb-10 w-full", className)}>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-twilight-text-soft">
                {title}
            </h3>
            <div className="flex flex-col gap-6">{children}</div>
        </section>
    );
}

export function SettingsRow({
    title,
    description,
    children,
    className,
}: {
    title: string;
    description?: string;
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <div className={cn("flex flex-col gap-4 rounded-[1.4rem] border border-white/[0.04] bg-white/[0.02] p-4 sm:flex-row sm:items-start sm:justify-between", className)}>
            <div className="flex flex-1 flex-col gap-1 pr-0 sm:pr-6">
                <h4 className="text-base font-medium text-twilight-text">{title}</h4>
                {description && (
                    <p className="text-sm leading-relaxed text-twilight-text-soft">{description}</p>
                )}
            </div>
            <div className="w-full sm:w-auto sm:min-w-[12rem]">{children}</div>
        </div>
    );
}
