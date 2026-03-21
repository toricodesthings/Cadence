import { ShieldCheck } from "lucide-react";
export { RouteErrorBoundary as ErrorBoundary } from "../components/shared/RouteErrorBoundary";
import { MainLayout } from "../components/layout/MainLayout";
import { PageContent } from "../components/layout/PageLayout";
import { ScrollAreaWrapper } from "../components/shared/ScrollAreaWrapper";
import { SupportFactGrid, SupportPageLayout, SupportSection } from "../components/support/SupportPageLayout";
import { useRouteFocus } from "../hooks/search/use-route-focus";
import { CADENCE_PUBLIC_VERSION, CADENCE_ISSUES_URL } from "../lib/constants/app-info";

export default function PrivacyPolicyRoute() {
    useRouteFocus();

    return (
        <MainLayout
            contentWidth="wide"
            pageTitle="Privacy & Policy"
            pageDescription="Read how Cadence handles account data, workspace content, offline storage, permissions, and optional integrations in the current pre-release."
            shellHeader={{
                title: "Privacy & Policy",
                eyebrow: "Compliance",
                icon: <ShieldCheck size={18} aria-hidden="true" />,
                accentColor: "var(--color-moonlit)",
            }}
        >
            <ScrollAreaWrapper>
                <PageContent width="wide">
                    <SupportPageLayout
                        eyebrow="Privacy"
                        title="Cadence keeps privacy close to the product, not buried under abstraction."
                        description={(
                            <p>
                                This privacy page is written against the current Cadence codebase and release posture.
                                Cadence is open source, currently has no paid plan, and should describe new data flows
                                plainly whenever the product changes.
                            </p>
                        )}
                        meta={[CADENCE_PUBLIC_VERSION, "No ads", "No paid plan", "Open source"]}
                        aside={(
                            <div className="space-y-3">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-twilight-text-soft">
                                    Summary
                                </p>
                                <p className="text-sm leading-6 text-twilight-text-soft">
                                    Cadence stores the workspace content and settings you create, keeps some data locally
                                    for offline recovery, and only reaches for optional permissions like notifications or
                                    precise location when you enable related features.
                                </p>
                            </div>
                        )}
                    >
                        <SupportFactGrid
                            items={[
                                {
                                    label: "Account data",
                                    value: "Auth-backed",
                                    detail: "Cadence relies on Neon Auth session identity and can expose optional OAuth sign-in choices like Google or GitHub.",
                                },
                                {
                                    label: "Local data",
                                    value: "Cached",
                                    detail: "Settings are cached in localStorage, while offline query data and queued mutations live in IndexedDB.",
                                },
                                {
                                    label: "Permissions",
                                    value: "Optional",
                                    detail: "Notifications and precise geolocation are tied to specific user-facing features and can be turned off.",
                                },
                                {
                                    label: "Commercial model",
                                    value: "Free",
                                    detail: "There is no paid plan or ad network in the current pre-release product surface.",
                                },
                            ]}
                        />

                        <SupportSection
                            eyebrow="Scope"
                            title="What this page covers."
                            description="This page applies to the current Cadence web and desktop clients plus the shared backend that powers them."
                        >
                            <p>
                                Cadence is a planning workspace for tasks, habits, scheduling, inbox capture, settings,
                                and weekly review. This privacy page describes the product as it exists in the pre-release
                                codebase today. If the app later adds new live telemetry, billing, or integration flows,
                                this page should be updated at the same time as the feature.
                            </p>
                        </SupportSection>

                        <SupportSection
                            eyebrow="Stored data"
                            title="What Cadence may store for your account."
                            description="Cadence stores the data needed to render and sync your workspace."
                        >
                            <ul>
                                <li>
                                    <strong>Identity and access data:</strong> account identifiers, session-linked email,
                                    and related auth state needed to sign you in and protect your workspace.
                                </li>
                                <li>
                                    <strong>Workspace content:</strong> projects, sections, tasks, subtasks, tags, inbox
                                    items, habits, habit logs, reminders, recurrence rules, schedule fields, and notes you
                                    create inside the product.
                                </li>
                                <li>
                                    <strong>Preferences and settings:</strong> theme, motion, shortcuts, notification
                                    preferences, calendar settings, privacy toggles, and integration settings.
                                </li>
                                <li>
                                    <strong>Product-side capability data:</strong> the backend schema includes adaptive
                                    planning metrics and an AI memory layer for future intelligence features. Those areas
                                    are product capabilities, not advertising profiles, and should remain documented as
                                    they evolve.
                                </li>
                            </ul>
                        </SupportSection>

                        <SupportSection
                            eyebrow="On-device storage"
                            title="What Cadence keeps locally on your device."
                            description="Local storage is used to make the app feel fast and resilient."
                        >
                            <ul>
                                <li>
                                    <strong>localStorage</strong> caches user settings so the app can boot with your
                                    preferred theme and controls before a round-trip finishes.
                                </li>
                                <li>
                                    <strong>IndexedDB</strong> stores the TanStack Query cache and an offline mutation
                                    queue so Cadence can recover state, replay queued changes, and stay usable when the
                                    network is unstable.
                                </li>
                                <li>
                                    <strong>Session memory</strong> may temporarily hold resolved location data for
                                    weather and holiday overlays when you grant precise location. The current frontend
                                    flow is designed around reuse of a single browser permission rather than constant
                                    re-prompting.
                                </li>
                            </ul>
                        </SupportSection>

                        <SupportSection
                            eyebrow="Permissions"
                            title="Permissions are tied to explicit features."
                            description="Cadence should not quietly request access it does not need."
                        >
                            <ul>
                                <li>
                                    <strong>Notifications:</strong> browser or desktop notifications are optional and are
                                    used for reminders and due-date alerts when you enable them.
                                </li>
                                <li>
                                    <strong>Precise location:</strong> used for holiday and weather context when enabled.
                                    If you deny it, Cadence falls back to broader or manual region selection.
                                </li>
                                <li>
                                    <strong>No hidden camera or microphone path:</strong> the current codebase does not
                                    expose general camera, microphone, or contact-list access for the main planning flows.
                                </li>
                            </ul>
                        </SupportSection>

                        <SupportSection
                            eyebrow="Sharing"
                            title="How Cadence shares data."
                            description="Cadence should share only what the product needs to function."
                        >
                            <p>
                                Cadence does not present a paid plan, ad network, or data-broker model in the current
                                release. Your data is not meant to be sold. Data may still move through infrastructure
                                providers that help the product run, such as authentication and hosting services.
                            </p>
                            <p>
                                The settings UI also contains future-facing integration controls for Google Calendar,
                                Apple Calendar, Notion, Obsidian, and ICS feeds, but those surfaces are explicitly marked
                                <strong> coming soon</strong> in the current product. When those integrations become live,
                                Cadence should document the exact data exchanged with each one.
                            </p>
                        </SupportSection>

                        <SupportSection
                            eyebrow="Controls"
                            title="What control you have."
                            description="Cadence should make the main privacy levers understandable inside the product."
                        >
                            <ul>
                                <li>
                                    You can manage notification behavior, recent search storage, dismissed prompt memory,
                                    and precise holiday location from settings.
                                </li>
                                <li>
                                    The app includes an export request flow and a manual deletion path, but automated
                                    export delivery is not yet fully implemented in the current release.
                                </li>
                                <li>
                                    Until a dedicated support channel is published, export and deletion requests should be
                                    raised through the maintainers via the project repository:{" "}
                                    <a href={CADENCE_ISSUES_URL} target="_blank" rel="noreferrer">
                                        {CADENCE_ISSUES_URL}
                                    </a>
                                    .
                                </li>
                            </ul>
                        </SupportSection>

                        <SupportSection
                            eyebrow="Security"
                            title="Security posture and limits."
                            description="Cadence uses real protections, but pre-release software still deserves caution."
                        >
                            <p>
                                The shared backend verifies bearer tokens against a remote JWK set and applies rate
                                limiting for global, read, write, and admin paths. That said, no internet service can
                                promise perfect security, and beta software should be treated with care.
                            </p>
                            <p>
                                If you are using {CADENCE_PUBLIC_VERSION}, avoid relying on Cadence as the only record for
                                emergency, legal, medical, or otherwise high-stakes obligations until the release surface
                                and operational support paths mature further.
                            </p>
                        </SupportSection>
                    </SupportPageLayout>
                </PageContent>
            </ScrollAreaWrapper>
        </MainLayout>
    );
}
