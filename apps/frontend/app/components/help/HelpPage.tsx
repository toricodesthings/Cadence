import { useEffect, useRef, useState, type RefObject } from "react";
import { ArrowLeft, BookOpen, ChevronRight, LifeBuoy, MessageSquareQuote } from "lucide-react";
import { Link, useSearchParams } from "react-router";
import { PageContent } from "../layout/PageLayout";
import { Button } from "../primitives/Button";
import { SearchField } from "../primitives/SearchField";
import { ScrollAreaWrapper } from "../shared/ScrollAreaWrapper";
import { useShellMode } from "../../hooks/ui/use-shell-mode";
import { HELP_FEATURES, HELP_GROUPS, type HelpFeature } from "./help-features";

function FeatureLink({ feature, selected, compact, onClick }: {
    feature: HelpFeature; selected: boolean; compact: boolean; onClick: () => void;
}) {
    const Icon = feature.icon;
    return (
        <Link
            to={`?feature=${feature.id}`}
            onClick={onClick}
            aria-label={feature.title}
            aria-describedby={compact ? undefined : `help-description-${feature.id}`}
            aria-current={selected ? "page" : undefined}
            className={`group flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-3 py-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50 ${selected ? "surface-control-accent text-accent-primary" : "text-twilight-text hover:bg-accent-primary/5"}`}
        >
            <Icon size={18} aria-hidden="true" className={`shrink-0 ${selected ? "text-accent-primary" : "text-twilight-text-muted group-hover:text-accent-primary"}`} />
            <span className="min-w-0 flex-1">
                <span className="block font-medium">{feature.title}</span>
                {!compact && <span id={`help-description-${feature.id}`} className="mt-1 block text-xs leading-5 text-twilight-text-muted">{feature.description}</span>}
            </span>
            <ChevronRight size={15} aria-hidden="true" className="shrink-0 text-twilight-text-muted" />
        </Link>
    );
}

function FeatureGuide({ feature, groupTitle, headingRef }: { feature: HelpFeature; groupTitle: string; headingRef: RefObject<HTMLHeadingElement | null> }) {
    const Icon = feature.icon;
    return (
        <article aria-labelledby="help-feature-title" className="surface-card flex min-h-96 flex-col rounded-3xl p-6 sm:p-8">
            <div className="mb-5 flex size-12 items-center justify-center rounded-2xl bg-accent-primary/10 text-accent-primary">
                <Icon size={24} aria-hidden="true" />
            </div>
            <p className="mb-2 text-xs font-medium text-twilight-text-muted">{groupTitle}</p>
            <h2 ref={headingRef} tabIndex={-1} id="help-feature-title" className="w-fit rounded-lg font-display text-3xl font-semibold tracking-tight text-twilight-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50">{feature.title}</h2>
            <p className="mt-3 max-w-lg text-sm leading-6 text-twilight-text-soft">{feature.description}</p>
            <div className="mt-10 flex flex-1 flex-col justify-center border-t border-twilight-border/50 py-10">
                <BookOpen size={22} aria-hidden="true" className="mb-4 text-accent-primary" />
                <h3 className="font-display text-xl font-medium text-twilight-text">A guide is on its way.</h3>
            </div>
        </article>
    );
}

