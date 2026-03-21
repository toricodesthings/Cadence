import { ArrowUpRight, LifeBuoy, MessageSquareQuote } from "lucide-react";
import { Link } from "react-router";
export { RouteErrorBoundary as ErrorBoundary } from "../components/shared/RouteErrorBoundary";
import { MainLayout } from "../components/layout/MainLayout";
import { PageContent } from "../components/layout/PageLayout";
import { ScrollAreaWrapper } from "../components/shared/ScrollAreaWrapper";
import { Button } from "../components/primitives/Button";
import { SupportFactGrid, SupportPageLayout, SupportSection } from "../components/support/SupportPageLayout";
import { useRouteFocus } from "../hooks/search/use-route-focus";
import { CADENCE_ISSUES_URL, CADENCE_PUBLIC_VERSION } from "../lib/constants/app-info";

export default function HelpFeedbackRoute() {
    useRouteFocus();

    return (
        <MainLayout
            contentWidth="wide"
            pageTitle="Help & Feedback"
            pageDescription="Find the current support path for Cadence and the best way to share feedback during the beta release."
            shellHeader={{
                title: "Help & Feedback",
                eyebrow: "Support",
                icon: <LifeBuoy size={18} aria-hidden="true" />,
                accentColor: "var(--color-nav-schedule)",
            }}
        >
            <ScrollAreaWrapper>
                <PageContent width="wide">
                    <SupportPageLayout
                        eyebrow="Support"
                        title="The support path is intentionally simple while Cadence is still in beta."
                        description={(
                            <p>
                                Cadence does not yet have a full in-app feedback desk or formal support inbox. For now,
                                the clearest route is to use the open-source repository and include enough detail for a
                                reproducible fix.
                            </p>
                        )}
                        meta={[CADENCE_PUBLIC_VERSION, "Repository-first support", "Beta feedback welcome"]}
                        aside={(
                            <div className="space-y-3">
                                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-lantern/10 text-lantern">
                                    <MessageSquareQuote size={18} aria-hidden="true" />
                                </div>
                                <p className="text-sm leading-6 text-twilight-text-soft">
                                    The goal is not to hide rough edges. It is to make it easy to surface them and keep
                                    improving the product in the open.
                                </p>
                            </div>
                        )}
                    >
                        <SupportFactGrid
                            items={[
                                {
                                    label: "Current channel",
                                    value: "GitHub issues",
                                    detail: "Best for bugs, regressions, feature requests, and support questions while formal support is still being built.",
                                },
                                {
                                    label: "Best feedback",
                                    value: "Repro steps",
                                    detail: "Include the route, what you expected, what happened instead, and whether it is web or desktop.",
                                },
                                {
                                    label: "Release stage",
                                    value: "Beta",
                                    detail: "Some help surfaces are intentionally brief because the dedicated feedback path is not fully launched yet.",
                                },
                                {
                                    label: "Policy links",
                                    value: "In-app",
                                    detail: "About, Changelog, Privacy, and Terms are all reachable from the profile menu.",
                                },
                            ]}
                        />

                        <SupportSection
                            eyebrow="Start here"
                            title="What to include when you report something."
                            description="A clear report saves time for everyone."
                        >
                            <ul>
                                <li>Which page or route you were on when the issue appeared.</li>
                                <li>Whether you were using the web app or desktop app.</li>
                                <li>The steps needed to reproduce the issue.</li>
                                <li>What you expected to happen and what happened instead.</li>
                                <li>A screenshot or screen recording if the bug is visual.</li>
                            </ul>
                        </SupportSection>

                        <SupportSection
                            eyebrow="Feedback path"
                            title="Where to send feedback today."
                            description="Cadence is using a repository-first support loop during the pre-release."
                        >
                            <p>
                                Please use the open issue tracker for bugs, polish requests, and feature ideas:
                                <br />
                                <a href={CADENCE_ISSUES_URL} target="_blank" rel="noreferrer">
                                    {CADENCE_ISSUES_URL}
                                </a>
                            </p>
                            <div className="flex flex-wrap gap-3 pt-2">
                                <Button asChild variant="secondary">
                                    <a href={CADENCE_ISSUES_URL} target="_blank" rel="noreferrer">
                                        Open issue tracker
                                        <ArrowUpRight size={15} aria-hidden="true" />
                                    </a>
                                </Button>
                                <Button asChild variant="ghost">
                                    <Link to="?settings=about">
                                        Read about Cadence
                                    </Link>
                                </Button>
                            </div>
                        </SupportSection>

                        <SupportSection
                            eyebrow="What to expect"
                            title={`What support looks like in ${CADENCE_PUBLIC_VERSION}.`}
                            description="The app now has a real support route, but the broader support system is still catching up."
                        >
                            <p>
                                Expect fast iteration, direct fixes, and some rough edges around formal contact flows.
                                The goal of this page is to avoid dead ends: if a dedicated support channel does not
                                exist yet, Cadence should say that plainly instead of pretending otherwise.
                            </p>
                        </SupportSection>

                        <SupportSection
                            eyebrow="Useful links"
                            title="The core support and compliance pages."
                            description="These routes are meant to be close to the product, not hidden in a footer."
                        >
                            <div className="grid gap-3 md:grid-cols-3">
                                {[
                                    {
                                        to: "/changelog",
                                        title: "Changelog",
                                        body: "A sparse vertical release history with concise notes for each version.",
                                    },
                                    {
                                        to: "?settings=about",
                                        title: "About",
                                        body: "A short product note with version, logo, and open-source posture.",
                                    },
                                    {
                                        to: "/privacy-policy",
                                        title: "Privacy & Policy",
                                        body: "What Cadence stores, what stays local, and how optional permissions are used.",
                                    },
                                    {
                                        to: "/terms",
                                        title: "Terms & Conditions",
                                        body: "Beta-use terms, ownership, acceptable use, and service disclaimers.",
                                    },
                                ].map((item) => (
                                    <Link
                                        key={item.to}
                                        to={item.to}
                                        className="rounded-[1.35rem] border border-white/[0.06] bg-white/[0.03] p-4 transition-colors hover:bg-white/[0.05]"
                                    >
                                        <h3 className="font-display text-lg font-semibold tracking-tight text-twilight-text">
                                            {item.title}
                                        </h3>
                                        <p className="mt-2 text-sm leading-6 text-twilight-text-soft">
                                            {item.body}
                                        </p>
                                    </Link>
                                ))}
                            </div>
                        </SupportSection>
                    </SupportPageLayout>
                </PageContent>
            </ScrollAreaWrapper>
        </MainLayout>
    );
}
