import { useEffect, useRef, useState, type ReactNode, type Ref } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
    Check,
    ChevronDown,
    Copy,
    Crown,
    Eye,
    Link2Off,
    LinkIcon,
    LogOut,
    Pencil,
    RotateCcw,
    UserMinus,
    Users,
} from "lucide-react";
import type { Project } from "@cadence/contracts/project";
import type { ListPerson, ShareRole } from "@cadence/contracts/sharing";
import * as Dialog from "../primitives/Dialog";
import * as DropdownMenu from "../primitives/DropdownMenu";
import { Button } from "../primitives/Button";
import { ConfirmDanger } from "../shared/ConfirmDanger";
import { UtilitySheet } from "../shared/UtilitySheet";
import { useShellMode } from "../../hooks/ui/use-shell-mode";
import { useAuthState } from "../../hooks/auth/use-auth-state";
import { useListPeople } from "../../hooks/sharing/use-list-people";
import {
    useCreateInvite,
    useLeaveList,
    useRemoveMember,
    useResetInvites,
    useSetMemberRole,
    useStopSharing,
    useTransferList,
} from "../../hooks/sharing/use-share-list";
import { toastName } from "../../lib/utils/undo-toast";
import { SPRINGS } from "../../lib/constants/motion";
import { AvatarFace } from "./PersonAvatar";
import { ROLE_ICON, ROLE_LABEL, tagOf } from "./ProfileCard";

const ROLES: { role: ShareRole; label: string; icon: typeof Eye }[] = [
    { role: "view", label: ROLE_LABEL.view, icon: Eye },
    { role: "edit", label: ROLE_LABEL.edit, icon: Pencil },
];

/** Choose view or edit: the same quiet control for a person and for the link. `children` adds items below the roles. */
function RolePicker({
    role,
    onChange,
    label,
    triggerRef,
    children,
}: {
    role: ShareRole;
    onChange: (role: ShareRole) => void;
    label: string;
    triggerRef?: Ref<HTMLButtonElement>;
    children?: ReactNode;
}) {
    const Icon = ROLE_ICON[role];
    return (
        <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
                <Button
                    ref={triggerRef}
                    variant="ghost"
                    size="sm"
                    className="shrink-0 gap-1.5 text-twilight-text-soft"
                    aria-label={`${label}: ${ROLE_LABEL[role]}`}
                >
                    <Icon size={13} aria-hidden="true" />
                    {ROLE_LABEL[role]}
                    <ChevronDown size={12} aria-hidden="true" className="opacity-70" />
                </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Content align="end">
                {ROLES.map((item) => (
                    <DropdownMenu.CheckItem
                        key={item.role}
                        icon={item.icon}
                        label={item.label}
                        checked={role === item.role}
                        onSelect={() => onChange(item.role)}
                    />
                ))}
                {children}
            </DropdownMenu.Content>
        </DropdownMenu.Root>
    );
}

/** Copy link, which turns into ✓ Copied for a moment once the link is on the clipboard. */
function CopyLinkButton({ onCopy, pending }: { onCopy: (done: () => void) => void; pending: boolean }) {
    const [copied, setCopied] = useState(false);
    useEffect(() => {
        if (!copied) return;
        const timer = window.setTimeout(() => setCopied(false), 1800);
        return () => window.clearTimeout(timer);
    }, [copied]);
    return (
        <>
            <Button
                variant="secondary"
                size="md"
                className="w-full rounded-2xl"
                disabled={pending}
                onClick={() => onCopy(() => setCopied(true))}
            >
                <AnimatePresence mode="popLayout" initial={false}>
                    <motion.span
                        key={copied ? "copied" : "copy"}
                        initial={{ opacity: 0, scale: 0.85, filter: "blur(4px)" }}
                        animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                        exit={{ opacity: 0, scale: 0.85, filter: "blur(4px)" }}
                        transition={SPRINGS.SNAP}
                        className={`inline-flex items-center gap-2 ${copied ? "text-feedback-success" : ""}`}
                    >
                        {copied ? (
                            <Check size={15} strokeWidth={2.5} aria-hidden="true" />
                        ) : (
                            <Copy size={15} aria-hidden="true" />
                        )}
                        {copied ? "Copied" : "Copy link"}
                    </motion.span>
                </AnimatePresence>
            </Button>
            <span className="sr-only" role="status">
                {copied ? "Link copied. It works for 7 days." : ""}
            </span>
        </>
    );
}

