export { RouteErrorBoundary as ErrorBoundary } from "../components/shared/RouteErrorBoundary";
import { MainLayout } from "../components/layout/MainLayout";
import { HelpPage } from "../components/help/HelpPage";
import { useRouteFocus } from "../hooks/search/use-route-focus";

export default function HelpFeedbackRoute() {
    useRouteFocus();

    return (
        <MainLayout
            navigationMode="rail"
            pageTitle="Help & Feedback"
            pageDescription="Find your way around Cadence, one feature at a time."
        >
            <HelpPage />
        </MainLayout>
    );
}
