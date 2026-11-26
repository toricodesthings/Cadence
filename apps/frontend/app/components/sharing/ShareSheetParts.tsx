import type { ReactNode } from "react";
import { Ellipsis, Link2Off, RotateCcw, UserMinus, Users } from "lucide-react";
import type { ListPerson } from "@cadence/contracts/sharing";
import * as Dialog from "../primitives/Dialog";
import * as DropdownMenu from "../primitives/DropdownMenu";
import { Button } from "../primitives/Button";
import { ConfirmDanger } from "../shared/ConfirmDanger";
import { UtilitySheet } from "../shared/UtilitySheet";
import { useShellMode } from "../../hooks/ui/use-shell-mode";
import { AvatarFace } from "./PersonAvatar";

export function ShareSheetShell({
    title,
    description,
    open,
    onOpenChange,
    children,
}: {
    title: string;
    description: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    children: (opts: { onClose: () => void; withDone: boolean }) => ReactNode;
}) {
    const { isPhone, isTouch } = useShellMode();
    const close = () => onOpenChange(false);

    if (isPhone && isTouch) {
        return (
            <UtilitySheet title={title} open={open} onClose={close} fit>
                {children({ onClose: close, withDone: false })}
            </UtilitySheet>
        );
    }

    return (
        <Dialog.Dialog open={open} onOpenChange={onOpenChange}>
            <Dialog.DialogContent className="sm:max-w-md">
                <Dialog.DialogHeader>
                    <Dialog.DialogTitle className="flex items-center gap-2">
                        <Users size={18} aria-hidden="true" className="shrink-0" />
                        <span>{title}</span>
                    </Dialog.DialogTitle>
                    <Dialog.DialogDescription className="sr-only">{description}</Dialog.DialogDescription>
                </Dialog.DialogHeader>
                {children({ onClose: close, withDone: true })}
            </Dialog.DialogContent>
        </Dialog.Dialog>
    );
}

export function SharePersonRow({
    person,
    isYou,
    canRemove,
    onRemove,
    avatarSize = 24,
    showPronouns = false,
    extra,
}: {
    person: ListPerson;
    isYou: boolean;
    canRemove: boolean;
    onRemove: () => void;
    avatarSize?: 24 | 32;
    showPronouns?: boolean;
    extra?: ReactNode;
}) {
    const name = person.name ?? "Cadence user";
    return (
        <li className="flex min-h-12 items-center gap-3 rounded-2xl px-2.5 py-1.5">
            <AvatarFace person={person} size={avatarSize} />
            <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-twilight-text">
                    {name}
                    {isYou ? <span className="font-normal text-twilight-text-soft"> (you)</span> : null}
                </p>
                {showPronouns && person.pronouns ? (
                    <p className="truncate text-xs text-twilight-text-soft">{person.pronouns}</p>
                ) : null}
            </div>
            {extra}
            {canRemove ? (
                <DropdownMenu.Root>
                    <DropdownMenu.Trigger asChild>
                        <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`Options for ${name}`}
                            className="size-8 shrink-0 p-0 text-twilight-text-soft"
                        >
                            <Ellipsis size={15} aria-hidden="true" />
                        </Button>
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Content align="end">
                        <DropdownMenu.Item variant="danger" onSelect={onRemove}>
                            <UserMinus size={14} aria-hidden="true" />
                            Stop sharing with {name}
                        </DropdownMenu.Item>
                    </DropdownMenu.Content>
                </DropdownMenu.Root>
            ) : null}
        </li>
    );
}

export function ShareSheetFooter({
    showOwnerActions,
    stopTitle,
    stopDescription,
    onStopSharing,
    resetLabel,
    resetPending,
    onResetLinks,
    extraMenuItems,
    withDone,
    onClose,
}: {
    showOwnerActions: boolean;
    stopTitle: string;
    stopDescription: string;
    onStopSharing: () => void;
    resetLabel: string;
    resetPending: boolean;
    onResetLinks: () => void;
    extraMenuItems?: ReactNode;
    withDone: boolean;
    onClose: () => void;
}) {
    return (
        <div className="flex flex-wrap items-center gap-1 border-t border-twilight-border/60 pt-3">
            {showOwnerActions ? (
                <>
                    <ConfirmDanger
                        trigger={
                            <Button variant="ghost" size="sm">
                                <Link2Off size={14} aria-hidden="true" />
                                Stop sharing
                            </Button>
                        }
                        title={stopTitle}
                        description={stopDescription}
                        confirmLabel="Stop sharing"
                        onConfirm={() => {
                            onStopSharing();
                            onClose();
                        }}
                    />
                    <DropdownMenu.Root>
                        <DropdownMenu.Trigger asChild>
                            <Button
                                variant="ghost"
                                size="sm"
                                aria-label="More sharing options"
                                className="size-9 p-0 text-twilight-text-soft"
                            >
                                <Ellipsis size={16} aria-hidden="true" />
                            </Button>
                        </DropdownMenu.Trigger>
                        <DropdownMenu.Content align="start">
                            {extraMenuItems}
                            <DropdownMenu.Item disabled={resetPending} onSelect={onResetLinks}>
                                <RotateCcw size={14} aria-hidden="true" />
                                {resetLabel}
                            </DropdownMenu.Item>
                        </DropdownMenu.Content>
                    </DropdownMenu.Root>
                </>
            ) : null}
            {withDone ? (
                <Button variant="primary" size="md" className="ml-auto min-w-24" onClick={onClose}>
                    Done
                </Button>
            ) : null}
        </div>
    );
}
