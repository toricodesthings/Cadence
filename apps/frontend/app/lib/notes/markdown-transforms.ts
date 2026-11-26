export type MarkdownAction =
    | "bold"
    | "italic"
    | "heading"
    | "bullet-list"
    | "numbered-list"
    | "checklist"
    | "link"
    | "code"
    | "quote"
    | "divider";

export interface TransformResult {
    value: string;
    selectionStart: number;
    selectionEnd: number;
}

export function applyMarkdownAction(
    value: string,
    start: number,
    end: number,
    action: MarkdownAction,
): TransformResult {
    const selected = value.slice(start, end);
    const insert = (text: string, from: number, to: number): TransformResult => ({
        value: value.slice(0, start) + text + value.slice(end),
        selectionStart: start + from,
        selectionEnd: start + to,
    });
    const unwrap = (n: number): TransformResult => ({
        value: value.slice(0, start - n) + selected + value.slice(end + n),
        selectionStart: start - n,
        selectionEnd: start - n + selected.length,
    });
    const wrap = (mark: string, placeholder: string) => {
        const inner = selected || placeholder;
        return insert(mark + inner + mark, mark.length, mark.length + inner.length);
    };
    const lines = (prefix: (i: number) => string, placeholder: string) => {
        const text = selected
            ? selected
                  .split("\n")
                  .map((line, i) => prefix(i) + line)
                  .join("\n")
            : prefix(0) + placeholder;
        return insert(text, prefix(0).length, text.length);
    };

    switch (action) {
        case "bold":
            return start >= 2 && value.slice(start - 2, start) === "**" && value.slice(end, end + 2) === "**"
                ? unwrap(2)
                : wrap("**", "bold");
        case "italic": {
            const charBefore = start >= 1 ? value[start - 1] : "";
            const charAfter = end < value.length ? value[end] : "";
            const twoBefore = start >= 2 ? value[start - 2] : "";
            const twoAfter = end + 1 < value.length ? value[end + 1] : "";
            return charBefore === "*" && charAfter === "*" && twoBefore !== "*" && twoAfter !== "*"
                ? unwrap(1)
                : wrap("*", "italic");
        }
        case "code":
            return start >= 1 && value[start - 1] === "`" && end < value.length && value[end] === "`"
                ? unwrap(1)
                : wrap("`", "code");
        case "heading": {
            const text = `## ${selected || "Heading"}`;
            return insert(text, 3, text.length);
        }
        case "bullet-list":
            return lines(() => "- ", "List item");
        case "numbered-list":
            return lines((i) => `${i + 1}. `, "List item");
        case "checklist":
            return lines(() => "- [ ] ", "Checklist item");
        case "quote":
            return lines(() => "> ", "Quote");
        case "link": {
            const inner = selected || "Link text";
            return insert(`[${inner}](https://)`, 1, 1 + inner.length);
        }
        case "divider": {
            const text = `${start > 0 ? "\n" : ""}\n---\n`;
            return insert(text, text.length, text.length);
        }
    }
}

export function extractActionableLines(markdown: string): string[] {
    if (!markdown) return [];
    return markdown
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => /^(-|\*|\+|\d+\.)\s+/.test(line))
        .map((line) =>
            line
                .replace(/^(-|\*|\+|\d+\.)\s+/, "")
                .replace(/^\[[ x]\]\s+/, "")
                .trim(),
        )
        .filter(Boolean);
}