/** What the owner may do to one person: choose what they can do, hand ownership over, or remove them. */
function RoleMenu({ project, person }: { project: Project; person: ListPerson }) {
    const setRole = useSetMemberRole();
    const remove = useRemoveMember();
    const transfer = useTransferList();
    const [confirmRemove, setConfirmRemove] = useState(false);
    const [confirmTransfer, setConfirmTransfer] = useState(false);
    const roleButton = useRef<HTMLButtonElement>(null);
    const name = person.name ?? "this person";
    return (
        <>
            <RolePicker
                role={person.role as ShareRole}
                onChange={(role) => setRole.mutate({ listId: project.id, userId: person.userId, role })}
                label={`What ${name} can do`}
                triggerRef={roleButton}
            >
                <DropdownMenu.Separator />
                <DropdownMenu.Item onSelect={() => setConfirmTransfer(true)}>
                    <Crown size={14} aria-hidden="true" />
                    Make owner
                </DropdownMenu.Item>
                <DropdownMenu.Item variant="danger" onSelect={() => setConfirmRemove(true)}>
                    <UserMinus size={14} aria-hidden="true" />
                    Remove access
                </DropdownMenu.Item>
            </RolePicker>
            <ConfirmDanger
                trigger={null}
                open={confirmTransfer}
                onOpenChange={(open) => {
                    setConfirmTransfer(open);
                    if (!open) requestAnimationFrame(() => roleButton.current?.focus());
                }}
                title={`Make ${name} the owner?`}
                description={`${name} will own ${project.name}. You'll stay in it and can still edit. You can't undo this; only ${name} can give it back.`}
                confirmLabel="Make owner"
                onConfirm={() => transfer.mutate({ listId: project.id, userId: person.userId, name })}
            />
            <ConfirmDanger
                trigger={null}
                open={confirmRemove}
                onOpenChange={(open) => {
                    setConfirmRemove(open);
                    // The confirm has no trigger of its own: on Cancel, focus goes back to the menu that opened it.
                    if (!open) requestAnimationFrame(() => roleButton.current?.focus());
                }}
                title={`Remove ${name}?`}
                description="They lose this list at once. They can only come back with a new link."
                confirmLabel="Remove"
                onConfirm={() => remove.mutate({ listId: project.id, userId: person.userId })}
            />
        </>
    );
}

