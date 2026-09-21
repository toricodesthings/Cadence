import { History, Sparkles, Wrench, Bolt, ChevronDown } from "lucide-react";
export { RouteErrorBoundary as ErrorBoundary } from "../components/shared/RouteErrorBoundary";
import { MainLayout } from "../components/layout/MainLayout";
import { PageContent } from "../components/layout/PageLayout";
import { ScrollAreaWrapper } from "../components/shared/ScrollAreaWrapper";
import { useRouteFocus } from "../hooks/search/use-route-focus";
import { CADENCE_PUBLIC_VERSION } from "../lib/constants/app-info";
import { CADENCE_CHANGELOG, type ChangelogEntry, type ChangelogGroup } from "../lib/constants/changelog";
import { parseLocalDate } from "../lib/utils/date-format";

const CHANGELOG_GLYPHS: Record<ChangelogEntry["glyph"], { icon: typeof Sparkles; className: string }> = {
    release: { icon: Sparkles, className: "border-accent-primary/20 bg-accent-primary/10 text-accent-primary" },
    tune: { icon: Bolt, className: "border-moonlit/20 bg-moonlit/10 text-moonlit" },
    fix: { icon: Wrench, className: "border-feedback-success/20 bg-feedback-success/10 text-feedback-success" },
};

const GROUP_LABELS: Record<ChangelogGroup["kind"], { label: string; className: string }> = {
    added: { label: "New", className: "text-accent-primary" },
    changed: { label: "Improved", className: "text-moonlit" },
    removed: { label: "Removed", className: "text-twilight-text-muted" },
    fixed: { label: "Fixed", className: "text-feedback-success" },
};

function ReleaseDate({ date }: { date?: string }) {
    if (!date) return null;
    return (
        <time dateTime={date} className="shrink-0 text-xs font-medium text-twilight-text-muted">
            {parseLocalDate(date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
        </time>
    );
}

function Glyph({ glyph, large = false }: { glyph: ChangelogEntry["glyph"]; large?: boolean }) {
    const { icon: Icon, className } = CHANGELOG_GLYPHS[glyph];
    return (
        <span
            aria-hidden="true"
            className={`flex shrink-0 items-center justify-center border ${large ? "h-12 w-12 rounded-2xl" : "h-9 w-9 rounded-xl"} ${className}`}
        >
            <Icon size={large ? 20 : 16} />
        </span>
    );
}

function ReleaseGroups({ groups }: { groups: ChangelogGroup[] }) {
    return (
        <div className="space-y-5">
            {groups.map((group) => {
                const { label, className } = GROUP_LABELS[group.kind];
                return (
                    <section key={group.kind}>
                        <h4 className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${className}`}>{label}</h4>
                        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[15px] leading-6 text-twilight-text-soft marker:text-twilight-text-muted">
                            {group.items.map((item) => <li key={item}>{item}</li>)}
                        </ul>
                    </section>
                );
            })}
        </div>
    );
}

function LatestRelease({ entry }: { entry: ChangelogEntry }) {
    return (
        <article className="surface-utility relative overflow-hidden rounded-[2rem] border border-white/[0.06] px-6 py-7 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:px-8 sm:py-8">
            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(ellipse_at_top,color-mix(in_srgb,var(--accent-primary)_14%,transparent),transparent_70%)]"
            />
            <div className="relative">
                <div className="flex items-center justify-between gap-3">
                    <Glyph glyph={entry.glyph} large />
                    <div className="flex items-center gap-3">
                        <span className="rounded-full border border-accent-primary/25 bg-accent-primary/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-primary">
                            Latest
                        </span>
                        <ReleaseDate date={entry.date} />
                    </div>
                </div>
                <h2 className="mt-6 font-display text-3xl font-semibold tracking-tight text-twilight-text sm:text-4xl">
                    {entry.version}
                </h2>
                <p className="mt-2 text-lg leading-snug text-twilight-text">{entry.title}</p>
                <div className="mt-7 border-t border-white/[0.06] pt-6">
                    <ReleaseGroups groups={entry.groups} />
                </div>
            </div>
        </article>
    );
}

function EarlierRelease({ entry }: { entry: ChangelogEntry }) {
    return (
        <details className="group">
            <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-4 rounded-2xl px-3 py-3.5 transition-colors hover:bg-white/[0.03] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary/60 [&::-webkit-details-marker]:hidden">
                <Glyph glyph={entry.glyph} />
                <div className="min-w-0 flex-1">
                    <h3 className="font-display text-base font-semibold tracking-tight text-twilight-text">{entry.version}</h3>
                    <p className="truncate text-sm text-twilight-text-soft">{entry.title}</p>
                </div>
                <ReleaseDate date={entry.date} />
                <ChevronDown
                    size={16}
                    aria-hidden="true"
                    className="shrink-0 text-twilight-text-muted transition-transform group-open:rotate-180 motion-reduce:transition-none"
                />
            </summary>
            <div className="pb-5 pl-3 pr-3 pt-2 sm:pl-16">
                <ReleaseGroups groups={entry.groups} />
            </div>
        </details>
    );
}

export default function ChangelogRoute() {
    useRouteFocus();
    const [latest, ...earlier] = CADENCE_CHANGELOG;

    return (
        <MainLayout
            pageTitle="Changelog"
            pageDescription="What's new in Cadence, release by release."
            shellHeader={{
                title: "Changelog",
                eyebrow: "Release notes",
                icon: <History size={18} aria-hidden="true" />,
                accentColor: "var(--accent-primary)",
            }}
        >
            <ScrollAreaWrapper>
                <PageContent width="narrow">
                    <header className="px-1 pb-8 pt-4 text-center sm:pt-8">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-twilight-text-soft">
                            Cadence {CADENCE_PUBLIC_VERSION}
                        </p>
                        <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-twilight-text sm:text-5xl">
                            What's new
                        </h1>
                        <p className="mt-3 text-[15px] text-twilight-text-soft">
                            Every release, newest first.
                        </p>
                    </header>

                    {latest ? <LatestRelease entry={latest} /> : null}

                    {earlier.length > 0 ? (
                        <section className="mt-10 pb-6">
                            <h2 className="px-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-twilight-text-soft">
                                Earlier releases
                            </h2>
                            <div className="surface-utility mt-3 divide-y divide-white/[0.05] rounded-[1.75rem] border border-white/[0.06] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                                {earlier.map((entry) => <EarlierRelease key={entry.version} entry={entry} />)}
                            </div>
                        </section>
                    ) : null}
                </PageContent>
            </ScrollAreaWrapper>
        </MainLayout>
    );
}
