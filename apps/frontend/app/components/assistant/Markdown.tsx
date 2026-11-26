import { memo, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { useNavigate } from "react-router";
import { ArrowRight } from "lucide-react";
import { useUtilityNavigation } from "../../hooks/ui/use-utility-navigation";
import { useStepOutOfAssistant } from "../../hooks/ai/use-step-out-of-assistant";

export function isInAppPath(href: string): boolean {
    return href.startsWith("/") && !href.startsWith("//") && !href.startsWith("/\\");
}

const LINK_CLASS =
    "font-medium text-accent-primary underline decoration-accent-primary/40 underline-offset-2 transition-colors hover:decoration-accent-primary";

function textOf(node: ReactNode): string {
    if (typeof node === "string" || typeof node === "number") return String(node);
    if (Array.isArray(node)) return node.map(textOf).join("");
    if (node && typeof node === "object" && "props" in node)
        return textOf((node.props as { children?: ReactNode }).children);
    return "";
}

export function hiddenHost(href: string, text: string): string | null {
    try {
        const host = new URL(href).hostname.replace(/^www\./, "");
        return host && !text.toLowerCase().includes(host.toLowerCase()) ? host : null;
    } catch {
        return null;
    }
}

function AssistantLink({ href = "", children }: { href?: string; children?: ReactNode }) {
    const navigate = useNavigate();
    const { openSettings } = useUtilityNavigation();
    const stepOut = useStepOutOfAssistant();
    const settingsTab = href.startsWith("?settings=") ? new URLSearchParams(href).get("settings") : null;

    if (!settingsTab && !isInAppPath(href)) {
        const host = hiddenHost(href, textOf(children));
        return (
            <>
                <a href={href} target="_blank" rel="noreferrer noopener" className={LINK_CLASS}>
                    {children}
                </a>
                {host && <span className="text-twilight-text-muted"> ({host})</span>}
            </>
        );
    }

    return (
        <a
            href={href}
            className={`${LINK_CLASS} inline-flex items-baseline gap-0.5`}
            onClick={(e) => {
                e.preventDefault();
                stepOut();
                if (settingsTab) openSettings(settingsTab);
                else navigate(href);
            }}
        >
            {children}
            <ArrowRight size={11} className="self-center opacity-70" aria-hidden />
        </a>
    );
}

const components: Components = {
    p: ({ children }) => <p className="my-0.5 first:mt-0 last:mb-0">{children}</p>,

    strong: ({ children }) => <strong className="font-semibold text-twilight-text">{children}</strong>,
    em: ({ children }) => <em className="italic">{children}</em>,
    del: ({ children }) => <del className="opacity-80 line-through">{children}</del>,

    a: ({ href, children }) => <AssistantLink href={href}>{children}</AssistantLink>,

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

    ul: ({ children }) => (
        <ul className="my-1 ml-1 list-disc space-y-0.5 pl-4 marker:text-twilight-text-muted">{children}</ul>
    ),
    ol: ({ children }) => (
        <ol className="my-1 ml-1 list-decimal space-y-0.5 pl-4 marker:text-twilight-text-muted">{children}</ol>
    ),
    li: ({ children }) => <li className="pl-0.5">{children}</li>,

    h1: ({ children }) => (
        <h1 className="mt-1.5 mb-0.5 font-display text-[15px] font-semibold text-twilight-text first:mt-0">
            {children}
        </h1>
    ),
    h2: ({ children }) => (
        <h2 className="mt-1.5 mb-0.5 font-display text-[14.5px] font-semibold text-twilight-text first:mt-0">
            {children}
        </h2>
    ),
    h3: ({ children }) => (
        <h3 className="mt-1.5 mb-0.5 font-display text-[14px] font-semibold text-twilight-text first:mt-0">
            {children}
        </h3>
    ),
    h4: ({ children }) => (
        <h4 className="mt-1 mb-0.5 font-display text-[13.5px] font-semibold text-twilight-text-soft first:mt-0">
            {children}
        </h4>
    ),

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
    td: ({ children }) => (
        <td className="border-b border-twilight-border/60 px-2.5 py-1.5 text-twilight-text-soft">{children}</td>
    ),
};

function MarkdownImpl({ children }: { children: string }) {
    return (
        <div className="break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} disallowedElements={["img"]}>
                {children}
            </ReactMarkdown>
        </div>
    );
}

export const Markdown = memo(MarkdownImpl);
