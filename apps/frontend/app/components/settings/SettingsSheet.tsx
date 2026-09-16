import { useEffect, useRef } from "react";
import { ChevronRight, Info, UserRound, type LucideIcon } from "lucide-react";
import { useAuthState } from "../../hooks/auth/use-auth-state";
import { useUtilityNavigation } from "../../hooks/ui/use-utility-navigation";
import { flushAllPendingSettingsMutations } from "../../hooks/core/use-settings";
import { UtilitySheet } from "../shared/UtilitySheet";
import { SettingsContent, SETTINGS_CATEGORIES } from "./SettingsContent";
import { SignOutButton } from "./SignOutButton";

function SettingsItem({ label, icon: Icon, onClick, description }: {
    label: string; icon: LucideIcon; onClick: () => void; description?: string;
}) {
    return <button type="button" onClick={onClick} className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-twilight-text transition-colors hover:bg-twilight-surface active:bg-twilight-surface cursor-pointer">
        <Icon size={20} className="shrink-0 text-twilight-text-soft" aria-hidden="true" />
        <span className="min-w-0 flex-1"><span className="block">{label}</span>{description && <span className="mt-1 block truncate text-xs text-twilight-text-soft">{description}</span>}</span>
        <ChevronRight size={16} className="shrink-0 text-twilight-text-soft" aria-hidden="true" />
    </button>;
}

export function SettingsSheet() {
    const { settings, openSettings, close } = useUtilityNavigation();
    const { session } = useAuthState();
    const lastTab = useRef(settings ?? "menu");
    useEffect(() => { if (settings) lastTab.current = settings; }, [settings]);
    const activeTab = settings ?? lastTab.current;
    const category = SETTINGS_CATEGORIES.find((item) => item.id === activeTab);
    const navigateTo = (tab: string) => {
        void flushAllPendingSettingsMutations();
        openSettings(tab);
    };
    const handleClose = () => { void flushAllPendingSettingsMutations(); close(); };

    return <UtilitySheet open={settings !== null} title={category?.label ?? "Settings"} onClose={handleClose} onBack={category ? () => navigateTo("menu") : undefined}>
        {category?.id ? <div className="mobile-settings-content"><SettingsContent activeTab={category.id} /></div> : <>
            <div className="rounded-2xl bg-twilight-surface/60">
                <SettingsItem label="Profile & Security" description={session?.user.name ?? session?.user.email ?? undefined} icon={UserRound} onClick={() => navigateTo("account")} />
            </div>
            <nav aria-label="Settings categories" className="rounded-2xl bg-twilight-surface/40 p-1">
                {SETTINGS_CATEGORIES.map((item, index) => {
                    if (item.isHeader) return index === 0 ? null : <h3 key={item.label} className="px-3 pb-1 pt-4 text-xs font-medium text-twilight-text-soft">{item.label}</h3>;
                    if (!item.id || !item.icon || item.id === "account" || item.id === "about") return null;
                    return <SettingsItem key={item.id} label={item.label} icon={item.icon} onClick={() => navigateTo(item.id!)} />;
                })}
            </nav>
            <SettingsItem label="About Cadence" icon={Info} onClick={() => navigateTo("about")} />
            <SignOutButton />
        </>}
    </UtilitySheet>;
}
