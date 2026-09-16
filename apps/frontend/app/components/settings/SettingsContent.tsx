import { User, Bell, Clock, Sparkles, Paintbrush, Keyboard, CheckSquare, Blocks, Shield, Info, Bot, MapPin } from "lucide-react";

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
import { LocationTab } from "./tabs/LocationTab";
import { AboutTab } from "./tabs/AboutTab";
import { AssistantTab } from "./tabs/AssistantTab";

export type TabId =
    | "about"
    | "account"
    | "notifications"
    | "datetime"
    | "ai"
    | "assistant"
    | "appearance"
    | "shortcuts"
    | "tasks"
    | "integrations"
    | "location"
    | "privacy";

export const SETTINGS_CATEGORIES = [
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
    { id: "assistant", label: "Cadence Assistant", icon: Bot },
    { id: "integrations", label: "Integrations", icon: Blocks, badge: "Soon" },

    { label: "Privacy & Control", isHeader: true },
    { id: "ai", label: "Intelligence & Privacy", icon: Sparkles },
    { id: "location", label: "Location & Weather", icon: MapPin },
    { id: "privacy", label: "Data & Export", icon: Shield },
];

export function SettingsContent({ activeTab }: { activeTab: string }) {
    switch (activeTab) {
        case "about": return <AboutTab />;
        case "account": return <AccountTab />;
        case "notifications": return <NotificationsTab />;
        case "datetime": return <DateTimeTab />;
        case "ai": return <AITab />;
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
