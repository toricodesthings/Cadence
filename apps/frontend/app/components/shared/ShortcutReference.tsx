import { Dialog, DialogContent } from "../primitives/Dialog";
import { Keyboard } from "lucide-react";

interface ShortcutReferenceProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

interface ShortcutEntry {
    keys: string[];
    label: string;
}

const SECTIONS: { title: string; items: ShortcutEntry[] }[] = [
    {
        title: "Navigation",
        items: [
            { keys: ["G", "T"], label: "Go to Today" },
            { keys: ["G", "S"], label: "Go to Schedule" },
            { keys: ["G", "I"], label: "Go to Inbox" },
            { keys: ["G", "H"], label: "Go to Habits" },
            { keys: ["G", "U"], label: "Go to Upcoming" },
            { keys: ["G", "W"], label: "Go to Weekly Reset" },
        ],
    },
    {
        title: "Global",
        items: [
            { keys: ["⌘", "K"], label: "Command palette" },
            { keys: ["Q"], label: "Quick capture" },
            { keys: ["⇧", "Q"], label: "Quick add task" },
            { keys: ["?"], label: "Shortcut reference" },
        ],
    },
    {
        title: "Object actions",
        items: [
            { keys: ["R"], label: "Reschedule" },
            { keys: ["P"], label: "Pin / unpin" },
            { keys: ["E"], label: "Edit / rename" },
            { keys: ["M"], label: "Open menu" },
            { keys: ["."], label: "Quick actions" },
        ],
    },
    {
        title: "Page navigation",
        items: [
            { keys: ["J"], label: "Next section" },
            { keys: ["K"], label: "Previous section" },
        ],
    },
    {
        title: "Schedule",
        items: [
            { keys: ["D"], label: "Day view" },
            { keys: ["W"], label: "Week view" },
            { keys: ["T"], label: "Jump to today" },
            { keys: ["←"], label: "Previous period" },
            { keys: ["→"], label: "Next period" },
            { keys: ["C"], label: "Create event" },
        ],
    },
    {
        title: "Weekly Reset",
        items: [
            { keys: ["→"], label: "Next step" },
            { keys: ["←"], label: "Previous step" },
            { keys: ["Esc"], label: "Exit" },
        ],
    },
];

function Kbd({ children }: { children: string }) {
    return (
        <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-twilight-border/60 bg-twilight-surface/50 px-1 text-[10px] font-medium text-twilight-text-soft">
            {children}
        </kbd>
    );
}

export function ShortcutReference({ open, onOpenChange }: ShortcutReferenceProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg">
                <div className="px-6 py-5">
                    <div className="mb-4 flex items-center gap-2">
                        <Keyboard size={16} className="text-twilight-text-soft" aria-hidden="true" />
                        <h2 className="font-display text-base font-semibold text-twilight-text">
                            Keyboard shortcuts
                        </h2>
                    </div>

                    <div className="grid grid-cols-2 gap-x-8 gap-y-4 max-h-[60vh] overflow-y-auto">
                        {SECTIONS.map((section) => (
                            <div key={section.title}>
                                <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-twilight-text-muted">
                                    {section.title}
                                </h3>
                                <ul className="space-y-1">
                                    {section.items.map((item) => (
                                        <li key={item.label} className="flex items-center justify-between gap-2 py-0.5">
                                            <span className="text-xs text-twilight-text-soft">{item.label}</span>
                                            <span className="flex items-center gap-0.5">
                                                {item.keys.map((k, i) => (
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
