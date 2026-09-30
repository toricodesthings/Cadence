import { redirect } from "react-router";
import { CADENCE_PRIVACY_URL, CADENCE_TERMS_URL } from "../lib/constants/app-info";

/** The terms and privacy policy moved to the landing site; old links and bookmarks follow them there. */
export function clientLoader({ request }: { request: Request }) {
    const { pathname } = new URL(request.url);
    return redirect(pathname.startsWith("/terms") ? CADENCE_TERMS_URL : CADENCE_PRIVACY_URL);
}

export default function LegalRedirect() {
    return null;
}
