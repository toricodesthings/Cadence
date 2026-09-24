import { Columns3, Folder } from "lucide-react";
import { useProjects } from "../../../hooks/projects/use-projects";
import { useSections } from "../../../hooks/sections/use-sections";
import { MetaPill } from "./ProposalCard";

function ListPill({ id }: { id: string }) {
    const { data, isPending } = useProjects();
    return <MetaPill icon={Folder}>{data?.find((p) => p.id === id)?.name ?? (isPending ? "Loading list…" : "List unavailable")}</MetaPill>;
}

function SectionPill({ id, projectId }: { id: string; projectId?: string | null }) {
    const { data, isPending } = useSections(projectId);
    return <MetaPill icon={Columns3}>{data?.find((s) => s.id === id)?.name ?? (isPending ? "Loading section…" : "Section unavailable")}</MetaPill>;
}

/** Shared by creation and update cards; fetch names even when the list hasn't been opened. */
export function TaskDestination({ projectId, sectionId }: { projectId?: string | null; sectionId?: string | null }) {
    return <>
        {projectId ? <ListPill id={projectId} /> : projectId === null ? <MetaPill icon={Folder}>No list</MetaPill> : null}
        {sectionId ? <SectionPill id={sectionId} projectId={projectId} /> : sectionId === null ? <MetaPill icon={Columns3}>No section</MetaPill> : null}
    </>;
}
