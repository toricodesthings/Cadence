import { cssVars } from "~/lib/geometry";
import { EMILIE } from "~/lib/site";

import { BoughSegment, mobileBoughSide, segmentHeight } from "./BoughSegment";
import { ChapterWords } from "./Chapter";
import { Drift } from "./Drift";
import { Panel } from "./Panel";
import { Sigil } from "./Sigil";

export function Emilie() {
    return (
        <section
            className="jsec emilie"
            data-prev="autumn"
            data-bough-side={mobileBoughSide("emilie")}
            aria-labelledby="chapter-emilie"
            style={cssVars({ "--h": segmentHeight("emilie") })}
        >
            <BoughSegment name="emilie" />
            <Drift kind="mote" />
            <ChapterWords
                copy={EMILIE}
                titleId="chapter-emilie"
                className="emilie-words"
                glintsClassName="chapter-glints emilie-glints"
            />
            <div className="emilie-stage" aria-hidden="true">
                <Sigil className="emilie-sigil reveal" style={cssVars({ "--i": 0 })}>
                    <span className="emilie-core" />
                </Sigil>
                <div className="chapter-panel emilie-panel reveal-panel">
                    <span className="emilie-wire" />
                    <Panel clip="assistant" />
                </div>
            </div>
        </section>
    );
}
