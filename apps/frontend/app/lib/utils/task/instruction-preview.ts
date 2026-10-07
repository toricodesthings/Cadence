import type { InstructionPatch } from "@cadence/domain/task-instruction";
import { formatShortDate, formatShortDateTime } from "../date-format";

interface Named { id: string; name: string }

/** The change a patch makes, in the words the user will read before applying it. */
export function previewParts(patch: InstructionPatch, { projects, tags, sections = [] }: { projects: Named[]; tags: Named[]; sections?: Named[] }): string[] {
    const parts: string[] = [];
    if (patch.state === "WAITING") parts.push("Waiting");
    if (patch.state === "ACTIVE") parts.push("Active");
    if (patch.scheduledStart) parts.push(formatShortDateTime(patch.scheduledStart));
    else if (patch.dueDate) parts.push(formatShortDate(patch.dueDate));
    else if (patch.dueDate === null && patch.scheduledStart === null) parts.push("No day");
    if (patch.durationEstimate) parts.push(`${patch.durationEstimate} min`);
    if (patch.notBefore) parts.push(`Hidden until ${formatShortDate(patch.notBefore)}`);
    if (patch.waitingReminder) parts.push(`Follow up ${formatShortDateTime(patch.waitingReminder)}`);
    if (patch.waitingOn) parts.push(`Waiting on ${patch.waitingOn.trim()}`);
    const list = patch.projectId ? projects.find((p) => p.id === patch.projectId)?.name ?? "List" : null;
    const section = patch.sectionId ? sections.find((s) => s.id === patch.sectionId)?.name : null;
    if (list || section) parts.push([list, section].filter(Boolean).join(" › "));
    for (const id of patch.addTagIds ?? []) parts.push(`#${tags.find((t) => t.id === id)?.name ?? "tag"}`);
    if (patch.priority) parts.push(`P${5 - patch.priority}`);
    return parts;
}
