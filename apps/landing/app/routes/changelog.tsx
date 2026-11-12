import type { Route } from "./+types/changelog";
import { LegalPage, legalMeta } from "~/components/legal/LegalPage";
import { changelogDoc } from "~/lib/changelog";
import { CHANGELOG_PATH, SIGN_UP_URL } from "~/lib/site";

const DOC = changelogDoc();

export const meta: Route.MetaFunction = () => legalMeta(DOC, CHANGELOG_PATH);

export default function Changelog() {
  const latest = DOC.sections[0]?.blocks[0];
  return (
    <LegalPage
      doc={DOC}
      eyebrow="Release notes"
      inShortTitle={latest?.kind === "sub" ? `Latest · ${latest.title.split(" · ")[0]}` : "Latest"}
      inShortNote="Older releases follow, grouped by version."
      readTime={false}
      other={{ label: "Try Cadence", href: SIGN_UP_URL }}
    />
  );
}