export function HelpPage() {
    const [params] = useSearchParams();
    const feature = HELP_FEATURES.find((item) => item.id === params.get("feature"));
    const featureGroup = HELP_GROUPS.find((group) => group.features.some((item) => item.id === feature?.id));
    const [search, setSearch] = useState("");
    const { isDesktop, isPhone } = useShellMode();
    const headingRef = useRef<HTMLHeadingElement>(null);
    const guideHeadingRef = useRef<HTMLHeadingElement>(null);
    const previousFeature = useRef(feature?.id);
    const narrowDirectory = isDesktop && Boolean(feature);
    const showDirectory = isDesktop || !feature;
    const query = search.trim().toLowerCase();
    const groups = HELP_GROUPS.map((group) => ({
        id: group.id,
        title: group.title,
        features: group.features.filter((item) => `${group.title} ${item.title} ${item.description}`.toLowerCase().includes(query)),
    })).filter((group) => group.features.length > 0);

    useEffect(() => {
        if (previousFeature.current === feature?.id) return;
        previousFeature.current = feature?.id;
        const heading = feature ? guideHeadingRef.current : headingRef.current;
        heading?.focus({ preventScroll: true });
        heading?.scrollIntoView({ block: "nearest", behavior: "instant" });
    }, [feature?.id]);

    return (
        <ScrollAreaWrapper>
            <PageContent width="wide" verticalPadding="none" className={`safe-bottom ${isPhone ? "py-6" : "py-10"}`}>
                {/* On phone the shell header already names the page; the heading stays for focus and screen readers. */}
                <header className={isPhone ? "sr-only" : "mb-10"}>
                    <div className="mb-4 flex items-center gap-2 text-accent-primary">
                        <LifeBuoy size={17} aria-hidden="true" />
                        <span className="text-xs font-medium">A little guidance</span>
                    </div>
                    <h1 ref={headingRef} tabIndex={-1} className={`w-fit rounded-lg font-display font-semibold tracking-tight text-twilight-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50 ${isPhone ? "text-3xl" : "text-4xl"}`}>Help & Feedback</h1>
                    <p className="mt-3 max-w-xl text-sm leading-6 text-twilight-text-soft">Find your way around Cadence, one thing at a time.</p>
                </header>

                <section aria-label="Feature help" className="mb-10">
                    {feature && (
                        <Button asChild variant="ghost" className="mb-5 -ml-3 px-3">
                            <Link to="/help-feedback"><ArrowLeft size={16} aria-hidden="true" />All features</Link>
                        </Button>
                    )}
                    <div className={narrowDirectory ? "grid grid-cols-[15rem_minmax(0,1fr)] items-start gap-8" : "space-y-5"}>
                        {showDirectory && (
                            <nav aria-label="Help features" className="min-w-0">
                                {!feature && (
                                    <div className={`mb-6 flex gap-4 ${isDesktop ? "items-center justify-between" : "flex-col"}`}>
                                        <h2 className="font-display text-2xl font-medium tracking-tight text-twilight-text">What would you like a hand with?</h2>
                                        <SearchField value={search} onValueChange={setSearch} aria-label="Find a feature" placeholder="Find a feature…" className={isDesktop ? "w-64 shrink-0" : "w-full"} />
                                    </div>
                                )}
                                {feature && <SearchField value={search} onValueChange={setSearch} aria-label="Find a feature" placeholder="Find a feature…" className="mb-5" />}
                                <div className={!feature && !isPhone ? `grid items-start gap-5 ${isDesktop ? "grid-cols-3" : "grid-cols-2"}` : "space-y-6"}>
                                    {groups.map((group) => (
                                        <div key={group.id} className={group.id === "intelligence" && !feature && !isPhone ? `mt-3 ${isDesktop ? "col-span-3" : "col-span-2"}` : undefined}>
                                            <h3 className={group.id === "intelligence" && !feature ? "mb-3 px-3 font-display text-2xl font-medium tracking-tight text-twilight-text" : "mb-3 px-3 text-xs font-medium text-twilight-text-muted"}>{group.title}</h3>
                                            {group.id === "intelligence" && !feature && <p className="mb-5 px-3 text-sm leading-6 text-twilight-text-soft">The quiet help behind your words, your choices, and your planning.</p>}
                                            <div className={`${narrowDirectory ? "space-y-1" : "surface-card rounded-2xl p-1.5"} ${group.id === "intelligence" && !feature && !isPhone ? `grid ${isDesktop ? "grid-cols-3" : "grid-cols-2"}` : ""}`}>
                                                {group.features.map((item) => <FeatureLink key={item.id} feature={item} selected={feature?.id === item.id} compact={narrowDirectory} onClick={() => setSearch("")} />)}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                {groups.length === 0 && (
                                    <div className="surface-card rounded-2xl p-6" role="status">
                                        <p className="text-sm text-twilight-text">No features match “{search}”.</p>
                                        <Button variant="ghost" onClick={() => setSearch("")} className="mt-2 -ml-3 px-3">Show all features</Button>
                                    </div>
                                )}
                            </nav>
                        )}
                        {feature && featureGroup && <FeatureGuide feature={feature} groupTitle={featureGroup.title} headingRef={guideHeadingRef} />}
                    </div>
                </section>

                <section aria-labelledby="help-feedback-title" className={`surface-card flex gap-6 rounded-3xl p-6 sm:p-8 ${isDesktop ? "items-center justify-between" : "flex-col"}`}>
                    <div className="flex min-w-0 items-start gap-4">
                        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-accent-primary/10 text-accent-primary"><MessageSquareQuote size={21} aria-hidden="true" /></span>
                        <div>
                            <h2 id="help-feedback-title" className="font-display text-2xl font-medium tracking-tight text-twilight-text">Feedback</h2>
                            <p id="help-feedback-status" className="mt-2 max-w-md text-sm leading-6 text-twilight-text-soft">Something could feel easier? A place to share ideas and report problems is coming soon.</p>
                        </div>
                    </div>
                    <Button variant="secondary" disabled aria-describedby="help-feedback-status" className="shrink-0 self-start">Share feedback</Button>
                </section>
            </PageContent>
        </ScrollAreaWrapper>
    );
}
