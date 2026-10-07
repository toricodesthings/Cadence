// Title building, kept free of chrono/fuse so the domain package can import it without loading the parser.

/** The quoted "literal" segments of `input` (the parsers never read inside them). */
export function quotedSegmentsOf(input: string): Array<{ start: number; end: number; text: string }> {
  return Array.from(input.matchAll(/"([^"]+)"/g), (m) => ({
    start: m.index ?? 0,
    end: (m.index ?? 0) + m[0].length,
    text: m[1],
  }));
}

/** The title left after removing `ranges` from `input`; quotes are dropped, quoted words kept. */
export function cleanTitle(input: string, ranges: Array<{ start: number; end: number }>): string {
  const quoted = quotedSegmentsOf(input);
  const merged: Array<{ start: number; end: number }> = [];
  for (const r of [...ranges].sort((a, b) => a.start - b.start)) {
    if (quoted.some((q) => r.start < q.end && r.end > q.start)) continue;
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else merged.push({ ...r });
  }
  return buildCleanedTitle(input, [...merged, ...quoted], quoted);
}

export function buildCleanedTitle(
  input: string,
  ranges: Array<{ start: number; end: number }>,
  quotedSegments: Array<{ start: number; end: number; text: string }> = [],
): string {
  if (ranges.length === 0 && quotedSegments.length === 0) return input.trim();

  const quotedSet = new Set(quotedSegments.map((s) => `${s.start}:${s.end}`));

  // Sort ranges by start position descending to splice from end
  const sorted = [...ranges].sort((a, b) => b.start - a.start);
  let result = input;
  for (const { start, end } of sorted) {
    const key = `${start}:${end}`;
    if (quotedSet.has(key)) {
      // Quoted segment — strip quotes but keep inner text
      const seg = quotedSegments.find((s) => s.start === start && s.end === end);
      result = result.slice(0, start) + (seg?.text ?? "") + result.slice(end);
    } else {
      result = result.slice(0, start) + " " + result.slice(end);
    }
  }
  // A removed phrase leaves no dangling separator behind ("Call Sam, tomorrow" → "Call Sam").
  return result.replace(/\s+/g, " ").replace(/\s+([,;.!?])/g, "$1").trim().replace(/^[,;:]\s*|\s*[,;:]$/g, "");
}

