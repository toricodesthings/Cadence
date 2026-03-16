import * as React from "react";
import { useSearchParams } from "react-router";
import { User, Bell, Clock, Sparkles, Paintbrush, Keyboard, CheckSquare, Blocks, Shield, Search, X, Info } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../primitives/Dialog";
import { Input } from "../primitives/Input";
import { cn } from "../../lib/utils";
import { flushAllPendingSettingsMutations } from "../../hooks/core/use-settings";

// Tabs
import { AccountTab } from "./tabs/AccountTab";
import { NotificationsTab } from "./tabs/NotificationsTab";
import { DateTimeTab } from "./tabs/DateTimeTab";
import { AITab } from "./tabs/AITab";
import { AppearanceTab } from "./tabs/AppearanceTab";
import { ShortcutsTab } from "./tabs/ShortcutsTab";
import { TasksTab } from "./tabs/TasksTab";
import { IntegrationsTab } from "./tabs/IntegrationsTab";
import { DataPrivacyTab } from "./tabs/DataPrivacyTab";
import { AboutTab } from "./tabs/AboutTab";

type TabId =
    | "about"
    | "account"
    | "notifications"
    | "datetime"
    | "ai"
    | "appearance"
    | "shortcuts"
    | "tasks"
    | "integrations"
    | "privacy";

const SETTINGS_CATEGORIES = [
    { label: "Profile & Security", isHeader: true },
    { id: "about", label: "About Cadence", icon: Info },
    { id: "account", label: "Profile & Security", icon: User },

    { label: "Preferences", isHeader: true },
    { id: "appearance", label: "Appearance", icon: Paintbrush },
    { id: "notifications", label: "Notifications", icon: Bell },
    { id: "datetime", label: "Calendar & Time", icon: Clock },
    { id: "tasks", label: "Tasks & Workflow", icon: CheckSquare },
    { id: "shortcuts", label: "Keyboard Shortcuts", icon: Keyboard },

    { label: "Workspace", isHeader: true },
    { id: "integrations", label: "Integrations", icon: Blocks, badge: "Soon" },

    { label: "Privacy", isHeader: true },
    { id: "privacy", label: "Privacy & Data", icon: Shield },

    { label: "Planned", isHeader: true },
    { id: "ai", label: "Cadence Intelligence", icon: Sparkles },
];

export function SettingsDialog() {
    const [searchParams, setSearchParams] = useSearchParams();
    const activeTab = searchParams.get("settings") as TabId | null;

    // We keep internal state for search to filter tabs in the sidebar
    const [searchQuery, setSearchQuery] = React.useState("");

    const handleClose = async () => {
        await flushAllPendingSettingsMutations();
        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete("settings");
        setSearchParams(nextParams);
    };

    const handleTabChange = async (tabId: string) => {
        await flushAllPendingSettingsMutations();
        const nextParams = new URLSearchParams(searchParams);
        nextParams.set("settings", tabId);
        setSearchParams(nextParams);
    };

    const handleEscape = (e: KeyboardEvent) => {
        if (e.key === "Escape" && activeTab) {
            void handleClose();
        }
    };

    React.useEffect(() => {
        document.addEventListener("keydown", handleEscape);
        return () => document.removeEventListener("keydown", handleEscape);
    }, [activeTab]);

    if (!activeTab) return null;

    // Resolve component to render
    const RenderContent = () => {
        switch (activeTab) {
            case "about": return <AboutTab />;
            case "account": return <AccountTab />;
            case "notifications": return <NotificationsTab />;
            case "datetime": return <DateTimeTab />;
            case "ai": return <AITab />;
            case "appearance": return <AppearanceTab />;
            case "shortcuts": return <ShortcutsTab />;
            case "tasks": return <TasksTab />;
            case "integrations": return <IntegrationsTab />;
            case "privacy": return <DataPrivacyTab />;
            default: return <AccountTab />;
        }
    };

    return (
        <Dialog open={!!activeTab} onOpenChange={(open) => !open && void handleClose()}>
            <DialogContent
                className="block h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-none gap-0 overflow-hidden rounded-[2rem] border border-twilight-border-light bg-twilight-deep/95 p-0 shadow-[0_32px_96px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.05)] outline-none lg:h-[95vh] lg:w-[min(96vw,1720px)] !translate-x-[-50%] !translate-y-[-50%] !left-[50%] !top-[50%]"
                style={{
                    width: "min(calc(100vw - 2rem), 1720px)",
                    maxWidth: "none",
                    height: "calc(100vh - 2rem)",
                }}
                hideCloseButton
            >
                <DialogTitle className="sr-only">Settings</DialogTitle>
                <DialogDescription className="sr-only">Modify your account and application preferences.</DialogDescription>

                <div className="flex w-full h-full">
                    {/* Left Sidebar */}
                    <div className="hidden w-[280px] shrink-0 flex-col gap-6 overflow-y-auto border-r border-twilight-border/70 bg-twilight-surface-muted/70 px-4 py-10 md:flex">
                        <div className="px-2">
                            <Input
                                icon={<Search className="w-4 h-4" />}
                                placeholder="Search settings..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="bg-twilight-base/40 border-twilight-border/80"
                            />
                        </div>

                        <nav className="flex flex-col gap-1 pr-2">
                            {SETTINGS_CATEGORIES.map((item, i) => {
                                if (item.isHeader) {
                                    return (
                                        <div key={`header-${i}`} className="mt-4 mb-1 px-3 text-xs font-semibold uppercase tracking-[0.18em] text-twilight-text-soft">
                                            {item.label}
                                        </div>
                                    );
                                }

                                // Filter by search
                                if (searchQuery && !item.label?.toLowerCase().includes(searchQuery.toLowerCase())) {
                                    return null;
                                }

                                const Icon = item.icon as any;
                                const isActive = activeTab === item.id;

                                return (
                                    <button
                                        key={item.id}
                                        type="button"
                                        onClick={() => void handleTabChange(item.id!)}
                                        className={cn(
                                            "flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm outline-none transition-colors cursor-pointer",
                                            isActive
                                                ? "bg-white/[0.08] text-twilight-text font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
                                                : "text-twilight-text-soft hover:bg-white/[0.05] hover:text-twilight-text"
                                        )}
                                    >
                                        <Icon className={cn("h-4 w-4", isActive ? "h-5 w-5 text-lantern" : "text-twilight-text-muted")} />
                                        {item.label}
                                        {(item as any).badge && (
                                            <span className="ml-auto rounded-full border border-lantern/30 bg-lantern/12 px-1.5 py-0.5 text-[10px] font-medium text-lantern">
                                                {(item as any).badge}
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </nav>
                    </div>

                    {/* Main Content Area */}
                    <div className="settings-content-bg relative flex flex-1 flex-col items-stretch overflow-y-auto">
                        <button
                            type="button"
                            className="group absolute right-6 top-6 z-10 hidden flex-col items-center gap-2 lg:flex"
                            onClick={() => void handleClose()}
                            aria-label="Close settings"
                        >
                            <div className="btn-icon rounded-full border border-twilight-border-light text-twilight-text-soft group-hover:bg-white/[0.06] group-hover:text-twilight-text">
                                <X className="w-5 h-5" />
                            </div>
                            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-twilight-text-muted">ESC</span>
                        </button>

                        <div className="min-h-full w-full px-8 py-14 md:px-14 xl:px-20">
                            <RenderContent />
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
