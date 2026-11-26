import { z } from "zod";

export const APP_LINK_IDS = [
    "myfitnesspal",
    "gmail",
    "outlook",
    "google-calendar",
    "google-maps",
    "spotify",
    "notion",
    "youtube",
    "apple-mail",
    "apple-calendar",
    "apple-maps",
    "apple-music",
    "apple-notes",
    "apple-health",
    "shortcuts",
    "whatsapp",
    "slack",
    "microsoft-teams",
    "zoom",
    "obsidian",
] as const;

export const linkedAppIdSchema = z.enum(APP_LINK_IDS);
export type LinkedAppId = z.infer<typeof linkedAppIdSchema>;

const MAX_WEBSITE = 2048;

export function parseWebsite(input: string): string | null {
    const text = input.trim();
    // oxlint-disable-next-line eslint/no-control-regex -- rejecting control characters is the point
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

export const linkedUrlSchema = z
    .string()
    .max(MAX_WEBSITE)
    .refine((value) => parseWebsite(value) === value, "Use a full https:// address");
