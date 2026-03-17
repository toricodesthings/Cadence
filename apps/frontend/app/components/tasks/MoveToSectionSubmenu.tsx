import React from "react";
import { Columns3, ChevronRight } from "lucide-react";
import * as DropdownMenu from "../primitives/DropdownMenu";
import { useSections } from "../../hooks/sections";

interface MoveToSectionSubmenuProps {
    currentProjectId: string | null;
    currentSectionId?: string | null;
    onSelect: (sectionId: string | null) => void;
    MenuComponents?: typeof DropdownMenu;
}

export const MoveToSectionSubmenu: React.FC<MoveToSectionSubmenuProps> = ({
    currentProjectId,
    currentSectionId = null,
    onSelect,
    MenuComponents: Menu = DropdownMenu,
}) => {
    const { data: sections = [] } = useSections(currentProjectId);

    if (sections.length === 0) {
        return null;
    }

    return (
        <Menu.Sub>
            <Menu.SubTrigger className="flex items-center gap-2">
                <Columns3 size={16} />
                <span>Move to section</span>
                <ChevronRight size={14} className="ml-auto text-twilight-text-muted" />
            </Menu.SubTrigger>
            <Menu.Portal>
                <Menu.SubContent>
                    <Menu.Item
                        onClick={() => onSelect(null)}
                        className={!currentSectionId ? "bg-white/[0.04] text-lantern" : ""}
                    >
                        Unsectioned
                    </Menu.Item>
                    <Menu.Separator />
                    {sections.map((section) => (
                        <Menu.Item
                            key={section.id}
                            onClick={() => onSelect(section.id)}
                            className={currentSectionId === section.id ? "bg-white/[0.04] text-lantern" : ""}
                        >
                            {section.name}
                        </Menu.Item>
                    ))}
                </Menu.SubContent>
            </Menu.Portal>
        </Menu.Sub>
    );
};
