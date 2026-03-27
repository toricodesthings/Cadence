import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router";
import { Button } from "../../primitives/Button";
import { SettingsSection } from "../layout/SettingsLayout";
import { CADENCE_PUBLIC_VERSION, CADENCE_REPOSITORY_URL } from "../../../lib/constants/app-info";

export function AboutTab() {
    return (
        <div className="flex flex-col gap-10">
            <div className="flex flex-col gap-4">
                <div className="flex items-center gap-4">
                    <img
                        src="/logo.png"
                        alt="Cadence"
                        className="h-14 w-14 rounded-[1.2rem] object-cover shadow-[0_0_22px_color-mix(in_srgb,var(--accent-primary)_14%,transparent)]"
                    />
                    <div className="min-w-0">
                        <h2 className="text-2xl font-bold text-twilight-text">About Cadence</h2>
                        <p className="mt-1 text-sm leading-relaxed text-twilight-text-soft">
                            Calm planning for tasks, habits, and weekly resets.
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2">
                    <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-twilight-text-soft">
                        {CADENCE_PUBLIC_VERSION}
                    </span>
                    <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-twilight-text-soft">
                        Open source
                    </span>
                    <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-twilight-text-soft">
                        No paid plan
                    </span>
                </div>
            </div>

            <SettingsSection title="Product">
                <div className="rounded-[1.4rem] border border-white/[0.04] bg-white/[0.02] p-5">
                    <p className="max-w-xl text-sm leading-7 text-twilight-text-soft">
                        Cadence is built on the principle of being cozy, warm, and focused on the essentials. Cadence was born from a spark, a struggle with day-to-day planning. Every other app I've used just didn't work for me. This app will be something I use every day to keep myself on track, and I hope it can do the same for you. If you're curious about how it works under the hood, found a bug, or want to contribute/have feature suggestions, check out the repository on GitHub. Cadence will always be free and open source. If you find it valuable and want to support the project, the best way is to star the repository and share it with people who might enjoy it. Thanks for being here!
                    </p>

                    <div className="mt-5 flex flex-wrap gap-3">
                        <Button asChild variant="secondary" className="bg-white/5 border-white/10">
                            <a href={CADENCE_REPOSITORY_URL} target="_blank" rel="noreferrer">
                                View repository
                                <ArrowUpRight size={15} aria-hidden="true" />
                            </a>
                        </Button>
                        <Button asChild variant="ghost">
                            <Link to="/changelog">
                                Changelog
                            </Link>
                        </Button>
                        <Button asChild variant="ghost">
                            <Link to="/help-feedback">
                                Help & Feedback
                            </Link>
                        </Button>
                    </div>
                </div>
            </SettingsSection>
        </div>
    );
}
