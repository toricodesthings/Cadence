import { useState } from "react";
import { ArrowDown, ArrowUp, HandHeart, Repeat2, Users } from "lucide-react";
import type { Habit, RoutineShareMode } from "@cadence/contracts/habit";
import type { ListPerson, RoutineShareWay } from "@cadence/contracts/sharing";
import * as DropdownMenu from "../primitives/DropdownMenu";
import { Button } from "../primitives/Button";
import { ConfirmDanger } from "../shared/ConfirmDanger";
import { useAuthState } from "../../hooks/auth/use-auth-state";
import {
    useCreateRoutineLink,
    useRemoveFromRoutine,
    useResetRoutineLinks,
    useRoutinePeople,
    useSetRoutineMode,
    useSetTurnOrder,
    useStopSharingRoutine,
} from "../../hooks/sharing/use-share-routine";
import { CopyLinkButton } from "./ShareListDialog";
import { SharePersonRow, ShareSheetFooter, ShareSheetShell } from "./ShareSheetParts";
import { RoutineMark } from "../habits/RoutineMark";

const WAYS: { way: RoutineShareWay; label: string; description: string; icon: typeof Users }[] = [
    {
        way: "together",
        label: "Do it together",
        description: "You each check off your own days.",
        icon: Users,
    },
    {
        way: "turns",
        label: "Take turns",
        description: "One person's turn each time. Anyone can cover.",
        icon: Repeat2,
    },
    {
        way: "cheering",
        label: "Cheer me on",
        description: "They see the days you do it. Never the ones you don't.",
        icon: HandHeart,
    },
];

