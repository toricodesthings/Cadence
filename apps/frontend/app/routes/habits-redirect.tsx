import { redirect } from "react-router";

export function clientLoader({ request }: { request: Request }) {
    const url = new URL(request.url);
    return redirect(`/routines${url.search}`);
}

export default function HabitsRedirect() {
    return null;
}
