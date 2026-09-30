import type { Route } from "./+types/privacy";
import { LegalPage, legalMeta } from "~/components/legal/LegalPage";
import { PRIVACY } from "~/lib/legal/privacy";
import { PRIVACY_PATH, TERMS_PATH } from "~/lib/site";

export const meta: Route.MetaFunction = () => legalMeta(PRIVACY, PRIVACY_PATH);

// Content only changes on deploy.
export const headers: Route.HeadersFunction = () => ({
  "Cache-Control": "public, max-age=300",
});

export default function Privacy() {
  return <LegalPage doc={PRIVACY} eyebrow="Your data" other={{ label: "Read the Terms of Service", href: TERMS_PATH }} />;
}
