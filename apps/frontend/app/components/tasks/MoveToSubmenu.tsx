import React from "react";
import { Folder, ChevronRight } from "lucide-react";
import * as DropdownMenu from "../primitives/DropdownMenu";
import { useProjects } from "../../hooks/projects/use-projects";

interface MoveToSubmenuProps {
    currentProjectId: string | null;
    onSelect: (projectId: string | null) => void;
    MenuComponents?: any;
}

export const MoveToSubmenu: React.FC<MoveToSubmenuProps> = ({
    currentProjectId,
    onSelect,
    MenuComponents: Menu = DropdownMenu,
}) => {
    const { data: projects = [] } = useProjects();

    return (
        <Menu.Sub>
            <Menu.SubTrigger className="flex items-center gap-2">
                <Folder size={16} />
                <span>Move to project</span>
                <ChevronRight size={14} className="ml-auto text-twilight-text-muted" />
            </Menu.SubTrigger>
            <Menu.Portal>
                <Menu.SubContent>
                    <Menu.Item
                        onClick={() => onSelect(null)}
                        className={!currentProjectId ? "bg-white/[0.04] text-lantern" : ""}
                    >
                        No Project (Holding)
                    </Menu.Item>
                    <Menu.Separator />
                    {projects.map((project) => (
                        <Menu.Item
                            key={project.id}
                            onClick={() => onSelect(project.id)}
                            className={
                                currentProjectId === project.id ? "bg-white/[0.04] text-lantern" : ""
                            }
                        >
                            {project.name}
                        </Menu.Item>
                    ))}
                </Menu.SubContent>
            </Menu.Portal>
        </Menu.Sub>
    );
};
