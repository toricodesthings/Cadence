import { FileText } from "lucide-react";
export { RouteErrorBoundary as ErrorBoundary } from "../components/shared/RouteErrorBoundary";
import { MainLayout } from "../components/layout/MainLayout";
import { PageContent } from "../components/layout/PageLayout";
import { ScrollAreaWrapper } from "../components/shared/ScrollAreaWrapper";
import { SupportFactGrid, SupportPageLayout, SupportSection } from "../components/support/SupportPageLayout";
import { useRouteFocus } from "../hooks/search/use-route-focus";
import { CADENCE_PUBLIC_VERSION } from "../lib/constants/app-info";

export default function TermsRoute() {
    useRouteFocus();

    return (
        <MainLayout
            contentWidth="wide"
            pageTitle="Terms & Conditions"
            pageDescription="Review the pre-release terms for using Cadence, including beta status, acceptable use, ownership, and service limits."
            shellHeader={{
                title: "Terms & Conditions",
                eyebrow: "Compliance",
                icon: <FileText size={18} aria-hidden="true" />,
                accentColor: "var(--color-lantern)",
            }}
        >
            <ScrollAreaWrapper>
                <PageContent width="wide">
                    <SupportPageLayout
                        eyebrow="Terms"
                        title="Cadence should be used with clarity, care, and realistic expectations."
                        description={(
                            <p>
                                These pre-release terms are meant to say plainly how Cadence can be used, what remains
                                beta, and where responsibility sits between the product and the people using it.
                            </p>
                        )}
                        meta={[CADENCE_PUBLIC_VERSION, "Beta service", "Open source", "No paid plan"]}
                        aside={(
                            <div className="space-y-3">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-twilight-text-soft">
                                    Short version
                                </p>
                                <p className="text-sm leading-6 text-twilight-text-soft">
                                    Use Cadence respectfully, keep your account secure, do not abuse the service, and do
                                    not treat a beta planning app as a guaranteed mission-critical system.
                                </p>
                            </div>
                        )}
                    >
                        <SupportFactGrid
                            items={[
                                {
                                    label: "Availability",
                                    value: "Best effort",
                                    detail: "Cadence is pre-release software and may change, pause, or break while the product is being hardened.",
                                },
                                {
                                    label: "Ownership",
                                    value: "Yours",
                                    detail: "You keep ownership of the tasks, notes, and other workspace content you create.",
                                },
                                {
                                    label: "Price",
                                    value: "Free",
                                    detail: "There is no paid tier or purchase requirement in the current product release.",
                                },
                                {
                                    label: "Use case",
                                    value: "Planning",
                                    detail: "Cadence is built for productivity workflows, not for emergency, medical, legal, or safety-critical decision making.",
                                },
                            ]}
                        />

                        <SupportSection
                            eyebrow="Acceptance"
                            title="Using Cadence means accepting the current pre-release terms."
                            description="If you use the app, browse the authenticated shell, or connect an account, these terms apply to that use."
                        >
                            <p>
                                Cadence is still evolving. By using it, you agree to use the service and clients in a
                                lawful, respectful way and to accept that product behavior, documentation, and support
                                paths may continue to change as the release matures.
                            </p>
                        </SupportSection>

                        <SupportSection
                            eyebrow="Beta status"
                            title={`Cadence ${CADENCE_PUBLIC_VERSION} is beta software.`}
                            description="The product is real, but the release surface is not finished."
                        >
                            <p>
                                Features may be incomplete, renamed, temporarily removed, or marked coming soon. Data
                                models and UI flows may also change as the team refines the product. Cadence will try to
                                avoid careless regressions, but the app is provided on a best-effort basis during this
                                stage.
                            </p>
                        </SupportSection>

                        <SupportSection
                            eyebrow="Accounts"
                            title="You are responsible for your account and device access."
                            description="Protect your sign-in method, linked providers, and devices."
                        >
                            <ul>
                                <li>Keep your credentials and linked OAuth accounts secure.</li>
                                <li>Do not share access in ways that would compromise your own or someone else’s data.</li>
                                <li>Report suspected unauthorized access as soon as you discover it.</li>
                            </ul>
                        </SupportSection>

                        <SupportSection
                            eyebrow="Your content"
                            title="You keep ownership of what you create in Cadence."
                            description="Cadence only needs limited rights to store, sync, display, and back up your workspace."
                        >
                            <p>
                                You retain ownership of your tasks, notes, habits, inbox items, and other content you
                                create. By using Cadence, you grant the service a limited permission to process that
                                content so it can authenticate you, sync your workspace, cache data locally, and render
                                the planning experience across supported clients.
                            </p>
                        </SupportSection>

                        <SupportSection
                            eyebrow="Acceptable use"
                            title="Please do not abuse the service."
                            description="Cadence is a planning product, not a place for harmful or hostile activity."
                        >
                            <ul>
                                <li>Do not use Cadence to break the law, harass others, or distribute malicious code.</li>
                                <li>Do not probe, overload, reverse engineer, or bypass rate limits or access controls.</li>
                                <li>Do not use Cadence in ways that would degrade the service for other users.</li>
                            </ul>
                        </SupportSection>

                        <SupportSection
                            eyebrow="Pricing and source"
                            title="The current release is fully free and open source."
                            description="No paid subscription terms are needed because the product does not currently sell a paid tier."
                        >
                            <p>
                                Cadence is presently offered without a paid plan. If that changes later, pricing,
                                entitlements, and refund language should be published separately and clearly instead of
                                being smuggled into generic terms.
                            </p>
                        </SupportSection>

                        <SupportSection
                            eyebrow="Third parties"
                            title="Some product functions depend on third-party infrastructure."
                            description="Authentication, hosting, desktop delivery, and future integrations may involve external services."
                        >
                            <p>
                                Cadence may rely on third-party providers to authenticate users, host the service, or
                                deliver desktop updates. Optional integration surfaces in settings are still marked
                                coming soon; if you later enable a live integration, any additional third-party terms may
                                also apply to that connected service.
                            </p>
                        </SupportSection>

                        <SupportSection
                            eyebrow="Suspension and change"
                            title="Cadence may suspend access, change features, or retire surfaces."
                            description="That includes actions taken to protect the service or respond to abuse."
                        >
                            <p>
                                The maintainers may suspend or limit access if use is abusive, unlawful, or harmful to
                                the product or other people. Cadence may also change or retire features as the product
                                evolves, especially during beta.
                            </p>
                        </SupportSection>

                        <SupportSection
                            eyebrow="Disclaimers"
                            title="Cadence is provided without a guarantee that it will always be uninterrupted or error-free."
                            description="Use judgment, keep backups when the stakes are high, and do not rely on the app as your only failsafe."
                        >
                            <p>
                                To the fullest extent allowed by applicable law, Cadence is provided “as is” and “as
                                available” during this release stage. The maintainers are not promising perfect uptime,
                                lossless sync, or fitness for high-stakes deadlines. You should keep your own backups and
                                cross-check important commitments where failure would seriously matter.
                            </p>
                        </SupportSection>
                    </SupportPageLayout>
                </PageContent>
            </ScrollAreaWrapper>
        </MainLayout>
    );
}
