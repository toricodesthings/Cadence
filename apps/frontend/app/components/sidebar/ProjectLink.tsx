import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import * as DropdownMenu from "../primitives/DropdownMenu";
import * as Dialog from "../primitives/Dialog";
import * as AlertDialog from "../primitives/AlertDialog";
import { Button } from "../primitives/Button";
import { useUpdateProject, useDeleteProject } from "../../hooks/projects";
import { EmojiPickerPopover } from "../shared/EmojiPickerPopover";

interface ProjectLinkProps {
    id: string;
    label: string;
    color: string;
    href: string;
    emoji?: string | null;
    count?: number;
}

/** Reusable project list item with color dot and quick-action menu */
export function ProjectLink({ id, label, color, href, emoji, count }: ProjectLinkProps) {
    const location = useLocation();
    const navigate = useNavigate();
    const active = location.pathname === href;
    const updateProject = useUpdateProject();
    const deleteProject = useDeleteProject();

    const [renameOpen, setRenameOpen] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [renameValue, setRenameValue] = useState("");
    const [colorValue, setColorValue] = useState("luminous-amber");
    const [emojiValue, setEmojiValue] = useState(emoji || "");
    const [isCustomColor, setIsCustomColor] = useState(false);

    const handleRenameOpen = () => {
        setRenameValue(label);
        setColorValue(color);
        setEmojiValue(emoji || "");
        setIsCustomColor(color.startsWith("#"));
        setRenameOpen(true);
    };

    const handleRenameSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = renameValue.trim();
        if (trimmed) {
            updateProject.mutate({
                id,
                name: trimmed,
                colorAccent: colorValue,
                emoji: emojiValue || null,
            });
        }
        setRenameOpen(false);
    };

    const handleDelete = () => {
        deleteProject.mutate(id);
        if (active) navigate("/");
    };

    return (
        <>
            {/* Rename dialog */}
            <Dialog.Dialog open={renameOpen} onOpenChange={setRenameOpen}>
                <Dialog.DialogContent className="max-w-sm" hideCloseButton>
                    <Dialog.DialogHeader>
                        <Dialog.DialogTitle>Rename / Edit project</Dialog.DialogTitle>
                        <Dialog.DialogDescription>
                            Enter a new name or style for <span className="text-twilight-text">{label}</span>.
                        </Dialog.DialogDescription>
                    </Dialog.DialogHeader>
                    <form onSubmit={handleRenameSubmit} className="flex flex-col gap-4">
                        <div className="flex gap-2 mb-3">
                            <EmojiPickerPopover emoji={emojiValue} onSelect={setEmojiValue} />
                            <input
                                autoFocus
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                placeholder="Project name"
                                className="flex-1 w-full rounded-xl bg-white/[0.06] border border-twilight-border px-4 py-2.5 text-sm text-twilight-text placeholder:text-twilight-text-muted/80 outline-none focus:border-lantern/40 transition-colors"
                                onKeyDown={(e) => e.key === "Escape" && setRenameOpen(false)}
                            />
                        </div>
                        <div className="flex gap-2 items-center flex-wrap">
                            {[
                                { label: "Amber", value: "luminous-amber", varName: "var(--color-lantern)" },
                                { label: "Blue", value: "moonlit-blue", varName: "var(--color-moonlit)" },
                                { label: "Sapphire", value: "sapphire", varName: "var(--color-sapphire)" },
                                { label: "Red", value: "ember-red", varName: "var(--color-ember-red)" },
                                { label: "Green", value: "forest-green", varName: "var(--color-forest-green)" },
                                { label: "Violet", value: "violet", varName: "var(--color-violet)" },
                            ].map((opt) => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => {
                                        setColorValue(opt.value);
                                        setIsCustomColor(false);
                                    }}
                                    title={opt.label}
                                    className={`w-5 h-5 rounded-full transition-[transform,opacity] duration-150 cursor-pointer ${colorValue === opt.value && !isCustomColor
                                        ? "ring-2 ring-offset-2 ring-offset-twilight-surface scale-110"
                                        : "opacity-60 hover:opacity-100"
                                        }`}
                                    style={{ backgroundColor: opt.varName }}
                                />
                            ))}
                            <div className="relative flex items-center justify-center w-5 h-5 rounded-full ring-1 ring-twilight-border overflow-hidden cursor-pointer" title="Custom Hex Color">
                                <input
                                    type="color"
                                    value={colorValue.startsWith("#") ? colorValue : "#e8a44a"}
                                    onChange={(e) => {
                                        setColorValue(e.target.value);
                                        setIsCustomColor(true);
                                    }}
                                    className="absolute inset-[-10px] w-[200%] h-[200%] cursor-pointer"
                                />
                                {isCustomColor && (
                                    <div className="absolute inset-0 ring-2 ring-offset-2 ring-offset-twilight-surface ring-twilight-text/50 rounded-full pointer-events-none" />
                                )}
                            </div>
                        </div>
                        <div className="flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setRenameOpen(false)}
                                className="px-4 py-2 rounded-xl text-sm text-twilight-text-muted hover:text-twilight-text hover:bg-white/[0.06] transition-colors cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={!renameValue.trim()}
                                className="px-4 py-2 rounded-xl text-sm bg-lantern/20 text-lantern hover:bg-lantern/30 transition-colors disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                            >
                                Save changes
                            </button>
                        </div>
                    </form>
                </Dialog.DialogContent>
            </Dialog.Dialog>

            {/* Delete confirmation */}
            <AlertDialog.Root open={deleteOpen} onOpenChange={setDeleteOpen}>
                <AlertDialog.Content>
                    <AlertDialog.Header>
                        <AlertDialog.Title>Delete "{label}"?</AlertDialog.Title>
                        <AlertDialog.Description>
                            This will permanently delete the project and all its tasks. This action cannot be undone.
                        </AlertDialog.Description>
                    </AlertDialog.Header>
                    <AlertDialog.Footer>
                        <AlertDialog.Cancel asChild>
                            <Button variant="ghost" size="md">
                                Cancel
                            </Button>
                        </AlertDialog.Cancel>
                        <AlertDialog.Action asChild>
                            <Button
                                variant="danger"
                                size="md"
                                onClick={handleDelete}
                            >
                                Delete project
                            </Button>
                        </AlertDialog.Action>
                    </AlertDialog.Footer>
                </AlertDialog.Content>
            </AlertDialog.Root>

            {/* Row */}
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
                <Link to={href} className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer">
                    {emoji ? (
                        <span className="text-[14px] shrink-0 w-4 pl-0.5">{emoji}</span>
                    ) : (
                        <span
                            className="w-2 h-2 ml-1 rounded-full shrink-0"
                            style={{ backgroundColor: color }}
                        />
                    )}
                    <span className="flex-1 truncate">{label}</span>
                    {count !== undefined && count > 0 && (
                        <span className="text-[13px] tabular-nums text-twilight-text-muted">{count}</span>
                    )}
                </Link>

                <DropdownMenu.Root>
                    <DropdownMenu.Trigger asChild>
                        <button
                            aria-label={`Open actions for project ${label}`}
                            className="btn-icon -my-2 -mr-2 shrink-0 text-twilight-text-muted opacity-0 transition-[opacity,color,background-color] group-hover:opacity-100 hover:bg-white/[0.05] hover:text-twilight-text focus-visible:opacity-100"
                            onClick={(e) => e.preventDefault()}
                        >
                            <MoreHorizontal size={13} aria-hidden="true" />
                        </button>
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Content align="end" side="right">
                        <DropdownMenu.Item
                            className="flex items-center gap-2 text-[13px]"
                            onSelect={handleRenameOpen}
                        >
                            <Pencil size={12} aria-hidden="true" />
                            Rename
                        </DropdownMenu.Item>
                        <DropdownMenu.Separator />
                        <DropdownMenu.Item
                            className="flex items-center gap-2 text-[13px] text-red-400 focus:text-red-400 focus:bg-red-500/10"
                            onSelect={() => setDeleteOpen(true)}
                        >
                            <Trash2 size={12} aria-hidden="true" />
                            Delete
                        </DropdownMenu.Item>
                    </DropdownMenu.Content>
                </DropdownMenu.Root>
            </div>
        </>
    );
}
