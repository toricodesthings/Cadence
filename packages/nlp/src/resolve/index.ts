import Fuse from "fuse.js";
import type { ParsedEntity, ResolutionContext, ConfidenceTier } from "../core/index.js";

const FUSE_OPTIONS = {
    includeScore: true,
    threshold: 0.4,
    keys: ["name"],
};

export function resolveProjectsAndTags(
    input: string,
    context: ResolutionContext,
    consumedRanges: Array<{ start: number; end: number }>,
    dismissed: Set<string>,
): ParsedEntity[] {
    const entities: ParsedEntity[] = [];
    const words = extractUnconsumedWords(input, consumedRanges);
    if (words.length === 0) return entities;

    const projectFuse = new Fuse(context.projects, FUSE_OPTIONS);
    const tagFuse = new Fuse(context.tags, FUSE_OPTIONS);

    for (const match of input.matchAll(CUE_RE)) {
        const entity = resolveCue(input, match, { words, consumedRanges, dismissed, entities, projectFuse, tagFuse });
        if (entity) entities.push(entity);
    }

    return entities;
}

type CueScope = {
    words: WordPosition[];
    consumedRanges: Array<{ start: number; end: number }>;
    dismissed: Set<string>;
    entities: ParsedEntity[];
    projectFuse: Fuse<ResolutionContext["projects"][number]>;
    tagFuse: Fuse<ResolutionContext["tags"][number]>;
};

function resolveCue(input: string, match: RegExpMatchArray, scope: CueScope): ParsedEntity | null {
    const { words, consumedRanges, dismissed, entities, projectFuse, tagFuse } = scope;
    const cueStart = match.index ?? 0;
    const isTag = /^tag/i.test(match[1]);
    const cueEnd = cueStart + match[0].length;
    const after = words.filter(
        (w) => w.start >= cueEnd && !consumedRanges.some((r) => w.start < r.end && w.end > r.start),
    );
    for (let size = Math.min(3, after.length); size >= 1; size--) {
        const run = after.slice(0, size);
        if (run.some((w, i) => i > 0 && w.start - run[i - 1].end > 1)) continue;
        const phrase = run.map((w) => w.text.replace(/[.,;:!?]+$/, "")).join(" ");
        const best = (isTag ? tagFuse : projectFuse).search(phrase)[0];
        if (!best || (best.score ?? 1) > 0.2) continue;
        const id = `${isTag ? "tag" : "project"}:${best.item.id}`;
        if (dismissed.has(id) || entities.some((e) => e.id === id)) return null;
        if (!isTag && entities.some((e) => e.type === "project")) return null;
        return cueEntity(input, {
            id,
            isTag,
            cueStart,
            end: run[run.length - 1].end,
            item: best.item,
            score: best.score ?? 0,
        });
    }
    return null;
}

function cueEntity(
    input: string,
    found: {
        id: string;
        isTag: boolean;
        cueStart: number;
        end: number;
        item: { id: string; name: string };
        score: number;
    },
): ParsedEntity {
    const { id, isTag, cueStart, end, item } = found;
    const confidence: ConfidenceTier = found.score < 0.05 ? "high" : "medium";
    const label =
        confidence === "high"
            ? `${isTag ? "Tag: #" : "List: "}${item.name}`
            : `Suggested ${isTag ? "tag: #" : "list: "}${item.name}`;
    return {
        id,
        type: isTag ? "tag" : "project",
        sourceText: input.slice(cueStart, end),
        start: cueStart,
        end,
        confidence,
        normalizedValue: { id: item.id, resolvedId: item.id, name: item.name },
        explanation: label,
    };
}

const CUE_RE =
    /\b(?:(?:put|move|add)\s+(?:this|it)\s+(?:in|into|to|under)|(tag(?:ged)?(?:\s+(?:it|this))?(?:\s+(?:as|with))?)|in|into|under)\s+(?=\S)/gi;

interface WordPosition {
    text: string;
    start: number;
    end: number;
}

function extractUnconsumedWords(input: string, consumedRanges: Array<{ start: number; end: number }>): WordPosition[] {
    const words: WordPosition[] = [];
    const wordRegex = /\S+/g;
    let match: RegExpExecArray | null;

    while ((match = wordRegex.exec(input)) !== null) {
        const start = match.index;
        const end = start + match[0].length;

        const overlaps = consumedRanges.some((r) => start < r.end && end > r.start);
        if (overlaps) continue;

        if (/^[#/]/.test(match[0])) continue;
        if (/^p[1-4]$/i.test(match[0])) continue;

        words.push({ text: match[0], start, end });
    }

    return words;
}
