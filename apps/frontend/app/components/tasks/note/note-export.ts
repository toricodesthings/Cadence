import { toast } from "sonner";

/** Copy and download for notes: the latest local text, always with a visible fallback. */

export async function copyText(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        // Older WebViews and blocked clipboards: the selection route still works.
        try {
            const area = document.createElement("textarea");
            area.value = text;
            area.setAttribute("readonly", "");
            area.style.position = "fixed";
            area.style.opacity = "0";
            document.body.appendChild(area);
            area.select();
            const ok = document.execCommand("copy");
            area.remove();
            return ok;
        } catch {
            return false;
        }
    }
}

/** Copy and say so; a failure names the fallback. */
export function copyNote(text: string, done = "Note copied", failed = "Couldn’t copy") {
    void copyText(text).then((ok) => toast[ok ? "success" : "error"](ok ? done : failed));
}

export function downloadMarkdown(text: string, name: string) {
    const safe = name.trim().replace(/[^\p{L}\p{N}\-_ ]+/gu, "").replace(/\s+/g, "-").slice(0, 60) || "note";
    const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${safe}.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