function ShareRoutineBody({
    habit,
    onClose,
    withDone = true,
}: {
    habit: Habit;
    onClose: () => void;
    withDone?: boolean;
}) {
    const { session } = useAuthState();
    const me = session?.user;
    const isOwner = (habit.access ?? "owner") === "owner";
    const shared = (habit.members?.length ?? 0) > 0;
    const { data: people } = useRoutinePeople(habit);
    const createLink = useCreateRoutineLink();
    const resetLinks = useResetRoutineLinks();
    const setMode = useSetRoutineMode();
    const setTurnOrder = useSetTurnOrder();
    const removePerson = useRemoveFromRoutine();
    const stopSharing = useStopSharingRoutine();

    const defaultWay: RoutineShareWay = habit.shareMode === "turns" ? "turns" : "together";
    const [selectedWay, setSelectedWay] = useState<RoutineShareWay>(defaultWay);
    const [confirmSwitch, setConfirmSwitch] = useState<RoutineShareMode | null>(null);

    const participants = (people ?? []).filter((p) => p.role === "owner" || p.role === "edit");
    const supporters = (people ?? []).filter((p) => p.role === "view");

    const orderedParticipants: ListPerson[] = (() => {
        if (habit.shareMode !== "turns" || !habit.turnOrder?.length) return participants;
        const byId = new Map(participants.map((p) => [p.userId, p]));
        const ordered = habit.turnOrder.map((id) => byId.get(id)).filter((p): p is ListPerson => Boolean(p));
        const seen = new Set(ordered.map((p) => p.userId));
        for (const p of participants) if (!seen.has(p.userId)) ordered.push(p);
        return ordered;
    })();

    const moveTurn = (index: number, delta: -1 | 1) => {
        const nextIdx = index + delta;
        if (nextIdx < 0 || nextIdx >= orderedParticipants.length) return;
        const next = [...orderedParticipants];
        [next[index], next[nextIdx]] = [next[nextIdx], next[index]];
        setTurnOrder.mutate({ habitId: habit.id, order: next.map((p) => p.userId) });
    };

    const nextPerson = (() => {
        if (habit.shareMode !== "turns" || orderedParticipants.length < 2) return null;
        const currentIdx = habit.today?.turn ? orderedParticipants.findIndex((p) => p.userId === habit.today?.turn) : 0;
        const nextIdx = ((currentIdx >= 0 ? currentIdx : 0) + 1) % orderedParticipants.length;
        return orderedParticipants[nextIdx]?.name ?? "someone";
    })();
    const otherMode: RoutineShareMode | null =
        habit.shareMode === "together" ? "turns" : habit.shareMode === "turns" ? "together" : null;

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 px-1">
                <RoutineMark emoji={habit.emoji} size={20} />
                <p className="min-w-0 truncate text-base font-semibold text-twilight-text">{habit.title}</p>
            </div>
            {isOwner ? (
                <div className="flex flex-col gap-2">
                    <div
                        className="flex flex-col gap-1 rounded-[22px] surface-item p-1.5"
                        role="radiogroup"
                        aria-label="How to share"
                    >
                        {WAYS.map(({ way, label, description, icon: Icon }) => {
                            const clashed =
                                (way === "together" && habit.shareMode === "turns") ||
                                (way === "turns" && habit.shareMode === "together");
                            const active = selectedWay === way && !clashed;
                            return (
                                <button
                                    key={way}
                                    type="button"
                                    role="radio"
                                    aria-checked={active}
                                    disabled={clashed}
                                    onClick={() => setSelectedWay(way)}
                                    className={`flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 py-2 text-left transition-colors ${
                                        clashed
                                            ? "cursor-not-allowed opacity-45"
                                            : active
                                              ? "cursor-pointer bg-accent-primary/12 text-twilight-text"
                                              : "cursor-pointer hover:bg-accent-primary/5 text-twilight-text"
                                    }`}
                                >
                                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-primary/10 text-accent-primary">
                                        <Icon size={15} aria-hidden="true" />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-sm font-medium">{label}</span>
                                        <span className="block text-xs text-twilight-text-soft">{description}</span>
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                    <CopyLinkButton
                        pending={createLink.isPending}
                        onCopy={(done) =>
                            createLink.mutate(
                                { habitId: habit.id, way: selectedWay },
                                { onSuccess: ({ copied }) => copied && done() },
                            )
                        }
                    />
                </div>
            ) : null}

            {orderedParticipants.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                    <p className="px-1 text-xs font-medium text-twilight-text-soft">Doing it</p>
                    <ul className="flex flex-col gap-0.5 rounded-[22px] surface-item p-1.5">
                        {orderedParticipants.map((person, index) => {
                            const name = person.name ?? "Cadence user";
                            const turnButtons =
                                isOwner && habit.shareMode === "turns" && orderedParticipants.length > 1 ? (
                                    <span className="flex items-center gap-0.5">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            disabled={index === 0 || setTurnOrder.isPending}
                                            aria-label={`Move ${name} earlier`}
                                            className="size-8 p-0"
                                            onClick={() => moveTurn(index, -1)}
                                        >
                                            <ArrowUp size={13} aria-hidden="true" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            disabled={
                                                index === orderedParticipants.length - 1 || setTurnOrder.isPending
                                            }
                                            aria-label={`Move ${name} later`}
                                            className="size-8 p-0"
                                            onClick={() => moveTurn(index, 1)}
                                        >
                                            <ArrowDown size={13} aria-hidden="true" />
                                        </Button>
                                    </span>
                                ) : null;
                            return (
                                <SharePersonRow
                                    key={person.userId}
                                    person={person}
                                    isYou={person.userId === me?.id}
                                    canRemove={isOwner && person.role !== "owner"}
                                    onRemove={() => removePerson.mutate({ habitId: habit.id, userId: person.userId })}
                                    extra={turnButtons}
                                />
                            );
                        })}
                    </ul>
                    {nextPerson ? <p className="px-1 text-xs text-twilight-text-soft">Next: {nextPerson}</p> : null}
                </div>
            ) : null}

            {supporters.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                    <p className="px-1 text-xs font-medium text-twilight-text-soft">Cheering</p>
                    <ul className="flex flex-col gap-0.5 rounded-[22px] surface-item p-1.5">
                        {supporters.map((person) => (
                            <SharePersonRow
                                key={person.userId}
                                person={person}
                                isYou={person.userId === me?.id}
                                canRemove={isOwner}
                                onRemove={() => removePerson.mutate({ habitId: habit.id, userId: person.userId })}
                            />
                        ))}
                    </ul>
                </div>
            ) : null}

            <ShareSheetFooter
                showOwnerActions={isOwner && (shared || Boolean(habit.shareMode))}
                stopTitle="Stop sharing this routine?"
                stopDescription="Everyone else loses it from their routines and old links stop working. Your routine and history stay yours."
                onStopSharing={() => stopSharing.mutate(habit.id)}
                resetLabel="Reset links"
                resetPending={resetLinks.isPending}
                onResetLinks={() => resetLinks.mutate(habit.id)}
                extraMenuItems={
                    otherMode ? (
                        <DropdownMenu.Item onSelect={() => setConfirmSwitch(otherMode)}>
                            <Repeat2 size={14} aria-hidden="true" />
                            {otherMode === "turns" ? "Switch to taking turns" : "Switch to doing together"}
                        </DropdownMenu.Item>
                    ) : null
                }
                withDone={withDone}
                onClose={onClose}
            />

            <ConfirmDanger
                trigger={null}
                open={Boolean(confirmSwitch)}
                onOpenChange={(open) => !open && setConfirmSwitch(null)}
                title={confirmSwitch === "turns" ? "Switch to taking turns?" : "Switch to doing together?"}
                description="Everyone's checks so far stay theirs."
                confirmLabel="Switch"
                onConfirm={() => {
                    if (confirmSwitch) {
                        setMode.mutate({ habitId: habit.id, mode: confirmSwitch });
                        setSelectedWay(confirmSwitch);
                    }
                    setConfirmSwitch(null);
                }}
            />
        </div>
    );
}

export function ShareRoutineSheet({
    habit,
    open,
    onOpenChange,
}: {
    habit: Habit;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    return (
        <ShareSheetShell
            title="Share this routine"
            description="Choose how to share this routine and see who is in it."
            open={open}
            onOpenChange={onOpenChange}
        >
            {({ onClose, withDone }) => <ShareRoutineBody habit={habit} onClose={onClose} withDone={withDone} />}
        </ShareSheetShell>
    );
}
