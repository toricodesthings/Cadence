import { CalendarHeart, Flame, History, LifeBuoy, Settings } from "lucide-react";
import { useShellMode } from "../hooks/ui/use-shell-mode";
import { useUtilityNavigation } from "../hooks/ui/use-utility-navigation";
import { MainLayout } from "../components/layout/MainLayout";
import { NavigationRow } from "../components/layout/NavigationRow";
import { SidebarPanel } from "../components/sidebar/SidebarPanel";

export default function BrowsePage() {
    const shell = useShellMode();
    const { openSettings } = useUtilityNavigation();
    return <MainLayout requireAuth hideContextualOrb pageTitle="Browse">
        <div className="mobile-page-scroll min-h-0 flex-1 overflow-y-auto px-4 py-4"><div className="mx-auto max-w-3xl space-y-5">
            {shell.isCompact && <nav aria-label="Personal tools" className="rounded-2xl border border-twilight-border bg-twilight-surface/40">
                <NavigationRow to="/habits" icon={Flame}>Habits</NavigationRow>
                <NavigationRow to="/events" icon={CalendarHeart}>Events</NavigationRow>
                <button type="button" onClick={() => openSettings()} className="flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-xl px-4 text-sm text-twilight-text hover:bg-twilight-surface active:bg-twilight-surface"><Settings size={20} aria-hidden="true" />Settings</button>
            </nav>}
            <div className="rounded-2xl border border-twilight-border bg-twilight-surface/40"><SidebarPanel showWorkspaceNav embedded /></div>
            <nav aria-label="Support" className="rounded-2xl border border-twilight-border bg-twilight-surface/40">
                <NavigationRow to="/help-feedback" icon={LifeBuoy}>Help & Feedback</NavigationRow>
                <NavigationRow to="/changelog" icon={History}>What’s new</NavigationRow>
            </nav>
        </div></div>
    </MainLayout>;
}
