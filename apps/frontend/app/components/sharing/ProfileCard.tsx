import { Eye, FolderOpen, Pencil, UsersRound } from "lucide-react";
import type { ListPerson, ListRole } from "@cadence/contracts/sharing";
import { useProjects } from "../../hooks/projects/use-projects";
import { isSharedList } from "../../hooks/sharing/use-list-access";
import { useListOnlineIds } from "../../hooks/sharing/use-list-presence";
import { ProfileBanner } from "../shared/ProfileBanner";
import { AvatarFace } from "./PersonAvatar";
import { roleRing } from "./ShareHeader";

export const ROLE_LABEL: Record<ListRole, string> = { owner: "Owner", edit: "Can edit", view: "Can view" };
export const ROLE_ICON = { owner: UsersRound, edit: Pencil, view: Eye } as const;

/** `#a1b2`: the first four characters of the account id, as on the profile page. */
export const tagOf = (userId: string) => `#${userId.slice(0, 4)}`;

/**
 * Who someone is, to the people they share a list with: picture, name, `#tag`, pronouns (left out when empty),
 * live online indicator, their role in this list, and shared lists in common. Email and birthday are never here.
 */
export function ProfileCard({
    person,
    userId,
    projectId,
    online,
    former = false,
}: {
    person: ListPerson | undefined;
    userId: string;
    projectId?: string;
    online?: boolean;
    former?: boolean;
}) {
    const RoleIcon = person ? ROLE_ICON[person.role] : null;
    const onlineIds = useListOnlineIds(projectId);
    const isOnline = !former && (online ?? onlineIds.has(userId));
    const { data: projects = [] } = useProjects();
    const sharedInCommon = former
        ? []
        : projects.filter(
              (project) =>
                  isSharedList(project) &&
                  (project.userId === userId || (project.members ?? []).some((member) => member.userId === userId)),
          );

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
            <div className="flex flex-col gap-1 px-4 pb-4 pt-10">
                <p className="flex flex-wrap items-baseline gap-x-2 font-display text-lg font-semibold text-twilight-text">
                    <span className="break-words">{former ? "A former member" : (person?.name ?? "Cadence user")}</span>
                    {!former && <span className="text-sm font-normal text-twilight-text-soft">{tagOf(userId)}</span>}
                </p>
                {person?.pronouns ? <p className="text-sm text-twilight-text-soft">{person.pronouns}</p> : null}
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {person && RoleIcon ? (
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
                {sharedInCommon.length > 0 && (
                    <div className="mt-3 border-t border-twilight-border/60 pt-3">
                        <p className="mb-1.5 text-xs font-medium text-twilight-text-soft">Shared lists</p>
                        <ul className="flex flex-wrap gap-1.5">
                            {sharedInCommon.map((list) => (
                                <li
                                    key={list.id}
                                    className="inline-flex max-w-full items-center gap-1 rounded-full surface-control px-2.5 py-0.5 text-xs text-twilight-text"
                                >
                                    {list.emoji ? (
                                        <span aria-hidden="true">{list.emoji}</span>
                                    ) : (
                                        <FolderOpen
                                            size={11}
                                            aria-hidden="true"
                                            className="shrink-0 text-twilight-text-soft"
                                        />
                                    )}
                                    <span className="truncate">{list.name}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        </div>
    );
}
