import { Dialog, DialogContent, DialogTitle } from "../primitives/Dialog";
import { Keyboard } from "lucide-react";
import { SHORTCUT_SECTIONS, bindingKeys } from "../../lib/constants/shortcuts";
import { IS_DESKTOP_RUNTIME } from "../../platform/runtime";
import { useSettings } from "../../hooks/core/use-settings";
import { SETTINGS_DEFAULTS } from "../../types/settings";

interface ShortcutReferenceProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

function Kbd({ children }: { children: string }) {
    return (
        <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-twilight-border/60 bg-twilight-surface/50 px-1 text-[10px] font-medium text-twilight-text-soft">
            {children}
        </kbd>
    );
}

export function ShortcutReference({ open, onOpenChange }: ShortcutReferenceProps) {
    const bindings = { ...SETTINGS_DEFAULTS.shortcuts.bindings, ...useSettings().data?.shortcuts?.bindings };
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <div className="px-6 py-5">
                    <div className="mb-4 flex items-center gap-2">
                        <Keyboard size={16} className="text-twilight-text-soft" aria-hidden="true" />
                        <DialogTitle className="font-display text-base leading-normal">
                            Keyboard shortcuts
                        </DialogTitle>
                    </div>

                    <div className="grid grid-cols-2 gap-x-8 gap-y-4 max-h-[60vh] overflow-y-auto">
                        {SHORTCUT_SECTIONS.map((section) => (
                            <div key={section.title}>
                                <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-twilight-text-muted">
                                    {section.title}
                                </h3>
                                <ul className="space-y-1">
                                    {section.items.filter((item) => IS_DESKTOP_RUNTIME || !item.desktopOnly).map((item) => (
                                        <li key={item.label} className="flex items-center justify-between gap-2 py-0.5">
                                            <span className="text-xs text-twilight-text-soft">{item.label}</span>
                                            <span className="flex items-center gap-0.5">
                                                {(item.binding ? bindingKeys(bindings[item.binding]) : item.keys ?? []).map((k, i) => (
                                                    <Kbd key={i}>{k}</Kbd>
                                                ))}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>

                    <p className="mt-4 text-[11px] text-twilight-text-muted">
                        Letter shortcuts are disabled when typing in an input field.
                    </p>
                </div>
            </DialogContent>
        </Dialog>
    );
}
