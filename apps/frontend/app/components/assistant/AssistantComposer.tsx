import React, { useEffect, useRef, useState, type RefObject } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, ArrowUp, ImagePlus, Slash, Zap, ShieldCheck, ShieldOff, ChevronDown, Loader2, AlertCircle } from "lucide-react";
import type { ApprovalMode } from "@cadence/contracts/ai";
import { Tip, DropdownMenu } from "../primitives";
import { ImageViewer } from "../shared/ImageViewer";
import { useAssistantStore } from "../../stores/assistant-store";
import { SlashCommandMenu, SLASH_MENU_ID, slashOptionId } from "./SlashCommandMenu";
import { SLASH_COMMANDS, filterSlashCommands, matchSlashCommand, type SlashCommand } from "../../lib/ai/slash-commands";
import type { ImageAllowance } from "../../lib/ai/usage";
import type { ChatAttachments } from "../../hooks/ai/use-chat-attachments";

const APPROVAL_MODES: Record<ApprovalMode, { label: string; icon: React.ReactNode; hint: (name: string) => string }> = {
    ask: { label: "Ask first", icon: <ShieldCheck size={13} aria-hidden />, hint: () => "Confirm every create, change or delete" },
    auto: { label: "Auto", icon: <Zap size={13} aria-hidden />, hint: (name) => `${name} applies changes, but asks before deleting for good` },
    full: { label: "Full", icon: <ShieldOff size={13} aria-hidden />, hint: (name) => `${name} applies every change, deletes included` },
};
export function AssistantComposer({
    assistantName,
    isTouch,
    isMobile,
    choosingMemory,
    isStreaming,
    online,
    input,
    onInputChange,
    inputNotice,
    setInputNotice,
    imageAllowance,
    perMessage,
    usageNotice,
    images,
    textareaRef,
    onSend,
    onStop,
    onCommand
}: {
    assistantName: string;
    isTouch: boolean;
    isMobile: boolean;
    choosingMemory: boolean;
    isStreaming: boolean;
    online: boolean;
    input: string;
    onInputChange: (input: string) => void;
    inputNotice: string | null;
    setInputNotice: (notice: string | null) => void;
    imageAllowance: ImageAllowance;
    perMessage: number;
    usageNotice: string | null;
    images: ChatAttachments;
    textareaRef: RefObject<HTMLTextAreaElement | null>;
    onSend: (text: string) => boolean;
    onStop: () => Promise<void>;
    onCommand: (command: SlashCommand) => void;
}) {
    const { attachments, uploading, readyImages, addImages } = images;
    const fileInputRef = useRef<HTMLInputElement>(null);
    const pendingMessage = useAssistantStore(s => s.pendingMessage);
    const clearPendingMessage = useAssistantStore(s => s.clearPendingMessage);
    useEffect(() => { if (pendingMessage) { onInputChange(pendingMessage); clearPendingMessage(); } }, [pendingMessage, clearPendingMessage, onInputChange]);
    // Slash commands run in the app (no chat turn). Typing `/` opens the menu and
    // narrows it; the `/` button opens all of it over a draft without touching the
    // text. Escape hides the menu until the text changes.
    const [slashIndex, setSlashIndex] = useState(0);
    const [slashMode, setSlashMode] = useState<"auto" | "dismissed" | "forced">("auto");
    const slashCommands: readonly SlashCommand[] = slashMode === "forced" ? SLASH_COMMANDS : slashMode === "dismissed" ? [] : filterSlashCommands(input);
    const activeSlash = slashCommands[Math.min(slashIndex, slashCommands.length - 1)];
    const runSlashCommand = (command: SlashCommand) => {
        // Clear only a typed `/word`; a draft under the button's menu stays.
        if (/^\/\S*$/.test(input.trim())) onInputChange("");
        setSlashIndex(0);
        setSlashMode("auto");
        onCommand(command);
        if (command.id === "clear") textareaRef.current?.focus();
    };

    const toggleSlashMenu = () => {
        textareaRef.current?.focus();
        if (slashCommands.length > 0) {
            // Open → close: drop a typed `/word`, or the button's menu.
            if (slashMode !== "forced") onInputChange("");
            setSlashMode("auto");
        } else if (!input.trim()) {
            onInputChange("/");
            setSlashMode("auto");
        } else {
            setSlashMode("forced");
        }
        setSlashIndex(0);
    };

    /** Keys the open slash menu takes over; true when the key was handled. */
    const handleSlashKey = (e: React.KeyboardEvent, active: SlashCommand): boolean => {
        const n = slashCommands.length;
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            const step = e.key === "ArrowDown" ? 1 : n - 1;
            setSlashIndex((i) => (Math.min(i, n - 1) + step) % n);
        } else if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey && !isTouch)) {
            runSlashCommand(active);
        } else if (e.key === "Escape") {
            // Only the menu closes, not the panel.
            e.stopPropagation();
            setSlashMode("dismissed");
        } else {
            return false;
        }
        e.preventDefault();
        return true;
    };

    const handleSubmit = (e?: React.FormEvent) => {
        e?.preventDefault();
        const command = matchSlashCommand(input);
        if (command) runSlashCommand(command);
        else onSend(input);
    };

    // Auto-grow the textarea up to a comfortable cap.
    useEffect(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = "auto";
        el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
    }, [input, textareaRef]);

    return (
        <form
            inert={choosingMemory}
            onSubmit={handleSubmit}
            // The mobile sheet shell already pads for the home indicator.
            className="shrink-0 px-3 pb-3 pt-2"
        >
            {/* Offline / input-cap notice (design §8.4 / §9.4) */}
            <AnimatePresence>
                {!online || inputNotice ? (
                    <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="mb-1.5 text-center text-[11px] text-twilight-text-muted"
                    >
                        {!online ? "You’re offline — I’ll be here when you’re back." : inputNotice}
                    </motion.p>
                ) : null}
            </AnimatePresence>

            <AnimatePresence>
                {slashCommands.length > 0 ? (
                    <SlashCommandMenu commands={slashCommands} activeIndex={Math.min(slashIndex, slashCommands.length - 1)} onPick={runSlashCommand} />
                ) : null}
            </AnimatePresence>

            <div
                className="rounded-[24px] border border-white/[0.08] bg-panel-raised/85 shadow-[0_18px_40px_-24px_rgba(0,0,0,0.7)] transition-colors focus-within:border-accent-primary/35"
                onDragOver={(e) => {
                    if (e.dataTransfer.types.includes("Files")) e.preventDefault();
                }}
                onDrop={(e) => {
                    if (e.dataTransfer.files.length === 0) return;
                    e.preventDefault();
                    addImages(e.dataTransfer.files);
                }}
            >
                <AttachmentStrip images={images} />

                <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => {
                        onInputChange(e.target.value);
                        setSlashIndex(0);
                        setSlashMode("auto");
                        if (inputNotice) setInputNotice(null);
                    }}
                    aria-controls={activeSlash ? SLASH_MENU_ID : undefined}
                    aria-activedescendant={activeSlash ? slashOptionId(activeSlash.id) : undefined}
                    onKeyDown={(e) => {
                        if (activeSlash && handleSlashKey(e, activeSlash)) return;
                        // Touch keyboards: Return is a newline; the send button sends.
                        if (e.key === "Enter" && !e.shiftKey && !isTouch) {
                            e.preventDefault();
                            handleSubmit();
                        }
                    }}
                    onPaste={(e) => {
                        // Office apps put the text and a picture of it on the clipboard: keep the text.
                        const data = e.clipboardData;
                        if (data.getData("text/plain") || ![...data.files].some((f) => f.type.startsWith("image/"))) return;
                        e.preventDefault();
                        addImages(e.clipboardData.files);
                    }}
                    rows={1}
                    placeholder={`Message ${assistantName}…`}
                    aria-label={`Message ${assistantName}`}
                    // ≥16px on touch prevents iOS Safari from zooming on focus.
                    className={`block max-h-[140px] w-full resize-none bg-transparent px-4 pb-1 pt-3 leading-relaxed text-twilight-text placeholder:text-twilight-text-muted focus:outline-none ${isTouch || isMobile ? "mb-2.5 text-base" : "text-[14px]"}`}
                />

                <div className="flex items-center gap-1 px-2 pb-2">
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        hidden
                        onChange={(e) => {
                            if (e.target.files) addImages(e.target.files);
                            e.target.value = "";
                        }}
                    />
                    <Tip label={imageAllowance.label} side="top">
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={imageAllowance.blocked || attachments.length >= Math.min(perMessage, imageAllowance.left)}
                            aria-label={imageAllowance.label}
                            className="flex h-9 w-9 items-center justify-center rounded-full text-twilight-text-muted transition-colors hover:bg-white/[0.06] hover:text-twilight-text disabled:opacity-40 cursor-pointer"
                        >
                            <ImagePlus size={17} aria-hidden />
                        </button>
                    </Tip>
                    <Tip label="Commands" side="top">
                        <button
                            type="button"
                            // Keep the textarea focused so the menu's keys keep working.
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={toggleSlashMenu}
                            aria-label="Commands"
                            aria-expanded={slashCommands.length > 0}
                            aria-controls={slashCommands.length > 0 ? SLASH_MENU_ID : undefined}
                            className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50 ${
                                slashCommands.length > 0
                                    ? "bg-accent-primary/15 text-accent-primary"
                                    : "text-twilight-text-muted hover:bg-white/[0.06] hover:text-twilight-text"
                            }`}
                        >
                            <Slash size={15} aria-hidden />
                        </button>
                    </Tip>

                    <ApprovalModeMenu assistantName={assistantName} />

                    <div className="flex-1" />

                    <SendButton isStreaming={isStreaming} onStop={onStop} disabled={(!input.trim() && readyImages.length === 0) || !online || uploading} uploading={uploading} />
                </div>
            </div>
            {/* Footer: the low-budget hint takes the line over the AI disclaimer
                only while a usage window is actually running low (§9.4). */}
            <p className="mt-2 truncate text-center text-[10px] text-twilight-text-muted">
                {usageNotice ?? `${assistantName} is AI and can make mistakes.`}
            </p>
        </form>
    );
}

function AttachmentStrip({ images }: { images: ChatAttachments }) {
    const { attachments, removeAttachment } = images;
    const [viewing, setViewing] = useState<number | null>(null);
    if (attachments.length === 0) return null;
    return (
        <div className="flex gap-2 overflow-x-auto px-3 pt-3">
            {attachments.map((a, i) => (
                <div key={a.id} className="relative shrink-0">
                    <button
                        type="button"
                        onClick={() => setViewing(i)}
                        aria-label={`View attached image ${i + 1}`}
                        className="block cursor-zoom-in rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
                    >
                        <img
                            src={a.url}
                            alt={`Attached image ${i + 1}`}
                            className={`h-16 w-16 rounded-xl object-cover ring-1 ${a.status === "failed" ? "ring-feedback-error/60 opacity-50" : "ring-white/10"}`}
                        />
                    </button>
                    {a.status !== "ready" ? <AttachmentStatus uploading={a.status === "uploading"} /> : null}
                    <button
                        type="button"
                        onClick={() => removeAttachment(a.id)}
                        aria-label={`Remove attached image ${i + 1}`}
                        className="glass-none absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-twilight-deep text-twilight-text-soft ring-1 ring-white/15 transition-colors hover:text-twilight-text cursor-pointer"
                    >
                        <X size={12} aria-hidden />
                    </button>
                </div>
            ))}
            <ImageViewer
                images={attachments.map((a) => ({ key: a.id, title: a.name, src: a.url, bytes: a.bytes }))}
                index={viewing !== null && viewing < attachments.length ? viewing : null}
                onIndexChange={setViewing}
            />
        </div>
    );
}

function AttachmentStatus({ uploading }: { uploading: boolean }) {
    return (
        <span
            className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-twilight-deep/45"
            role="status"
            aria-label={uploading ? "Uploading image" : "Image didn’t attach"}
        >
            {uploading ? (
                <Loader2 size={18} className="animate-spin text-twilight-text" aria-hidden />
            ) : (
                <AlertCircle size={18} className="text-feedback-error" aria-hidden />
            )}
        </span>
    );
}

/** Approval mode — Ask first (default), Auto (all but permanent deletes) or Full. */
function ApprovalModeMenu({ assistantName }: { assistantName: string }) {
    const { approvalMode, setApprovalMode } = useAssistantStore();
    return (
        <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
                <button
                    type="button"
                    aria-label={`Approval mode: ${APPROVAL_MODES[approvalMode].label}`}
                    className={`flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium transition-colors cursor-pointer ${
                        approvalMode !== "ask"
                            ? "bg-accent-primary/15 text-accent-primary hover:bg-accent-primary/22"
                            : "text-twilight-text-muted hover:bg-white/[0.06] hover:text-twilight-text"
                    }`}
                >
                    {APPROVAL_MODES[approvalMode].icon}
                    {APPROVAL_MODES[approvalMode].label}
                    <ChevronDown size={12} className="opacity-60" aria-hidden />
                </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Content side="top" align="start" className="w-[260px]">
                <DropdownMenu.RadioGroup value={approvalMode} onValueChange={(v) => setApprovalMode(v as ApprovalMode)}>
                    {(Object.keys(APPROVAL_MODES) as ApprovalMode[]).map((mode) => (
                        <DropdownMenu.RadioItem key={mode} value={mode}>
                            <span className="flex flex-col">
                                <span>{APPROVAL_MODES[mode].label}</span>
                                <span className="text-[11px] font-normal text-twilight-text-muted">
                                    {APPROVAL_MODES[mode].hint(assistantName)}
                                </span>
                            </span>
                        </DropdownMenu.RadioItem>
                    ))}
                </DropdownMenu.RadioGroup>
            </DropdownMenu.Content>
        </DropdownMenu.Root>
    );
}

function SendButton({ isStreaming, onStop, disabled, uploading }: {
    isStreaming: boolean;
    onStop: () => Promise<void>;
    disabled: boolean;
    uploading: boolean;
}) {
    if (isStreaming) {
        return (
            <Tip label="Stop generating" side="top">
                <button
                    type="button"
                    onClick={() => void onStop()}
                    className="flex h-9 w-9 min-w-9 shrink-0 items-center justify-center rounded-full border border-feedback-error/30 bg-feedback-error/15 text-feedback-error transition-all hover:scale-[1.04] active:scale-[0.97] cursor-pointer"
                    aria-label="Stop generating"
                >
                    <span className="h-2.5 w-2.5 rounded-sm bg-feedback-error" />
                </button>
            </Tip>
        );
    }
    return (
        <Tip label={uploading ? "Waiting for images to attach" : "Send message"} side="top">
            <button
                type="submit"
                disabled={disabled}
                className="flex h-9 w-9 min-w-9 shrink-0 items-center justify-center rounded-full bg-accent-primary text-[var(--primary-foreground)] shadow-[0_6px_18px_-6px_var(--accent-primary)] transition-all hover:scale-[1.04] active:scale-[0.96] disabled:pointer-events-none disabled:bg-white/[0.06] disabled:text-twilight-text-muted disabled:shadow-none cursor-pointer"
                aria-label="Send message"
            >
                <ArrowUp size={18} strokeWidth={2.4} aria-hidden />
            </button>
        </Tip>
    );
}
