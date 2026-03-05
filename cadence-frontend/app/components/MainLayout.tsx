import { Sidebar } from "../components/sidebar/Sidebar";
import { Toaster } from "../components/feedback/Toaster";
import { useNavigate, useLocation } from "react-router";
import { authClient } from "../lib/auth-client";
import { useEffect } from "react";
import * as Tooltip from "../components/primitives/Tooltip";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useSidebarStore } from "../stores/sidebar-store";
import { useKeyboardShortcuts } from "../hooks/use-keyboard-shortcuts";
import { CommandPalette } from "./CommandPalette";
import { FloatingActionBar } from "./tasks/FloatingActionBar";
import { useState } from "react";

const PAGE_TITLES: Record<string, string> = {
    "/": "Planner",
    "/schedule": "Schedule",
    "/upcoming": "Upcoming",
    "/inbox": "Inbox",
    "/completed": "Completed",
    "/trash": "Trash"
};

export function MainLayout({ children, requireAuth = false, sidePanel, headerCenter, headerRight }: { children: React.ReactNode, requireAuth?: boolean, sidePanel?: React.ReactNode, headerCenter?: React.ReactNode, headerRight?: React.ReactNode }) {
    const { data: session, isPending } = authClient.useSession();
    const navigate = useNavigate();
    const location = useLocation();
    const { isCollapsed, toggleCollapse } = useSidebarStore();
    const [commandOpen, setCommandOpen] = useState(false);

    useKeyboardShortcuts({
        onCommandPalette: () => setCommandOpen((open) => !open),
        // other commands handled by defaults
    });

    // Enforce auth gating if requested by the page
    useEffect(() => {
        if (requireAuth && !isPending && !session) {
            navigate("/auth/sign-in", { replace: true });
        }
    }, [requireAuth, isPending, session, navigate]);

    if (requireAuth && !isPending && !session) {
        return null; // Prevent flash of content
    }

    const pageTitle = PAGE_TITLES[location.pathname] || (location.pathname.startsWith("/project/") ? "Project" : "");

    return (
        <Tooltip.Provider delayDuration={300}>
            <div className="h-screen flex bg-twilight overflow-hidden">
                <Sidebar />

                {/* Main area */}
                <div className="flex-1 flex flex-col min-w-0">
                    {/* Top bar — minimal, breathing */}
                    <header className="h-14 shrink-0 flex items-center justify-between px-6 border-b border-twilight-border">
                        <div className="flex items-center gap-3">
                            {/* Sidebar collapse toggle */}
                            <button
                                onClick={toggleCollapse}
                                aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                                aria-expanded={!isCollapsed}
                                aria-controls="sidebar-panel"
                                className="w-8 h-8 rounded-lg flex items-center justify-center text-twilight-text-muted hover:text-twilight-text-soft hover:bg-white/[0.04] transition-colors cursor-pointer outline-none"
                            >
                                {isCollapsed
                                    ? <PanelLeftOpen size={16} aria-hidden="true" />
                                    : <PanelLeftClose size={16} aria-hidden="true" />
                                }
                            </button>

                            {pageTitle && (
                                <h1 className="text-xs font-bold text-twilight-text tracking-[0.2em] uppercase font-display">
                                    {pageTitle}
                                </h1>
                            )}
                        </div>

                        {headerCenter && (
                            <div className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center">
                                {headerCenter}
                            </div>
                        )}

                        <div className="flex items-center gap-4">{headerRight}</div>
                    </header>

                    {/* Content */}
                    <main className="flex-1 overflow-hidden">
                        {children}
                    </main>
                </div>

                {/* Side panel — spans full height, overtakes toolbar */}
                {sidePanel}
            </div>

            <FloatingActionBar />
            <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
            <Toaster />
        </Tooltip.Provider>
    );
}
