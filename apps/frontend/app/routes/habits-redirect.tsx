import { redirect } from "react-router";

/** `/habits` was renamed to `/routines`; keep old links and bookmarks working. */
export function clientLoader({ request }: { request: Request }) {
    const url = new URL(request.url);
    return redirect(`/routines${url.search}`);
}

export default function HabitsRedirect() {
    return null;
}
