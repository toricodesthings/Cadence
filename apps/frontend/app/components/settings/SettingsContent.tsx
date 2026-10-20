import { User, Bell, Clock, Paintbrush, Keyboard, CheckSquare, Blocks, Shield, Info, Bot, MapPin } from "lucide-react";

// Tabs
import { AccountTab } from "./tabs/AccountTab";
import { NotificationsTab } from "./tabs/NotificationsTab";
import { DateTimeTab } from "./tabs/DateTimeTab";
import { AppearanceTab } from "./tabs/AppearanceTab";
import { ShortcutsTab } from "./tabs/ShortcutsTab";
import { TasksTab } from "./tabs/TasksTab";
import { IntegrationsTab } from "./tabs/IntegrationsTab";
import { DataPrivacyTab } from "./tabs/DataPrivacyTab";
import { LocationTab } from "./tabs/LocationTab";
import { AboutTab } from "./tabs/AboutTab";
import { AssistantTab } from "./tabs/AssistantTab";

export type TabId =
    | "about"
    | "account"
    | "notifications"
    | "datetime"
    | "assistant"
    | "appearance"
    | "shortcuts"
    | "tasks"
    | "integrations"
    | "location"
    | "privacy";

/** Old tab ids that still arrive in links (chat history, bookmarks): where their settings live now. */
const MOVED_TABS: Record<string, TabId> = { ai: "tasks" };

/** The tab a `?settings=` value opens, following moved tabs. */
export function settingsTab(value: string | null): string | null {
    return value ? MOVED_TABS[value] ?? value : value;
}

/** `keywords` are the tab's row titles, so search finds "quiet hours" as well as "Notifications". Keep them in step with the tab. */
export const SETTINGS_CATEGORIES = [
    { label: "Account", isHeader: true },
    { id: "about", label: "About Cadence", icon: Info, keywords: ["version", "updates", "changelog", "help", "feedback", "terms", "reload fresh"] },
    { id: "account", label: "Profile & Security", icon: User, keywords: ["name", "photo", "avatar", "email", "birthday", "password", "google", "github", "sign-in", "devices", "sessions", "delete account"] },

    { label: "Preferences", isHeader: true },
    { id: "appearance", label: "Appearance", icon: Paintbrush, keywords: ["theme", "daylight", "twilight", "dark", "light", "palette", "accent", "intensity", "background", "photo", "loading screen", "motion", "animation", "low stimulation", "density", "compact", "scale"] },
    { id: "notifications", label: "Notifications", icon: Bell, keywords: ["reminders", "alerts", "push", "devices", "due dates", "overdue", "follow-ups", "blocks", "routines", "dot", "yearly events", "pause", "quiet hours", "morning", "evening", "background"] },
    { id: "datetime", label: "Calendar & Time", icon: Clock, keywords: ["time zone", "12-hour", "24-hour", "date format", "week starts", "calendar view", "timeline", "all-day", "fixed", "routines", "holidays", "yearly events"] },
    { id: "tasks", label: "Tasks & Routines", icon: CheckSquare, keywords: ["due date", "priority", "placement", "rows", "board", "kanban", "completed", "trash", "celebration", "streaks", "quick add", "tray", "smart features", "smart capture", "effort", "confidence", "captures", "smart sort", "focus views", "intelligence"] },
    { id: "shortcuts", label: "Keyboard Shortcuts", icon: Keyboard, keywords: ["keys", "bindings", "hotkeys", "command palette", "quick capture"] },

    { label: "Workspace", isHeader: true },
    { id: "assistant", label: "Cadence Assistant", icon: Bot, keywords: ["name", "nickname", "persona", "voice", "tone", "suggestions", "emoji", "memory", "instructions", "conversations", "archive", "usage"] },
    { id: "integrations", label: "Integrations", icon: Blocks, keywords: ["connected assistants", "mcp", "claude", "sync", "google calendar", "apple calendar", "notion", "obsidian", "ics"] },

    { label: "Privacy & Control", isHeader: true },
    { id: "location", label: "Location & Weather", icon: MapPin, keywords: ["city", "country", "region", "precise", "approximate", "weather", "forget"] },
    { id: "privacy", label: "Data & Privacy", icon: Shield, keywords: ["diagnostics", "crash reports", "recent searches", "intelligence history", "export", "email my data"] },
];

export function SettingsContent({ activeTab }: { activeTab: string }) {
    switch (activeTab) {
        case "about": return <AboutTab />;
        case "account": return <AccountTab />;
        case "notifications": return <NotificationsTab />;
        case "datetime": return <DateTimeTab />;
        case "assistant": return <AssistantTab />;
        case "appearance": return <AppearanceTab />;
        case "shortcuts": return <ShortcutsTab />;
        case "tasks": return <TasksTab />;
        case "integrations": return <IntegrationsTab />;
        case "location": return <LocationTab />;
        case "privacy": return <DataPrivacyTab />;
        default: return <AccountTab />;
    }
}
