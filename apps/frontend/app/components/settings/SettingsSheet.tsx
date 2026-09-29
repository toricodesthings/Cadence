import { useEffect, useRef } from "react";
import { Info, UserRound, type LucideIcon } from "lucide-react";
import { useAuthState } from "../../hooks/auth/use-auth-state";
import { useUtilityNavigation } from "../../hooks/ui/use-utility-navigation";
import { useShellMode } from "../../hooks/ui/use-shell-mode";
import { flushAllPendingSettingsMutations } from "../../hooks/core/use-settings";
import { UtilitySheet } from "../shared/UtilitySheet";
import { NAV_GROUP, NAV_GROUP_LABEL, NavigationRow } from "../layout/NavigationRow";
import { SettingsContent, SETTINGS_CATEGORIES } from "./SettingsContent";
import { SignOutButton } from "./SignOutButton";

type MenuGroup = { label: string; items: Array<{ id: string; label: string; icon: LucideIcon }> };

/** The menu's categories under their headings; Profile and About sit apart, and phones skip Shortcuts. */
function menuGroups(isPhone: boolean): MenuGroup[] {
    const groups: MenuGroup[] = [];
    for (const item of SETTINGS_CATEGORIES) {
        if (item.isHeader) groups.push({ label: item.label, items: [] });
        else if (item.id && item.icon && item.id !== "account" && item.id !== "about" && !(isPhone && item.id === "shortcuts")) {
            groups.at(-1)?.items.push({ id: item.id, label: item.label, icon: item.icon });
        }
    }
    return groups.filter((group) => group.items.length > 0);
}

export function SettingsSheet() {
    const { settings, openSettings, close } = useUtilityNavigation();
    const { session } = useAuthState();
    const shell = useShellMode();
    const profileLine = session?.user.name ?? session?.user.email;
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
            <div className={NAV_GROUP}>
                <NavigationRow icon={UserRound} onClick={() => navigateTo("account")}>
                    <span className="block">Profile & Security</span>
                    {profileLine ? <span className="block truncate text-xs text-twilight-text-soft">{profileLine}</span> : null}
                </NavigationRow>
            </div>
            {menuGroups(shell.isPhone).map((group) => (
                <section key={group.label} className="space-y-1.5">
                    <h3 className={NAV_GROUP_LABEL}>{group.label}</h3>
                    <nav aria-label={group.label} className={NAV_GROUP}>
                        {group.items.map((item) => (
                            <NavigationRow key={item.id} icon={item.icon} onClick={() => navigateTo(item.id)}>{item.label}</NavigationRow>
                        ))}
                    </nav>
                </section>
            ))}
            <div className={NAV_GROUP}>
                <NavigationRow icon={Info} onClick={() => navigateTo("about")}>About Cadence</NavigationRow>
            </div>
            <SignOutButton />
        </>}
    </UtilitySheet>;
}
