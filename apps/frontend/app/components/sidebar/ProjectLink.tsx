import { PlainNavCount } from "./PlainNavCount";
import { EditListDialog } from "../shared/EditListDialog";
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { EllipsisVertical, Pencil, Trash2 } from "lucide-react";
import * as DropdownMenu from "../primitives/DropdownMenu";
import * as ContextMenu from "../primitives/ContextMenu";
import { useDeleteProject } from "../../hooks/projects/use-delete-project";
import { trackUsageEvent } from "../../lib/api/track-event";

interface ProjectLinkProps {
    id: string;
    label: string;
    color: string;
    href: string;
    emoji?: string | null;
    count?: number;
}

export function ProjectLink({ id, label, color, href, emoji, count }: ProjectLinkProps) {
    const location = useLocation();
    const navigate = useNavigate();
    const active = location.pathname === href;
    const deleteProject = useDeleteProject();

    const [renameOpen, setRenameOpen] = useState(false);
    const openRename = () => setRenameOpen(true);

    const handleDelete = () => {
        deleteProject.mutate({ id, name: label });
        if (active) navigate("/");
    };

    return (
        <>
            <EditListDialog open={renameOpen} onOpenChange={setRenameOpen} list={{ id, name: label, colorAccent: color, emoji }} />

            {/* Row */}
            <ContextMenu.Root onOpenChange={(isOpen) => {
                if (isOpen) trackUsageEvent("project.context_menu_opened", { object_type: "project", input_method: "context_menu" });
            }}>
            <ContextMenu.Trigger asChild>
            <div
                className={`
                    group flex items-center gap-3 px-3 py-2.5 rounded-xl text-[15px]
                    transition-colors duration-200
                    ${active
                        ? "bg-white/[0.06] text-twilight-text font-medium"
                        : "text-twilight-text-soft hover:text-twilight-text hover:bg-white/[0.03]"
                    }
                `}
            >
                <Link to={href} aria-label={count === undefined ? label : `${label}, ${count} ${count === 1 ? "task" : "tasks"}`} aria-current={active ? "page" : undefined} className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer">
                    {emoji ? (
                        <span className="text-[14px] shrink-0 w-4 pl-0.5">{emoji}</span>
                    ) : (
                        <span
                            className="w-2 h-2 ml-1 rounded-full shrink-0"
                            style={{ backgroundColor: color }}
                        />
                    )}
                    <span className="flex-1 truncate">{label}</span>
                    <PlainNavCount count={count} />
                </Link>

                <DropdownMenu.Root>
                    <DropdownMenu.Trigger asChild>
                        <button
                            aria-label={`Open actions for list ${label}`}
                            className="btn-icon -my-2 -mr-2 shrink-0 text-twilight-text-muted opacity-0 transition-[opacity,color,background-color] group-hover:opacity-100 touch-reveal hover:bg-white/[0.05] hover:text-twilight-text focus-visible:opacity-100"
                            onClick={(e) => e.preventDefault()}
                        >
                            <EllipsisVertical size={13} aria-hidden="true" />
                        </button>
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Content align="end" side="right">
                        <DropdownMenu.Item
                            className="flex items-center gap-2 text-[13px]"
                            onSelect={openRename}
                        >
                            <Pencil size={12} aria-hidden="true" />
                            Rename
                        </DropdownMenu.Item>
                        <DropdownMenu.Separator />
                        <DropdownMenu.Item
                            className="flex items-center gap-2 text-[13px] text-red-400 focus:text-red-400 focus:bg-red-500/10"
                            onSelect={handleDelete}
                        >
                            <Trash2 size={12} aria-hidden="true" />
                            Delete
                        </DropdownMenu.Item>
                    </DropdownMenu.Content>
                </DropdownMenu.Root>
            </div>
            </ContextMenu.Trigger>
            <ContextMenu.Content>
                <ContextMenu.Item onSelect={openRename}>
                    <div className="flex items-center gap-2">
                        <Pencil size={16} />
                        <span>Rename / Edit</span>
                        <kbd className="ml-auto text-[10px] opacity-40 font-mono">e</kbd>
                    </div>
                </ContextMenu.Item>
                <ContextMenu.Separator />
                <ContextMenu.Item variant="danger" onSelect={handleDelete}>
                    <div className="flex items-center gap-2">
                        <Trash2 size={16} />
                        <span>Delete list</span>
                    </div>
                </ContextMenu.Item>
            </ContextMenu.Content>
            </ContextMenu.Root>
        </>
    );
}
