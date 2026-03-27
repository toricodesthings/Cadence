import { History, Sparkles, Wrench, Bolt } from "lucide-react";
export { RouteErrorBoundary as ErrorBoundary } from "../components/shared/RouteErrorBoundary";
import { MainLayout } from "../components/layout/MainLayout";
import { PageContent } from "../components/layout/PageLayout";
import { ScrollAreaWrapper } from "../components/shared/ScrollAreaWrapper";
import { SupportPageLayout } from "../components/support/SupportPageLayout";
import { useRouteFocus } from "../hooks/search/use-route-focus";
import { CADENCE_PUBLIC_VERSION } from "../lib/constants/app-info";
import { CADENCE_CHANGELOG, type ChangelogEntry } from "../lib/constants/changelog";

const CHANGELOG_GLYPHS: Record<ChangelogEntry["glyph"], { icon: typeof Sparkles; accentClassName: string; surfaceClassName: string }> = {
    release: {
        icon: Sparkles,
        accentClassName: "text-accent-primary",
        surfaceClassName: "border-accent-primary/20 bg-accent-primary/10",
    },
    fix: {
        icon: Wrench,
        accentClassName: "text-moonlit",
        surfaceClassName: "border-moonlit/20 bg-moonlit/10",
    },
    tune: {
        icon: Bolt,
        accentClassName: "text-starlight",
        surfaceClassName: "border-starlight/20 bg-starlight/10",
    }
};

export default function ChangelogRoute() {
    useRouteFocus();

    return (
        <MainLayout
            contentWidth="wide"
            pageTitle="Changelog"
            pageDescription="Review concise Cadence release notes in a sparse, version-by-version history."
            shellHeader={{
                title: "Changelog",
                eyebrow: "Release notes",
                icon: <History size={18} aria-hidden="true" />,
                accentColor: "var(--accent-primary)",
            }}
        >
            <ScrollAreaWrapper>
                <PageContent width="wide">
                    <SupportPageLayout
                        eyebrow="Updates"
                        title="A simple history of what changed."
                        description={(
                            <p>
                                Cadence is in active development, and you can expect regular updates with new features, improvements, and bug fixes.
                            </p>
                        )}
                        meta={[CADENCE_PUBLIC_VERSION, `${CADENCE_CHANGELOG.length} entries`, "Newest first"]}
                    >
                        <section className="surface-utility rounded-[1.75rem] border border-white/[0.06] px-5 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:px-6 sm:py-5">
                            <div className="flex flex-col">
                                {CADENCE_CHANGELOG.map((entry, index) => {
                                    const glyph = CHANGELOG_GLYPHS[entry.glyph];
                                    const Icon = glyph.icon;

                                    return (
                                        <article
                                            key={entry.version}
                                            className={`flex gap-4 py-5 ${index < CADENCE_CHANGELOG.length - 1 ? "border-b border-white/[0.05]" : ""}`}
                                        >
                                            <div className={`mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border ${glyph.surfaceClassName}`}>
                                                <Icon size={17} className={glyph.accentClassName} aria-hidden="true" />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                                                    <h2 className="font-display text-xl font-semibold tracking-tight text-twilight-text">
                                                        {entry.version}
                                                    </h2>
                                                    <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-twilight-text-soft">
                                                        {entry.title}
                                                    </span>
                                                </div>
                                                <p className="mt-2 max-w-2xl text-sm leading-7 text-twilight-text-soft">
                                                    {entry.description}
                                                </p>
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>
                        </section>
                    </SupportPageLayout>
                </PageContent>
            </ScrollAreaWrapper>
        </MainLayout>
    );
}
