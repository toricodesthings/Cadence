import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../primitives/Dialog";
import { Button } from "../primitives/Button";
import { useUpdateTask } from "../../hooks/tasks";

interface RenameTaskDialogProps {
    taskId: string | null;
    currentName: string;
    onClose: () => void;
}

export function RenameTaskDialog({ taskId, currentName, onClose }: RenameTaskDialogProps) {
    const [name, setName] = useState(currentName);
    const inputRef = useRef<HTMLInputElement>(null);
    const updateTask = useUpdateTask();

    useEffect(() => {
        setName(currentName);
    }, [currentName]);

    useEffect(() => {
        if (taskId) {
            requestAnimationFrame(() => inputRef.current?.select());
        }
    }, [taskId]);

    const handleSubmit = () => {
        const trimmed = name.trim();
        if (!trimmed || !taskId) return;
        if (trimmed !== currentName) {
            updateTask.mutate({ id: taskId, title: trimmed });
        }
        onClose();
    };

    return (
        <Dialog open={!!taskId} onOpenChange={(open) => { if (!open) onClose(); }}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Rename Task</DialogTitle>
                </DialogHeader>
                <input
                    ref={inputRef}
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") handleSubmit();
                        if (e.key === "Escape") onClose();
                    }}
                    placeholder="Task name…"
                    className="w-full bg-white/[0.04] border border-twilight-border rounded-xl px-4 py-3 text-[15px] text-twilight-text placeholder:text-twilight-text-muted/80 outline-none focus:border-lantern/30 transition-colors"
                />
                <DialogFooter>
                    <Button variant="ghost" size="md" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        variant="primary"
                        size="md"
                        onClick={handleSubmit}
                        disabled={!name.trim()}
                        className="bg-lantern/20 hover:bg-lantern/30 text-lantern disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                        Rename
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
