import { z } from "zod";

/**
 * The apps a task or routine can open. Stable ids only: labels, initials and destinations live in the frontend
 * catalogue. Retired ids stay here so a saved choice still copies, converts and undoes.
 */
export const APP_LINK_IDS = [
    "myfitnesspal", "gmail", "outlook", "google-calendar", "google-maps", "spotify", "notion", "youtube",
    "apple-mail", "apple-calendar", "apple-maps", "apple-music", "apple-notes", "apple-health", "shortcuts",
    "whatsapp", "slack", "microsoft-teams", "zoom", "obsidian",
] as const;

export const linkedAppIdSchema = z.enum(APP_LINK_IDS);
export type LinkedAppId = z.infer<typeof linkedAppIdSchema>;

const MAX_WEBSITE = 2048;

/**
 * A website a person typed, as the one address Cadence will store and open: https only, no user name or
 * password, a real host name, no spaces or control characters. Anything else is null. A missing scheme
 * gets `https://`; the result is the URL parser's normal form (an international host is punycode).
 */
export function parseWebsite(input: string): string | null {
    const text = input.trim();
    if (!text || text.length > MAX_WEBSITE || /[\s\u0000-\u001f\u007f]/.test(text)) return null;
    let url: URL;
    try {
        url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
    } catch {
        return null;
    }
    const host = url.hostname;
    if (url.protocol !== "https:" || url.username || url.password) return null;
    if (!host.includes(".") || host.startsWith(".") || host.endsWith(".")) return null;
    return url.href.length <= MAX_WEBSITE ? url.href : null;
}

/** A stored website: exactly what `parseWebsite` returns, so the server never keeps a non-https or unnormalised address. */
export const linkedUrlSchema = z.string().max(MAX_WEBSITE).refine((value) => parseWebsite(value) === value, "Use a full https:// address");
