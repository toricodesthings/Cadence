import type { ReactNode } from "react";
import { CalendarHeart, Eye, Flame, FolderOpen, Pencil, UsersRound, type LucideIcon } from "lucide-react";
import type { ListPerson, ListRole } from "@cadence/contracts/sharing";
import { usePersonalEvents } from "../../hooks/calendar/use-personal-events";
import { useAllHabits } from "../../hooks/habits/use-habits";
import { useProjects } from "../../hooks/projects/use-projects";
import { isSharedRoutine } from "../../hooks/sharing/use-share-routine";
import { today as todayDay } from "../../lib/utils/user-zone";
import { RoutineMark } from "../habits/RoutineMark";
import { isSharedList } from "../../hooks/sharing/use-list-access";
import { useListOnlineIds } from "../../hooks/sharing/use-list-presence";
import { ProfileBanner } from "../shared/ProfileBanner";
import { AvatarFace } from "./PersonAvatar";
import { roleRing } from "./ShareHeader";

export const ROLE_LABEL: Record<ListRole, string> = { owner: "Owner", edit: "Can edit", view: "Can view" };
export const ROLE_ICON = { owner: UsersRound, edit: Pencil, view: Eye } as const;

export const tagOf = (userId: string) => `#${userId.slice(0, 4)}`;

type InCommon = { id: string; name: string; mark: ReactNode };

function InCommonGroup({ icon: Icon, label, items }: { icon: LucideIcon; label: string; items: InCommon[] }) {
    if (items.length === 0) return null;
    const shown = items.slice(0, 4);
    return (
        <li className="flex items-start gap-2.5">
            <span className="grid size-7 shrink-0 place-items-center rounded-lg surface-control text-twilight-text-soft">
                <Icon size={14} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-twilight-text-soft">
                    {label} <span className="tabular-nums text-twilight-text-muted">· {items.length}</span>
                </p>
                <ul className="mt-1 flex flex-wrap gap-1.5" aria-label={label}>
                    {shown.map((item) => (
                        <li
                            key={item.id}
                            className="inline-flex max-w-full items-center gap-1 rounded-full surface-control px-2.5 py-0.5 text-xs text-twilight-text"
                        >
                            <span aria-hidden="true" className="inline-flex shrink-0 text-twilight-text-soft">
                                {item.mark}
                            </span>
                            <span className="truncate">{item.name}</span>
                        </li>
                    ))}
                    {items.length > shown.length ? (
                        <li className="inline-flex items-center px-1 text-xs text-twilight-text-muted">
                            +{items.length - shown.length}
                        </li>
                    ) : null}
                </ul>
            </div>
        </li>
    );
}

function useInCommon(userId: string, skip: boolean) {
    const { data: projects = [] } = useProjects();
    const { items: events } = usePersonalEvents(Number(todayDay().slice(0, 4)));
    const { data: habits = [] } = useAllHabits();
    if (skip) return { lists: [], events: [], routines: [] };
    const lists = projects
        .filter((p) => isSharedList(p) && (p.userId === userId || (p.members ?? []).some((m) => m.userId === userId)))
        .map((p) => ({
            id: p.id,
            name: p.name,
            mark: p.emoji || <FolderOpen size={11} />,
        }));
    const sharedEvents = events
        .filter((e) => (e.members ?? []).some((m) => m.userId === userId || m.invitedBy === userId))
        .map((e) => ({ id: e.id, name: e.label, mark: e.emoji || <CalendarHeart size={11} /> }));
    const routines = habits
        .filter(
            (h) => isSharedRoutine(h) && (h.userId === userId || (h.members ?? []).some((m) => m.userId === userId)),
        )
        .map((h) => ({ id: h.id, name: h.title, mark: <RoutineMark emoji={h.emoji} size={11} /> }));
    return { lists, events: sharedEvents, routines };
}

export function ProfileCard({
    person,
    userId,
    projectId,
    online,
    former = false,
    showRole = true,
}: {
    person: ListPerson | undefined;
    userId: string;
    projectId?: string;
    online?: boolean;
    former?: boolean;
    showRole?: boolean;
}) {
    const RoleIcon = person ? ROLE_ICON[person.role] : null;
    const onlineIds = useListOnlineIds(projectId);
    const isOnline = !former && (online ?? onlineIds.has(userId));
    const inCommon = useInCommon(userId, former);
    const anyInCommon = inCommon.lists.length + inCommon.events.length + inCommon.routines.length > 0;
    const showRoleChip = showRole && person && RoleIcon;

    return (
        <div className="profile-card-bg">
            <ProfileBanner className="h-16">
                <div className="absolute -bottom-8 left-4 rounded-full border-4 border-twilight-surface bg-twilight-base">
                    <AvatarFace person={person} size={32} className={`!size-14 !text-lg ${roleRing(person?.role)}`} />
                    {isOnline && (
                        <span
                            aria-hidden="true"
                            className="absolute bottom-0 right-0 size-3.5 rounded-full bg-feedback-success ring-2 ring-twilight-surface"
                        />
                    )}
                </div>
            </ProfileBanner>
            <div className="flex flex-col px-4 pb-4 pt-10">
                <p className="flex flex-wrap items-baseline gap-x-2 font-display text-lg font-semibold text-twilight-text">
                    <span className="break-words">{former ? "A former member" : (person?.name ?? "Cadence user")}</span>
                    {!former && <span className="text-sm font-normal text-twilight-text-soft">{tagOf(userId)}</span>}
                </p>
                {person?.pronouns ? <p className="text-sm text-twilight-text-soft">{person.pronouns}</p> : null}
                {showRoleChip || isOnline ? (
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                        {showRoleChip ? (
                            <span
                                className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${person.role === "view" ? "surface-control text-twilight-text-soft" : "border border-accent-primary/35 bg-accent-primary/10 font-medium text-accent-primary"}`}
                            >
                                <RoleIcon size={12} aria-hidden="true" />
                                {ROLE_LABEL[person.role]}
                            </span>
                        ) : null}
                        {isOnline ? (
                            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-feedback-success/15 px-2.5 py-1 text-xs font-medium text-feedback-success">
                                <span aria-hidden="true" className="size-1.5 rounded-full bg-feedback-success" />
                                Here now
                            </span>
                        ) : null}
                    </div>
                ) : null}
                {anyInCommon ? (
                    <section className="mt-3.5 border-t border-twilight-border/60 pt-3" aria-label="Shared between you">
                        <h3 className="mb-2.5 text-[11px] font-semibold text-twilight-text">Shared between you</h3>
                        <ul className="flex flex-col gap-3">
                            <InCommonGroup icon={FolderOpen} label="Lists" items={inCommon.lists} />
                            <InCommonGroup icon={CalendarHeart} label="Events" items={inCommon.events} />
                            <InCommonGroup icon={Flame} label="Routines" items={inCommon.routines} />
                        </ul>
                    </section>
                ) : null}
            </div>
        </div>
    );
}
