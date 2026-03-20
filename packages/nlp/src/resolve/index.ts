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

  // Build word sequences from unconsumed portions of input
  const words = extractUnconsumedWords(input, consumedRanges);
  if (words.length === 0) return entities;

  // Try fuzzy project matching
  if (context.projects.length > 0) {
    const projectFuse = new Fuse(context.projects, FUSE_OPTIONS);

    // Try 2-word and 1-word sequences for project names
    for (let windowSize = Math.min(3, words.length); windowSize >= 1; windowSize--) {
      for (let i = 0; i <= words.length - windowSize; i++) {
        const phrase = words
          .slice(i, i + windowSize)
          .map((w) => w.text)
          .join(" ");
        const results = projectFuse.search(phrase);

        if (results.length === 0) continue;
        const best = results[0];
        if (!best.score || best.score > 0.3) continue; // Too fuzzy

        const projectId = `project:${best.item.id}`;
        if (dismissed.has(projectId)) continue;
        if (entities.some((e) => e.type === "project")) continue; // One project only

        const confidence: ConfidenceTier =
          best.score < 0.05 ? "high" : "medium";

        const startWord = words[i];
        const endWord = words[i + windowSize - 1];

        entities.push({
          id: projectId,
          type: "project",
          sourceText: phrase,
          start: startWord.start,
          end: endWord.end,
          confidence,
          normalizedValue: { id: best.item.id, resolvedId: best.item.id, name: best.item.name },
          explanation:
            confidence === "high"
              ? `Project: ${best.item.name}`
              : `Suggested project: ${best.item.name}`,
        });
      }
    }
  }

  // Try fuzzy tag matching
  if (context.tags.length > 0) {
    const tagFuse = new Fuse(context.tags, FUSE_OPTIONS);

    for (const word of words) {
      const results = tagFuse.search(word.text);
      if (results.length === 0) continue;
      const best = results[0];
      if (!best.score || best.score > 0.2) continue;

      const tagId = `tag:${best.item.id}`;
      if (dismissed.has(tagId)) continue;
      if (entities.some((e) => e.id === tagId)) continue;

      const confidence: ConfidenceTier =
        best.score < 0.05 ? "high" : "medium";

      entities.push({
        id: tagId,
        type: "tag",
        sourceText: word.text,
        start: word.start,
        end: word.end,
        confidence,
        normalizedValue: { id: best.item.id, resolvedId: best.item.id, name: best.item.name },
        explanation:
          confidence === "high"
            ? `Tag: #${best.item.name}`
            : `Suggested tag: #${best.item.name}`,
      });
    }
  }

  return entities;
}

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
