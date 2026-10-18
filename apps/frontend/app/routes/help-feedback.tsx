import { LifeBuoy } from "lucide-react";
export { RouteErrorBoundary as ErrorBoundary } from "../components/shared/RouteErrorBoundary";
import { MainLayout } from "../components/layout/MainLayout";
import { HelpPage } from "../components/help/HelpPage";
import { useRouteFocus } from "../hooks/search/use-route-focus";

export default function HelpFeedbackRoute() {
    useRouteFocus();

    return (
        <MainLayout
            navigationMode="rail"
            hideContextualOrb
            pageTitle="Help & Feedback"
            shellHeader={{
                title: "Help & Feedback",
                eyebrow: "A little guidance",
                icon: <LifeBuoy size={18} aria-hidden="true" />,
                accentColor: "var(--accent-primary)",
            }}
        >
            <HelpPage />
        </MainLayout>
    );
}
