import type { Route } from "./+types/terms";
import { LegalPage, legalMeta } from "~/components/legal/LegalPage";
import { TERMS } from "~/lib/legal/terms";
import { PRIVACY_PATH, TERMS_PATH } from "~/lib/site";

export const meta: Route.MetaFunction = () => legalMeta(TERMS, TERMS_PATH);

// Content only changes on deploy.
export const headers: Route.HeadersFunction = () => ({
  "Cache-Control": "public, max-age=300",
});

export default function Terms() {
  return <LegalPage doc={TERMS} eyebrow="The agreement" other={{ label: "Read the Privacy Policy", href: PRIVACY_PATH }} />;
}
