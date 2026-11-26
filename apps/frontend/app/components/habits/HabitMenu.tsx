import type React from "react";
import { useState } from "react";
import * as DropdownMenu from "../primitives/DropdownMenu";
import * as ContextMenu from "../primitives/ContextMenu";
import type { GenericMenu } from "../primitives/menu-styles";
import { EllipsisVertical, LogOut, Pencil, Trash2, Archive, ArchiveRestore, Pause, Play, Users } from "lucide-react";
import { useRoutineActions } from "../../hooks/habits/use-routine-actions";
import { isSharedRoutine, useLeaveRoutine, useRoutinePeople } from "../../hooks/sharing/use-share-routine";
import { trackUsageEvent } from "../../lib/api/track-event";
import { useShellMode } from "../../hooks/ui/use-shell-mode";
import { ShareRoutineSheet } from "../sharing/ShareRoutineSheet";
import { ConfirmDanger } from "../shared/ConfirmDanger";
import type { Habit } from "@cadence/contracts/habit";

function HabitMenuShell({
    habit,
    children,
}: {
    habit: Habit;
    children: (opts: {
        actions: ReturnType<typeof useRoutineActions>;
        onShare: () => void;
        onRequestDelete: () => void;
    }) => React.ReactNode;
}) {
    const actions = useRoutineActions(habit);
    const [shareOpen, setShareOpen] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const onRequestDelete = () => ((habit.members?.length ?? 0) > 0 ? setConfirmDelete(true) : actions.requestDelete());
    return (
        <>
            {children({ actions, onShare: () => setShareOpen(true), onRequestDelete })}
            <ShareRoutineSheet habit={habit} open={shareOpen} onOpenChange={setShareOpen} />
            <ConfirmDanger
                trigger={null}
                open={confirmDelete}
                onOpenChange={setConfirmDelete}
                title="Delete for everyone?"
                description="Everyone it's shared with won't see it anymore either."
                confirmLabel="Delete"
                onConfirm={() => {
                    actions.requestDelete();
                    setConfirmDelete(false);
                }}
            />
        </>
    );
}

export function HabitMenu({ habit, onEdit }: { habit: Habit; onEdit: () => void }) {
    return (
        <HabitMenuShell habit={habit}>
            {({ actions, onShare, onRequestDelete }) => (
                <DropdownMenu.Root>
                    <DropdownMenu.Trigger asChild>
                        <button
                            type="button"
                            className="btn-icon shrink-0 cursor-pointer text-twilight-text-muted opacity-0 transition-[opacity,color,background-color] group-hover:opacity-100 touch-reveal hover:bg-white/[0.06] hover:text-twilight-text focus-visible:opacity-100"
                            aria-label={`Actions for ${habit.title}`}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <EllipsisVertical size={15} aria-hidden="true" />
                        </button>
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Content align="end">
                        <HabitMenuItems
                            habit={habit}
                            actions={actions}
                            Menu={DropdownMenu}
                            onEdit={onEdit}
                            onShare={onShare}
                            onRequestDelete={onRequestDelete}
                        />
                    </DropdownMenu.Content>
                </DropdownMenu.Root>
            )}
        </HabitMenuShell>
    );
}

export function HabitContextMenu({
    habit,
    onEdit,
    children,
}: {
    habit: Habit;
    onEdit: () => void;
    children: React.ReactNode;
}) {
    const { isTouch } = useShellMode();
    if (isTouch) return <>{children}</>;
    return (
        <HabitMenuShell habit={habit}>
            {({ actions, onShare, onRequestDelete }) => (
                <ContextMenu.Root
                    onOpenChange={(isOpen) => {
                        if (isOpen)
                            trackUsageEvent("habit.context_menu_opened", {
                                object_type: "habit",
                                input_method: "context_menu",
                            });
                    }}
                >
                    <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
                    <ContextMenu.Content>
                        <HabitMenuItems
                            habit={habit}
                            actions={actions}
                            Menu={ContextMenu}
                            onEdit={onEdit}
                            onShare={onShare}
                            onRequestDelete={onRequestDelete}
                        />
                    </ContextMenu.Content>
                </ContextMenu.Root>
            )}
        </HabitMenuShell>
    );
}

const ITEM = "text-[13px]";

function HabitMenuItems({
    habit,
    actions,
    Menu,
    onEdit,
    onShare,
    onRequestDelete,
}: {
    habit: Habit;
    actions: ReturnType<typeof useRoutineActions>;
    Menu: GenericMenu;
    onEdit: () => void;
    onShare: () => void;
    onRequestDelete: () => void;
}) {
    const access = habit.access ?? "owner";
    const isOwner = access === "owner";
    const isSupporter = access === "view";
    const shared = isSharedRoutine(habit);
    const { data: people } = useRoutinePeople(shared ? habit : undefined);
    const leave = useLeaveRoutine();

    if (isSupporter) {
        return (
            <Menu.Item
                className={`${ITEM} text-feedback-error focus:bg-feedback-error/10 focus:text-feedback-error`}
                onSelect={() => leave.mutate({ habitId: habit.id, title: habit.title, cheering: true })}
            >
                <LogOut size={12} aria-hidden="true" />
                Stop cheering
            </Menu.Item>
        );
    }

    const memberCount = habit.members?.length ?? 0;
    const firstMember = people?.find((p) => p.role !== "owner");
    const shareLabel =
        memberCount === 0
            ? "Share…"
            : memberCount === 1
              ? `Shared with ${firstMember?.name ?? "1 person"}`
              : `Shared with ${memberCount} people`;

    return (
        <>
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
            {isOwner ? (
                <>
                    <Menu.Separator />
                    <Menu.Item className={ITEM} onSelect={onShare}>
                        <Users size={12} aria-hidden="true" />
                        {shareLabel}
                    </Menu.Item>
                    <Menu.Item className={ITEM} onSelect={actions.toggleArchive}>
                        {habit.archived ? (
                            <ArchiveRestore size={12} aria-hidden="true" />
                        ) : (
                            <Archive size={12} aria-hidden="true" />
                        )}
                        {habit.archived ? "Restore routine" : "Archive routine"}
                    </Menu.Item>
                    <Menu.Separator />
                    <Menu.Item
                        className={`${ITEM} text-feedback-error focus:bg-feedback-error/10 focus:text-feedback-error`}
                        onSelect={onRequestDelete}
                    >
                        <Trash2 size={12} aria-hidden="true" />
                        Delete routine
                    </Menu.Item>
                </>
            ) : (
                <>
                    <Menu.Separator />
                    <Menu.Item
                        className={`${ITEM} text-feedback-error focus:bg-feedback-error/10 focus:text-feedback-error`}
                        onSelect={() => leave.mutate({ habitId: habit.id, title: habit.title })}
                    >
                        <LogOut size={12} aria-hidden="true" />
                        Remove from my routines
                    </Menu.Item>
                </>
            )}
        </>
    );
}
