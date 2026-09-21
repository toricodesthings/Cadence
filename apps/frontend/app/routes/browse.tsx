import { CalendarHeart, CheckCircle2, ChevronRight, History, LifeBuoy, Settings, Sprout, Trash2 } from "lucide-react";
import { useAuthState } from "../hooks/auth/use-auth-state";
import { useSettings } from "../hooks/core/use-settings";
import { useUtilityNavigation } from "../hooks/ui/use-utility-navigation";
import { MainLayout } from "../components/layout/MainLayout";
import { NavigationRow } from "../components/layout/NavigationRow";

const GROUP = "rounded-2xl border border-twilight-border bg-twilight-surface/40";

/** Profile quick view — the warm "it's your workspace" anchor, and the shortest
 * path to Profile & Security. */
function ProfileCard({ onOpen }: { onOpen: () => void }) {
    const { session } = useAuthState();
    const name = session?.user?.name?.split(" ")[0]?.trim() || "there";
    const image = session?.user?.image;
    const initial = (session?.user?.name || session?.user?.email || "U")[0]!.toUpperCase();

    return (
        <button
            type="button"
            onClick={onOpen}
            aria-label="Open profile and security settings"
            className={`${GROUP} flex w-full cursor-pointer items-center gap-4 px-4 py-4 text-left transition-colors hover:bg-twilight-surface active:bg-twilight-surface`}
        >
            <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent-primary/15 ring-1 ring-twilight-border">
                {image ? (
                    <img src={image} alt="" className="block size-full object-cover" />
                ) : (
                    <span className="font-display text-lg font-semibold text-accent-primary">{initial}</span>
                )}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate font-display text-lg font-semibold text-twilight-text">
                    Hey, <span className="text-accent-primary">{name}</span>
                </span>
                {session?.user?.email && (
                    <span className="truncate text-[13px] text-twilight-text-soft">{session.user.email}</span>
                )}
            </span>
            <ChevronRight size={18} className="shrink-0 text-twilight-text-soft" aria-hidden="true" />
        </button>
    );
}

export default function BrowsePage() {
    const { openSettings } = useUtilityNavigation();
    const { data: userSettings } = useSettings();

    return <MainLayout requireAuth hideContextualOrb pageTitle="Browse">
        <div className="mobile-page-scroll min-h-0 flex-1 overflow-y-auto px-4 py-4"><div className="mx-auto max-w-3xl space-y-5">
            <ProfileCard onOpen={() => openSettings("account")} />

            {/* Capture owns Today, Upcoming, Projects and Tags; Browse keeps the
                destinations you visit occasionally. */}
            <nav aria-label="Workspace" className={GROUP}>
                <NavigationRow to="/events" icon={CalendarHeart}>Events</NavigationRow>
                <NavigationRow to="/weekly-review" icon={Sprout}>Weekly Reset</NavigationRow>
                <button type="button" onClick={() => openSettings()} className="mobile-navigation-row flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-xl px-4 py-3 text-left text-twilight-text transition-colors hover:bg-twilight-surface active:bg-twilight-surface">
                    <Settings size={21} className="shrink-0 text-accent-primary" aria-hidden="true" />
                    <span className="min-w-0 flex-1 break-words">Settings</span>
                    <ChevronRight size={18} className="shrink-0 text-twilight-text-soft" aria-hidden="true" />
                </button>
            </nav>

            {(!userSettings?.tasks?.hideCompleted || !userSettings?.tasks?.hideTrash) && (
                <nav aria-label="Archive" className={GROUP}>
                    {!userSettings?.tasks?.hideCompleted && <NavigationRow to="/completed" icon={CheckCircle2}>Completed</NavigationRow>}
                    {!userSettings?.tasks?.hideTrash && <NavigationRow to="/trash" icon={Trash2}>Trash</NavigationRow>}
                </nav>
            )}

            <nav aria-label="Support" className={GROUP}>
                <NavigationRow to="/help-feedback" icon={LifeBuoy}>Help & Feedback</NavigationRow>
                <NavigationRow to="/changelog" icon={History}>What’s new</NavigationRow>
            </nav>
        </div></div>
    </MainLayout>;
}
