export function readCaptureDraft(key: string | undefined): string {
    if (!key) return "";
    try {
        return sessionStorage.getItem(key) ?? "";
    } catch {
        return "";
    }
}

export function writeCaptureDraft(key: string, value: string): void {
    try {
        if (value) sessionStorage.setItem(key, value);
        else sessionStorage.removeItem(key);
    } catch {}
}
