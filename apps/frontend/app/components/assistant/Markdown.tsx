import React, { memo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Discord-flavoured markdown renderer for chat bubbles.
 *
 * Themed entirely with twilight/accent tokens so it adapts to both the dark
 * "Twilight" and light "Daylight" palettes. Deliberately avoids syntax
 * highlighting libraries to keep the bundle lean — code blocks are rendered as
 * a themed, horizontally-scrollable monospace surface.
 *
 * Raw HTML is NOT enabled (no rehype-raw), so react-markdown's default
 * sanitization keeps user/assistant text safe.
 */

const components: Components = {
    // Paragraphs — tight leading inside a bubble, no margin on the last one.
    p: ({ children }) => <p className="my-0.5 first:mt-0 last:mb-0">{children}</p>,

    // Emphasis. Discord's `__underline__` is parsed by remark as strong/emphasis
    // depending on context; we render `<strong>` bold and `<em>` italic, and map
    // the `<u>`/`<del>` cases to underline / strikethrough.
    strong: ({ children }) => <strong className="font-semibold text-twilight-text">{children}</strong>,
    em: ({ children }) => <em className="italic">{children}</em>,
    del: ({ children }) => <del className="opacity-80 line-through">{children}</del>,

    a: ({ href, children }) => (
        <a
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            className="font-medium text-accent-primary underline decoration-accent-primary/40 underline-offset-2 transition-colors hover:decoration-accent-primary"
        >
            {children}
        </a>
    ),

    // Inline vs block code. `inline` is provided by react-markdown's code renderer.
    code: ({ className, children, ...props }) => {
        const isBlock = /language-/.test(className ?? "") || String(children).includes("\n");
        if (!isBlock) {
            return (
                <code className="rounded-[5px] bg-twilight-void/80 px-1.5 py-0.5 font-mono text-[0.85em] text-twilight-text ring-1 ring-twilight-border">
                    {children}
                </code>
            );
        }
        return (
            <code className={`block font-mono text-[12.5px] leading-relaxed ${className ?? ""}`} {...props}>
                {children}
            </code>
        );
    },

    pre: ({ children }) => (
        <pre className="my-1.5 overflow-x-auto rounded-xl border border-twilight-border bg-twilight-void/80 px-3 py-2.5 text-twilight-text">
            {children}
        </pre>
    ),

    blockquote: ({ children }) => (
        <blockquote className="my-1.5 border-l-2 border-accent-primary/50 pl-3 text-twilight-text-soft italic">
            {children}
        </blockquote>
    ),

    ul: ({ children }) => <ul className="my-1 ml-1 list-disc space-y-0.5 pl-4 marker:text-twilight-text-muted">{children}</ul>,
    ol: ({ children }) => <ol className="my-1 ml-1 list-decimal space-y-0.5 pl-4 marker:text-twilight-text-muted">{children}</ol>,
    li: ({ children }) => <li className="pl-0.5">{children}</li>,

    // Headings — sized down sensibly so they read as emphasis inside a chat
    // bubble rather than page headings.
    h1: ({ children }) => <h1 className="mt-1.5 mb-0.5 font-display text-[15px] font-semibold text-twilight-text first:mt-0">{children}</h1>,
    h2: ({ children }) => <h2 className="mt-1.5 mb-0.5 font-display text-[14.5px] font-semibold text-twilight-text first:mt-0">{children}</h2>,
    h3: ({ children }) => <h3 className="mt-1.5 mb-0.5 font-display text-[14px] font-semibold text-twilight-text first:mt-0">{children}</h3>,
    h4: ({ children }) => <h4 className="mt-1 mb-0.5 font-display text-[13.5px] font-semibold text-twilight-text-soft first:mt-0">{children}</h4>,

    hr: () => <hr className="my-2 border-twilight-border" />,

    table: ({ children }) => (
        <div className="my-1.5 overflow-x-auto rounded-lg border border-twilight-border">
            <table className="w-full border-collapse text-[12.5px]">{children}</table>
        </div>
    ),
    th: ({ children }) => (
        <th className="border-b border-twilight-border bg-twilight-elevated px-2.5 py-1.5 text-left font-semibold text-twilight-text">
            {children}
        </th>
    ),
    td: ({ children }) => <td className="border-b border-twilight-border/60 px-2.5 py-1.5 text-twilight-text-soft">{children}</td>,
};

function MarkdownImpl({ children }: { children: string }) {
    return (
        <div className="break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
                {children}
            </ReactMarkdown>
        </div>
    );
}

/** Memoized so re-renders during streaming don't re-parse stable messages. */
export const Markdown = memo(MarkdownImpl);
