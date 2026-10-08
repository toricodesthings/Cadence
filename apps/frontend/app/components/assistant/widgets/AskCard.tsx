import { useId, useState } from "react";
import { ArrowUp, MessageCircleQuestion } from "lucide-react";
import type { ToolRenderContext } from "./ApprovalCard";

type Option = { label?: string; description?: string };

/**
 * The assistant's question (`ask_user`), Claude Code style: tap an option or type
 * your own answer and send it. The answer goes as your next message, so once the
 * thread moves on (`reply` absent) the card rests as the question alone.
 */
export function AskCard({ ctx }: { ctx: ToolRenderContext }) {
    const input = (ctx.part?.input ?? {}) as { question?: string; options?: Option[] };
    const options = (input.options ?? []).filter((option) => option?.label);
    const [text, setText] = useState("");
    const boxId = useId();
    const reply = ctx.reply;
    const send = (answer: string) => {
        if (answer.trim()) reply?.(answer.trim());
    };

    return (
        <div role="group" aria-label={input.question ?? "Question"} className="mt-2 w-full rounded-2xl border border-twilight-border bg-twilight-deep/50 p-3">
            <p className="mb-2.5 flex items-center gap-1.5 font-display text-[11px] font-semibold uppercase tracking-wider text-twilight-text-muted">
                <MessageCircleQuestion size={12} aria-hidden="true" />
                Question
            </p>
            <p className="text-sm text-twilight-text">{input.question}</p>
            {reply ? (
                <>
                    <div className="mt-2.5 flex flex-col gap-1.5">
                        {options.map((option, index) => (
                            <button
                                key={index}
                                type="button"
                                onClick={() => send(option.label!)}
                                className="flex min-h-11 w-full cursor-pointer flex-col items-start justify-center rounded-xl border border-twilight-border bg-twilight-surface px-3 py-2 text-left transition-colors hover:bg-twilight-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
                            >
                                <span className="text-sm text-twilight-text">{option.label}</span>
                                {option.description ? <span className="text-xs text-twilight-text-muted">{option.description}</span> : null}
                            </button>
                        ))}
                    </div>
                    <form
                        className="mt-2 flex items-end gap-1.5"
                        onSubmit={(event) => {
                            event.preventDefault();
                            send(text);
                        }}
                    >
                        <label htmlFor={boxId} className="sr-only">Your own answer</label>
                        <textarea
                            id={boxId}
                            rows={1}
                            value={text}
                            placeholder="Or type your own answer"
                            onChange={(event) => setText(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                                    event.preventDefault();
                                    send(text);
                                }
                            }}
                            className="min-h-11 flex-1 resize-none rounded-xl border border-twilight-border bg-twilight-surface px-3 py-2.5 text-sm text-twilight-text placeholder:text-twilight-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
                        />
                        <button
                            type="submit"
                            aria-label="Send answer"
                            disabled={!text.trim()}
                            className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl bg-accent-primary text-[var(--primary-foreground)] transition-opacity disabled:cursor-default disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
                        >
                            <ArrowUp size={16} aria-hidden="true" />
                        </button>
                    </form>
                </>
            ) : null}
        </div>
    );
}
