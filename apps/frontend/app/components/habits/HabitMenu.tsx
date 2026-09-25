import type React from "react";
import * as DropdownMenu from "../primitives/DropdownMenu";
import * as ContextMenu from "../primitives/ContextMenu";
import type { GenericMenu } from "../primitives/menu-styles";
import { MoreHorizontal, Pencil, Trash2, Archive, ArchiveRestore, Pause, Play } from "lucide-react";
import { useRoutineActions } from "../../hooks/habits/use-routine-actions";
import { trackUsageEvent } from "../../lib/api/track-event";
import { useIsCoarsePointer } from "../../hooks/ui/use-coarse-pointer";
import type { Habit } from "@cadence/contracts/habit";

/** The ⋯ button on a routine row or card. */
export function HabitMenu({ habit, onEdit }: { habit: Habit; onEdit: () => void }) {
    const actions = useRoutineActions(habit);
    return (
        <>
            {actions.deleteDialog}
            <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                    <button
                        type="button"
                        className="btn-icon shrink-0 cursor-pointer text-twilight-text-muted opacity-0 transition-[opacity,color,background-color] group-hover:opacity-100 touch-reveal hover:bg-white/[0.06] hover:text-twilight-text focus-visible:opacity-100"
                        aria-label={`Actions for ${habit.title}`}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <MoreHorizontal size={15} aria-hidden="true" />
                    </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Content align="end">
                    <HabitMenuItems habit={habit} actions={actions} Menu={DropdownMenu} onEdit={onEdit} />
                </DropdownMenu.Content>
            </DropdownMenu.Root>
        </>
    );
}

/** Right-click on a routine row or card: the same items as the ⋯ menu. Desktop only: touch uses ⋯. */
export function HabitContextMenu({ habit, onEdit, children }: { habit: Habit; onEdit: () => void; children: React.ReactNode }) {
    const actions = useRoutineActions(habit);
    const coarse = useIsCoarsePointer();
    if (coarse) return <>{children}</>;
    return (
        <>
            {actions.deleteDialog}
            <ContextMenu.Root onOpenChange={(isOpen) => {
                if (isOpen) trackUsageEvent("habit.context_menu_opened", { object_type: "habit", input_method: "context_menu" });
            }}>
                <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
                <ContextMenu.Content>
                    <HabitMenuItems habit={habit} actions={actions} Menu={ContextMenu} onEdit={onEdit} />
                </ContextMenu.Content>
            </ContextMenu.Root>
        </>
    );
}

const ITEM = "flex items-center gap-2 text-[13px]";

function HabitMenuItems({ habit, actions, Menu, onEdit }: {
    habit: Habit;
    actions: ReturnType<typeof useRoutineActions>;
    Menu: GenericMenu;
    onEdit: () => void;
}) {
    return (
        <>
            {/* Recovery actions first */}
            {actions.isPaused ? (
                <Menu.Item className={ITEM} onSelect={actions.resume}>
                    <Play size={12} aria-hidden="true" />
                    Resume today
                </Menu.Item>
            ) : (
                <Menu.Item className={ITEM} onSelect={() => actions.pause()}>
                    <Pause size={12} aria-hidden="true" />
                    Pause for a week
                </Menu.Item>
            )}
            <Menu.Item className={ITEM} onSelect={onEdit}>
                <Pencil size={12} aria-hidden="true" />
                Edit routine
            </Menu.Item>
            <Menu.Separator />
            <Menu.Item className={ITEM} onSelect={actions.toggleArchive}>
                {habit.archived ? <ArchiveRestore size={12} aria-hidden="true" /> : <Archive size={12} aria-hidden="true" />}
                {habit.archived ? "Restore routine" : "Archive routine"}
            </Menu.Item>
            <Menu.Separator />
            <Menu.Item className={`${ITEM} text-feedback-error focus:bg-feedback-error/10 focus:text-feedback-error`} onSelect={actions.requestDelete}>
                <Trash2 size={12} aria-hidden="true" />
                Delete routine
            </Menu.Item>
        </>
    );
}
