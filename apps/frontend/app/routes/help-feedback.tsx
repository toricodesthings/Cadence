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
        >
            <HelpPage />
        </MainLayout>
    );
}
