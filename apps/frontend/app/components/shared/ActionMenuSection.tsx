import type { ActionDefinition, ActionSection } from "../../lib/actions/action-grammar";
import { groupActions } from "../../lib/actions/action-grammar";

interface ActionMenuSectionProps {
    actions: ActionDefinition[];
    onAction: (actionId: string) => void;
    disabledActions?: Record<string, string>;
}

const SECTION_ORDER: ActionSection[] = ["open", "time", "state", "organize", "convert", "destructive"];

/**
 * Generic action menu renderer — shared between context menus and dropdown menus.
 *
 * §10.1: Extract a generic ActionMenuSection schema so dropdown and context menus
 * render from the same action definition object.
 *
 * Renders grouped, ordered menu items with keyboard hints,
 * disabled-state reasons, and visual separators between sections.
 */
export function ActionMenuSection({ actions, onAction, disabledActions = {} }: ActionMenuSectionProps) {
    const groups = groupActions(actions);
    const orderedSections = SECTION_ORDER.filter((s) => groups[s]?.length);

    return (
        <>
            {orderedSections.map((section, sectionIndex) => (
                <div key={section} role="group" aria-label={section}>
                    {sectionIndex > 0 && (
                        <div className="my-1 border-t border-twilight-border/40" role="separator" />
                    )}
                    {groups[section]!.map((action) => {
                        const disabledReason = disabledActions[action.id];
                        const isDisabled = disabledReason !== undefined;

                        return (
                            <button
                                key={action.id}
                                type="button"
                                role="menuitem"
                                disabled={isDisabled}
                                onClick={() => onAction(action.id)}
                                title={isDisabled ? disabledReason : undefined}
                                className={`flex w-full items-center gap-2.5 px-3 py-2 text-[13px] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed
                                    ${action.section === "destructive"
                                        ? "text-twilight-text-muted/60 hover:text-red-400 hover:bg-red-500/10"
                                        : "text-twilight-text-soft hover:bg-white/[0.06]"
                                    }`}
                            >
                                {action.icon && (
                                    <span className="shrink-0 opacity-70 w-4 h-4 flex items-center justify-center">
                                        {action.icon}
                                    </span>
                                )}
                                <span className="flex-1 text-left">{action.label}</span>
                                {action.shortcut && (
                                    <kbd className="text-[10px] opacity-40 font-mono tracking-wider">{action.shortcut}</kbd>
                                )}
                            </button>
                        );
                    })}
                </div>
            ))}
        </>
    );
}
