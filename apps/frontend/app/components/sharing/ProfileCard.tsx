import { Eye, Pencil, UsersRound } from "lucide-react";
import type { ListPerson, ListRole } from "@cadence/contracts/sharing";
import { ProfileBanner } from "../shared/ProfileBanner";
import { AvatarFace } from "./PersonAvatar";

export const ROLE_LABEL: Record<ListRole, string> = { owner: "Owner", edit: "Can edit", view: "Can view" };
export const ROLE_ICON = { owner: UsersRound, edit: Pencil, view: Eye } as const;

/** `#a1b2`: the first four characters of the account id, as on the profile page. */
export const tagOf = (userId: string) => `#${userId.slice(0, 4)}`;

/**
 * Who someone is, to the people they share a list with: picture, name, `#tag`, pronouns (left out when empty) and
 * their role in this list. Email and birthday are never here.
 */
export function ProfileCard({
    person,
    userId,
    former = false,
}: {
    person: ListPerson | undefined;
    userId: string;
    former?: boolean;
}) {
    const RoleIcon = person ? ROLE_ICON[person.role] : null;
    return (
        <div className="profile-card-bg">
            <ProfileBanner className="h-16">
                <div className="absolute -bottom-8 left-4 rounded-full border-4 border-twilight-surface bg-twilight-base">
                    <AvatarFace person={person} size={32} className="!size-14 !text-lg" />
                </div>
            </ProfileBanner>
            <div className="flex flex-col gap-1 px-4 pb-4 pt-10">
                <p className="flex flex-wrap items-baseline gap-x-2 font-display text-lg font-semibold text-twilight-text">
                    <span className="break-words">{former ? "A former member" : (person?.name ?? "Cadence user")}</span>
                    {!former && <span className="text-sm font-normal text-twilight-text-soft">{tagOf(userId)}</span>}
                </p>
                {person?.pronouns ? <p className="text-sm text-twilight-text-soft">{person.pronouns}</p> : null}
                {person && RoleIcon ? (
                    <p className="mt-2 inline-flex w-fit items-center gap-1.5 rounded-full surface-control px-2.5 py-1 text-xs text-twilight-text-soft">
                        <RoleIcon size={12} aria-hidden="true" />
                        {ROLE_LABEL[person.role]}
                    </p>
                ) : null}
            </div>
        </div>
    );
}
