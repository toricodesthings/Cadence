/**
 * Markdown transform helpers — shared between inline editor and note room.
 */

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

/**
 * Applies a markdown formatting action to a text value given a selection range.
 */
export function applyMarkdownAction(
  value: string,
  start: number,
  end: number,
  action: MarkdownAction,
): TransformResult {
  const selected = value.slice(start, end);
  let nextValue = value;
  let nextStart = start;
  let nextEnd = end;

  switch (action) {
    case "bold": {
      // Toggle: unwrap if already bold
      if (start >= 2 && value.slice(start - 2, start) === "**" && value.slice(end, end + 2) === "**") {
        nextValue = value.slice(0, start - 2) + selected + value.slice(end + 2);
        nextStart = start - 2;
        nextEnd = nextStart + selected.length;
      } else {
        const wrapped = `**${selected || "bold"}**`;
        nextValue = `${value.slice(0, start)}${wrapped}${value.slice(end)}`;
        nextStart = start + 2;
        nextEnd = start + wrapped.length - 2;
      }
      break;
    }
    case "italic": {
      // Toggle: unwrap if already italic (but not bold **)
      const charBefore = start >= 1 ? value[start - 1] : "";
      const charAfter = end < value.length ? value[end] : "";
      const twoBefore = start >= 2 ? value[start - 2] : "";
      const twoAfter = end + 1 < value.length ? value[end + 1] : "";
      if (charBefore === "*" && charAfter === "*" && twoBefore !== "*" && twoAfter !== "*") {
        nextValue = value.slice(0, start - 1) + selected + value.slice(end + 1);
        nextStart = start - 1;
        nextEnd = nextStart + selected.length;
      } else {
        const wrapped = `*${selected || "italic"}*`;
        nextValue = `${value.slice(0, start)}${wrapped}${value.slice(end)}`;
        nextStart = start + 1;
        nextEnd = start + wrapped.length - 1;
      }
      break;
    }
    case "heading": {
      const prefix = selected ? `## ${selected}` : "## Heading";
      nextValue = `${value.slice(0, start)}${prefix}${value.slice(end)}`;
      nextStart = start + 3;
      nextEnd = start + prefix.length;
      break;
    }
    case "bullet-list": {
      const prefix = selected
        ? selected.split("\n").map((line) => `- ${line}`).join("\n")
        : "- List item";
      nextValue = `${value.slice(0, start)}${prefix}${value.slice(end)}`;
      nextStart = start + 2;
      nextEnd = start + prefix.length;
      break;
    }
    case "numbered-list": {
      const prefix = selected
        ? selected.split("\n").map((line, i) => `${i + 1}. ${line}`).join("\n")
        : "1. List item";
      nextValue = `${value.slice(0, start)}${prefix}${value.slice(end)}`;
      nextStart = start + 3;
      nextEnd = start + prefix.length;
      break;
    }
    case "checklist": {
      const prefix = selected
        ? selected.split("\n").map((line) => `- [ ] ${line}`).join("\n")
        : "- [ ] Checklist item";
      nextValue = `${value.slice(0, start)}${prefix}${value.slice(end)}`;
      nextStart = start + 6;
      nextEnd = start + prefix.length;
      break;
    }
    case "link": {
      const prefix = `[${selected || "Link text"}](https://)`;
      nextValue = `${value.slice(0, start)}${prefix}${value.slice(end)}`;
      nextStart = start + 1;
      nextEnd = start + (selected ? selected.length + 1 : 10);
      break;
    }
    case "code": {
      // Toggle: unwrap if already in backticks
      if (start >= 1 && value[start - 1] === "`" && end < value.length && value[end] === "`") {
        nextValue = value.slice(0, start - 1) + selected + value.slice(end + 1);
        nextStart = start - 1;
        nextEnd = nextStart + selected.length;
      } else {
        const prefix = selected ? `\`${selected}\`` : "`code`";
        nextValue = `${value.slice(0, start)}${prefix}${value.slice(end)}`;
        nextStart = start + 1;
        nextEnd = start + prefix.length - 1;
      }
      break;
    }
    case "quote": {
      const prefix = selected
        ? selected.split("\n").map((line) => `> ${line}`).join("\n")
        : "> Quote";
      nextValue = `${value.slice(0, start)}${prefix}${value.slice(end)}`;
      nextStart = start + 2;
      nextEnd = start + prefix.length;
      break;
    }
    case "divider": {
      const prefix = `${start > 0 ? "\n" : ""}\n---\n`;
      nextValue = `${value.slice(0, start)}${prefix}${value.slice(end)}`;
      nextStart = start + prefix.length;
      nextEnd = nextStart;
      break;
    }
  }

  return { value: nextValue, selectionStart: nextStart, selectionEnd: nextEnd };
}

/**
 * Extracts actionable bullet/checklist/numbered lines from markdown.
 * Returns cleaned text suitable for subtask/task creation.
 */
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
        .trim()
    )
    .filter(Boolean);
}

/**
 * Detects lines that look like actionable items (checklist, bullets, numbered).
 */
export function detectConvertibleLines(
  markdown: string,
): { text: string; lineIndex: number; kind: "bullet" | "checklist" | "numbered" }[] {
  if (!markdown) return [];
  const lines = markdown.split("\n");
  const result: { text: string; lineIndex: number; kind: "bullet" | "checklist" | "numbered" }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (/^(-|\*|\+)\s+\[[ x]\]\s+/.test(line)) {
      const text = line.replace(/^(-|\*|\+)\s+\[[ x]\]\s+/, "").trim();
      if (text) result.push({ text, lineIndex: i, kind: "checklist" });
    } else if (/^\d+\.\s+/.test(line)) {
      const text = line.replace(/^\d+\.\s+/, "").trim();
      if (text) result.push({ text, lineIndex: i, kind: "numbered" });
    } else if (/^(-|\*|\+)\s+/.test(line)) {
      const text = line.replace(/^(-|\*|\+)\s+/, "").trim();
      if (text) result.push({ text, lineIndex: i, kind: "bullet" });
    }
  }
  return result;
}
