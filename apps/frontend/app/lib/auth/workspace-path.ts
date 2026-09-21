const WORKSPACE_PREFIXES = ["/", "/today", "/schedule", "/events", "/upcoming", "/completed", "/trash", "/project", "/routines", "/weekly-review"];

export function isWorkspacePath(pathname: string) {
    return WORKSPACE_PREFIXES.some((prefix) =>
        prefix === "/" ? pathname === "/" : pathname === prefix || pathname.startsWith(`${prefix}/`),
    );
}
