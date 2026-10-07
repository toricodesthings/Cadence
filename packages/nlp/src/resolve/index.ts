import Fuse from "fuse.js";
import type {
  ParsedEntity,
  ResolutionContext,
  ConfidenceTier,
} from "../core/index.js";

const FUSE_OPTIONS = {
  includeScore: true,
  threshold: 0.4,
  keys: ["name"],
};

/**
 * Fuzzy-resolve project and tag mentions from natural language.
 * Only resolves phrases NOT already consumed by other parsers.
 *
 * Per Section 9: only exact/near-exact matches are high-confidence.
 * Fuzzy matches are medium-confidence max.
 */
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

  // A name only counts after a placement/tagging cue ("in Work", "tag it errands"): plain words never match.
  for (const match of input.matchAll(CUE_RE)) {
    const cueStart = match.index ?? 0;
    const isTag = /^tag/i.test(match[1]);
    const cueEnd = cueStart + match[0].length;
    const after = words.filter((w) => w.start >= cueEnd && !consumedRanges.some((r) => w.start < r.end && w.end > r.start));
    // Longest name first: "Work Admin" beats "Work"
    for (let size = Math.min(3, after.length); size >= 1; size--) {
      const run = after.slice(0, size);
      if (run.some((w, i) => i > 0 && w.start - run[i - 1].end > 1)) continue;
      const phrase = run.map((w) => w.text.replace(/[.,;:!?]+$/, "")).join(" ");
      const best = (isTag ? tagFuse : projectFuse).search(phrase)[0];
      if (!best || (best.score ?? 1) > 0.2) continue;
      const id = `${isTag ? "tag" : "project"}:${best.item.id}`;
      if (dismissed.has(id) || entities.some((e) => e.id === id)) break;
      if (!isTag && entities.some((e) => e.type === "project")) break;

      const confidence: ConfidenceTier = (best.score ?? 0) < 0.05 ? "high" : "medium";
      const last = run[run.length - 1];
      entities.push({
        id,
        type: isTag ? "tag" : "project",
        sourceText: input.slice(cueStart, last.end),
        start: cueStart,
        end: last.end,
        confidence,
        normalizedValue: { id: best.item.id, resolvedId: best.item.id, name: best.item.name },
        explanation:
          confidence === "high"
            ? `${isTag ? "Tag: #" : "List: "}${best.item.name}`
            : `Suggested ${isTag ? "tag: #" : "list: "}${best.item.name}`,
      });
      break;
    }
  }

  return entities;
}

/** "in", "under", "to", "into", "put this in", "tag it", "tagged as", "tag with" */
const CUE_RE = /\b(?:(?:put|move|add)\s+(?:this|it)\s+(?:in|into|to|under)|(tag(?:ged)?(?:\s+(?:it|this))?(?:\s+(?:as|with))?)|in|into|under)\s+(?=\S)/gi;

interface WordPosition {
  text: string;
  start: number;
  end: number;
}

function extractUnconsumedWords(
  input: string,
  consumedRanges: Array<{ start: number; end: number }>,
): WordPosition[] {
  const words: WordPosition[] = [];
  const wordRegex = /\S+/g;
  let match: RegExpExecArray | null;

  while ((match = wordRegex.exec(input)) !== null) {
    const start = match.index;
    const end = start + match[0].length;

    // Skip if this word overlaps with any consumed range
    const overlaps = consumedRanges.some(
      (r) => start < r.end && end > r.start,
    );
    if (overlaps) continue;

    // Skip shorthand tokens (#tag, /project, p1-p4)
    if (/^[#/]/.test(match[0])) continue;
    if (/^p[1-4]$/i.test(match[0])) continue;

    words.push({ text: match[0], start, end });
  }

  return words;
}
