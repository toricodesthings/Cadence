import React from "react";
import { ChevronRight, FolderOpen } from "lucide-react";
import type { Project } from "@cadence/contracts/project";
import * as DropdownMenu from "../primitives/DropdownMenu";
import type { GenericMenu } from "../primitives/menu-styles";
import { useProjects } from "../../hooks/projects/use-projects";
import { useSections } from "../../hooks/sections/use-sections";

const CURRENT = "bg-white/[0.04] text-accent-primary";

interface MoveToSubmenuProps {
    currentProjectId: string | null;
    currentSectionId?: string | null;
    /** A list alone files it unsectioned; a section is picked straight from the list's own submenu. */
    onSelect: (projectId: string | null, sectionId: string | null) => void;
    /** Hide "No list" where it means nothing (a thought already has no list). */
    hideNoList?: boolean;
    MenuComponents?: GenericMenu;
}

/** One list: a plain row, or a submenu of its sections when it has any. */
function ListRow({ Menu, project, currentProjectId, currentSectionId, onSelect }: { Menu: GenericMenu; project: Project } & Omit<MoveToSubmenuProps, "MenuComponents" | "hideNoList">) {
    const { data: sections = [] } = useSections(project.id);
    const here = currentProjectId === project.id;
    if (sections.length === 0)
        return <Menu.Item onSelect={() => onSelect(project.id, null)} className={here ? CURRENT : ""}>{project.name}</Menu.Item>;
    return (
        <Menu.Sub>
            <Menu.SubTrigger className={`flex items-center gap-2 ${here ? CURRENT : ""}`}>
                <span className="truncate">{project.name}</span>
                <ChevronRight aria-hidden size={14} className="ml-auto text-twilight-text-muted" />
            </Menu.SubTrigger>
            <Menu.Portal>
                <Menu.SubContent>
                    <Menu.Item onSelect={() => onSelect(project.id, null)} className={here && !currentSectionId ? CURRENT : ""}>Unsectioned</Menu.Item>
                    <Menu.Separator />
                    {sections.map((section) => (
                        <Menu.Item key={section.id} onSelect={() => onSelect(project.id, section.id)} className={currentSectionId === section.id ? CURRENT : ""}>
                            {section.name}
                        </Menu.Item>
                    ))}
                </Menu.SubContent>
            </Menu.Portal>
        </Menu.Sub>
    );
}

export const MoveToSubmenu: React.FC<MoveToSubmenuProps> = ({
    currentProjectId,
    currentSectionId = null,
    onSelect,
    hideNoList = false,
    MenuComponents: Menu = DropdownMenu,
}) => {
    const { data: projects = [] } = useProjects();

    return (
        <Menu.Sub>
            <Menu.SubTrigger className="flex items-center gap-2">
                <FolderOpen size={16} />
                <span>Move to list</span>
                <ChevronRight size={14} className="ml-auto text-twilight-text-muted" />
            </Menu.SubTrigger>
            <Menu.Portal>
                <Menu.SubContent>
                    {!hideNoList && (
                        <>
                            <Menu.Item onSelect={() => onSelect(null, null)} className={!currentProjectId ? CURRENT : ""}>
                                No List (Capture)
                            </Menu.Item>
                            <Menu.Separator />
                        </>
                    )}
                    {projects.map((project) => (
                        <ListRow
                            key={project.id}
                            Menu={Menu}
                            project={project}
                            currentProjectId={currentProjectId}
                            currentSectionId={currentSectionId}
                            onSelect={onSelect}
                        />
                    ))}
                </Menu.SubContent>
            </Menu.Portal>
        </Menu.Sub>
    );
};