/** A role nobody here can change: the owner's, or yours in someone else's list (in the accent, since it's what you can do). */
function RolePill({ role, mine }: { role: ListPerson["role"]; mine: boolean }) {
    const Icon = ROLE_ICON[role];
    return (
        <span
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${
                mine ? "bg-accent-primary/10 font-medium text-accent-primary" : "text-twilight-text-soft"
            }`}
        >
            <Icon size={12} aria-hidden="true" />
            {ROLE_LABEL[role]}
        </span>
    );
}

function PersonRow({ project, person, isYou }: { project: Project; person: ListPerson; isYou: boolean }) {
    const controls = project.access === "owner" && person.role !== "owner";
    const detail = [tagOf(person.userId), person.pronouns].filter(Boolean).join(" · ");
    return (
        <li className="flex min-h-14 items-center gap-3 rounded-2xl px-2.5 py-2">
            <AvatarFace person={person} size={32} />
            <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-twilight-text">
                    {person.name ?? "Cadence user"}
                    {isYou && <span className="font-normal text-twilight-text-soft"> (you)</span>}
                </p>
                <p className="truncate text-xs text-twilight-text-soft">{detail}</p>
            </div>
            {controls ? (
                <RoleMenu project={project} person={person} />
            ) : (
                <RolePill role={person.role} mine={isYou && person.role !== "owner"} />
            )}
        </li>
    );
}

/**
 * The body of the share surface: the people in one soft group, then (owner) the link with its Copy, then the quiet
 * way out and Done. `withDone` is off in the phone sheet, whose ✓ already closes it.
 */
export function ShareListPanel({
    project,
    onClose,
    withDone = true,
}: {
    project: Project;
    onClose: () => void;
    withDone?: boolean;
}) {
    const owner = project.access === "owner";
    const shared = (project.members?.length ?? 0) > 0;
    const { session } = useAuthState();
    const me = session?.user;
    const { data: fetched } = useListPeople(project);
    const createInvite = useCreateInvite();
    // The link's role is chosen before copying; most links are for viewing.
    const [linkRole, setLinkRole] = useState<ShareRole>("view");
    const resetInvites = useResetInvites();
    const stopSharing = useStopSharing();
    const leave = useLeaveList();
    // Not shared yet: nobody to fetch, so the owner's own row comes from their session.
    const people: ListPerson[] | undefined =
        fetched ??
        (owner && !shared && me
            ? [{ userId: me.id, name: me.name ?? null, image: me.image ?? null, pronouns: null, role: "owner" }]
            : undefined);

    return (
        <div className="flex flex-col gap-4">
            {people ? (
                <ul
                    aria-label="People in this list"
                    className="flex flex-col gap-0.5 rounded-[22px] surface-item p-1.5"
                >
                    {people.map((person) => (
                        <PersonRow
                            key={person.userId}
                            project={project}
                            person={person}
                            isYou={person.userId === me?.id}
                        />
                    ))}
                </ul>
            ) : (
                <p className="py-2 text-sm text-twilight-text-soft" role="status">
                    Loading people…
                </p>
            )}

            {owner && (
                <div className="flex flex-col gap-1.5 rounded-[22px] surface-item p-1.5">
                    <div className="flex min-h-14 items-center gap-3 px-2.5 py-2">
                        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-primary/10 text-accent-primary">
                            <LinkIcon size={15} aria-hidden="true" />
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-twilight-text">Anyone with the link</p>
                            <p className="truncate text-xs text-twilight-text-soft">Links last 7 days</p>
                        </div>
                        <RolePicker role={linkRole} onChange={setLinkRole} label="What people with the link can do" />
                    </div>
                    <CopyLinkButton
                        pending={createInvite.isPending}
                        onCopy={(done) =>
                            createInvite.mutate(
                                { listId: project.id, role: linkRole },
                                { onSuccess: ({ copied }) => copied && done() },
                            )
                        }
                    />
                </div>
            )}

            <div className="flex flex-wrap items-center gap-1 border-t border-twilight-border/60 pt-3">
                {owner ? (
                    shared && (
                        <>
                            <Button
                                variant="ghost"
                                size="sm"
                                disabled={resetInvites.isPending}
                                onClick={() => resetInvites.mutate(project.id)}
                            >
                                <RotateCcw size={14} aria-hidden="true" />
                                Reset links
                            </Button>
                            <ConfirmDanger
                                trigger={
                                    <Button variant="ghost" size="sm">
                                        <Link2Off size={14} aria-hidden="true" />
                                        Stop sharing
                                    </Button>
                                }
                                title="Stop sharing this list?"
                                description="Everyone is removed and every link stops working. The list and its tasks stay yours."
                                confirmLabel="Stop sharing"
                                onConfirm={() => {
                                    stopSharing.mutate({ listId: project.id });
                                    onClose();
                                }}
                            />
                        </>
                    )
                ) : (
                    <ConfirmDanger
                        trigger={
                            <Button variant="ghost" size="sm">
                                <LogOut size={14} aria-hidden="true" />
                                Leave list
                            </Button>
                        }
                        title={`Leave ${toastName(project.name)}?`}
                        description="You lose this list and its tasks. You can only come back with a new link."
                        confirmLabel="Leave list"
                        onConfirm={() => {
                            leave.mutate({ listId: project.id, name: project.name });
                            onClose();
                        }}
                    />
                )}
                {withDone && (
                    <Button variant="primary" size="md" className="ml-auto min-w-24" onClick={onClose}>
                        Done
                    </Button>
                )}
            </div>
        </div>
    );
}

/** Share a list you own, or see who is in one you were let into. A dialog with a mouse, a sheet on a touch phone. */
export function ShareListDialog({
    project,
    open,
    onOpenChange,
}: {
    project: Project;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const { isPhone, isTouch } = useShellMode();
    const title = project.access === "owner" ? `Share “${project.name}”` : project.name;
    const close = () => onOpenChange(false);

    if (isPhone && isTouch)
        return (
            <UtilitySheet title={title} open={open} onClose={close} fit>
                <ShareListPanel project={project} onClose={close} withDone={false} />
            </UtilitySheet>
        );
    return (
        <Dialog.Dialog open={open} onOpenChange={onOpenChange}>
            <Dialog.DialogContent className="sm:max-w-md">
                <Dialog.DialogHeader>
                    <Dialog.DialogTitle className="flex items-center gap-2">
                        <Users size={18} aria-hidden="true" className="shrink-0" />
                        <span className="truncate">{title}</span>
                    </Dialog.DialogTitle>
                    <Dialog.DialogDescription className="sr-only">
                        The people in this list, and what they can do.
                    </Dialog.DialogDescription>
                </Dialog.DialogHeader>
                <ShareListPanel project={project} onClose={close} />
            </Dialog.DialogContent>
        </Dialog.Dialog>
    );
}
