import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useState } from "react";
import { Users } from "lucide-react";
import type { Project } from "@cadence/contracts/project";
import { HEADER_ICON_BUTTON } from "../layout/PageHeader";
import { Tip } from "../primitives/Tooltip";
import { isSharedList } from "../../hooks/sharing/use-list-access";
import { useListPeople } from "../../hooks/sharing/use-list-people";
import { useListPresence } from "../../hooks/sharing/use-list-presence";
import { SPRINGS } from "../../lib/constants/motion";
import { AvatarFace } from "./PersonAvatar";
import { ProfileCard } from "./ProfileCard";

const STACK = 3;

/** Accent ring = can edit (or owns); a quiet grey ring = view only. */
export const roleRing = (role: string | undefined) =>
    role === "view" ? "!ring-[3px] !ring-twilight-border" : "!ring-[3px] !ring-accent-primary/40";

/**
 * A list header's sharing control. An unshared list shows "Share"; any shared list (owner or member) shows the faces
 * of the people in it (three, then "+n"). Online people sit apart with a live dot; offline ones tuck behind each other.
 */
export function ShareHeader({ project, onOpen }: { project: Project; onOpen: () => void }) {
    const owner = project.access === "owner";
    const shared = isSharedList(project);
    const { data: people } = useListPeople(project);
    const onlineIds = useListPresence(project.id, shared);
    const [spread, setSpread] = useState(false);
    const prefersReduced = useReducedMotion();
    const setting = document.documentElement.dataset.motion;
    const reduced = setting === "reduced" || (setting !== "full" && Boolean(prefersReduced));

    if (owner && !shared) {
        return (
            <Tip label="Share this list">
                <button type="button" aria-label="Share list" onClick={onOpen} className={HEADER_ICON_BUTTON}>
                    <Users size={18} aria-hidden="true" />
                </button>
            </Tip>
        );
    }

    const ordered = [...(people ?? [])].sort(
        (a, b) => Number(onlineIds.has(b.userId)) - Number(onlineIds.has(a.userId)),
    );
    const shown = ordered.slice(0, STACK);
    const more = Math.max(0, (people?.length ?? (project.members?.length ?? 0) + 1) - STACK);
    return (
        <div
            className="flex items-center"
            onMouseEnter={() => setSpread(true)}
            onMouseLeave={() => setSpread(false)}
            onFocus={() => setSpread(true)}
            onBlur={() => setSpread(false)}
        >
            {shown.map((person, index) => {
                const here = onlineIds.has(person.userId);
                // Two online faces sit apart so both dots read; anyone offline folds behind the face before it. Hover unfolds all.
                const apart = spread || (here && onlineIds.has(shown[index - 1]?.userId ?? ""));
                return (
                    <motion.span
                        key={person.userId}
                        layout="position"
                        style={{ zIndex: shown.length - index }}
                        transition={reduced ? { duration: 0 } : SPRINGS.GLIDE}
                        className={`relative inline-flex ${index === 0 ? "" : apart ? "ml-1" : "-ml-3"}`}
                    >
                        <Tip
                            card
                            side="bottom"
                            label={<ProfileCard person={person} userId={person.userId} projectId={project.id} />}
                        >
                            <button
                                type="button"
                                onClick={onOpen}
                                aria-label={`${person.name ?? "Member"}${here ? ", here now" : ""}`}
                                className="relative inline-flex size-11 cursor-pointer items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-primary)]"
                            >
                                <AvatarFace
                                    person={person}
                                    size={24}
                                    className={`!size-full !text-sm ${roleRing(person.role)}`}
                                />
                                <AnimatePresence initial={false}>
                                    {here && (
                                        <motion.span
                                            aria-hidden="true"
                                            initial={{ opacity: 0, scale: 0.4 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            exit={{ opacity: 0, scale: 0.4 }}
                                            transition={reduced ? { duration: 0 } : SPRINGS.SNAP}
                                            className="absolute bottom-0.5 right-0.5 size-2.5 rounded-full bg-feedback-success ring-2 ring-twilight-base"
                                        />
                                    )}
                                </AnimatePresence>
                            </button>
                        </Tip>
                    </motion.span>
                );
            })}
            {more > 0 && (
                <button
                    type="button"
                    onClick={onOpen}
                    aria-label={`${more} more people`}
                    className="ml-1 inline-flex min-h-11 cursor-pointer items-center px-1 text-xs text-twilight-text-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-primary)]"
                >
                    +{more}
                </button>
            )}
        </div>
    );
}
