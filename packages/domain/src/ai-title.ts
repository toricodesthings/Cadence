export const TITLE_MAX_CHARS = 48;
export const TITLE_MAX_WORDS = 6;

export const UNTITLED_CONVERSATION = "New conversation";

export const PHOTO_CONVERSATION = "Photo";

function upperFirst(s: string): string {
    return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1);
}

function clamp(text: string): string {
    const byWords = text.split(" ").slice(0, TITLE_MAX_WORDS).join(" ");
    if (byWords.length <= TITLE_MAX_CHARS) {
        return byWords.length < text.length ? `${byWords}…` : byWords;
    }
    return `${byWords.slice(0, TITLE_MAX_CHARS).trimEnd()}…`;
}

export function deriveFallbackTitle(text: string, hasImages = false): string {
    const clean = text.replace(/\s+/g, " ").trim();
    if (!clean) return hasImages ? PHOTO_CONVERSATION : UNTITLED_CONVERSATION;
    return upperFirst(clamp(clean));
}

export function normalizeTitle(raw: string): string {
    const stripped = raw
        .replace(/\s+/g, " ")
        .trim()
        .replace(/^["'`“”]+|["'`“”]+$/g, "")
        .replace(/[.,;:!?]+$/g, "")
        .trim();
    if (!stripped) return "";
    return clamp(stripped);
}
