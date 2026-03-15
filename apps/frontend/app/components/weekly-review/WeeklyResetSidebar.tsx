import { CheckCircle, ArrowLeft, Sparkles, Inbox, ListTodo, Clock, Flame, Sprout } from "lucide-react";
import { Button } from "../primitives/Button";
import { toISODate } from "../../lib/utils/date-format";

export const STEPS = [
    { id: "intro", title: "Welcome", icon: Sparkles, desc: "Begin your reset" },
    { id: "inbox", title: "Inbox Zero", icon: Inbox, desc: "Process thoughts" },
    { id: "unscheduled", title: "Unscheduled", icon: ListTodo, desc: "Assign dates" },
    { id: "waiting", title: "Waiting", icon: Clock, desc: "Review backlog" },
    { id: "habits", title: "Habit Checks", icon: Flame, desc: "Review progress" },
    { id: "ready", title: "Ready", icon: Sprout, desc: "Start fresh" },
] as const;

export function WeeklyResetSidebar({ currentStep, compact = false }: { currentStep: number; compact?: boolean }) {
    return (
        <div className={`${compact ? "w-[240px]" : "w-[280px]"} flex shrink-0 flex-col border-r border-twilight-border bg-twilight-surface/30 py-8 backdrop-blur-3xl relative overflow-hidden transition-all duration-500 z-50 shadow-2xl shadow-black/20`}>
            {/* Brand */}
            <div className="mb-12 flex items-center justify-start gap-4 px-6">
                <img src="/logo.png" alt="Cadence" className="h-10 w-10 rounded-2xl object-cover shadow-[0_0_18px_rgba(232,164,74,0.12)]" />
                <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-twilight-text-soft">Cadence</p>
                    <span className="font-display font-semibold text-lg text-twilight-text tracking-wide whitespace-nowrap">
                        Weekly Reset
                    </span>
                </div>
            </div>

            {/* Steps */}
            <div className="flex-1 space-y-5 px-6">
                {STEPS.map((step, idx) => {
                    const isActive = idx === currentStep;
                    const isPast = idx < currentStep;
                    const Icon = step.icon;

                    return (
                        <div key={step.id} className="relative flex items-center justify-start group">
                            {/* Connector line */}
                            {idx !== STEPS.length - 1 && (
                                <div className={`absolute left-[21px] top-12 h-10 w-px transition-colors duration-500 ${isPast ? "bg-lantern/50" : "bg-twilight-border/30"}`} />
                            )}

                            <div className={`h-11 w-11 rounded-full flex items-center justify-center border-2 transition-all duration-500 z-10 shrink-0 ${isActive
                                ? "border-lantern text-lantern bg-lantern/10 shadow-[0_0_20px_rgba(232,164,74,0.3)] scale-110"
                                : isPast
                                    ? "border-lantern/40 text-lantern/60 bg-twilight-surface"
                                    : "border-twilight-border text-twilight-text-muted bg-twilight-deep"
                                }`}>
                                {isPast ? <CheckCircle size={18} className="text-lantern" /> : <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />}
                            </div>

                            <div className="ml-5">
                                <h3 className={`font-medium transition-colors duration-300 ${isActive ? "text-twilight-text" : isPast ? "text-twilight-text-soft" : "text-twilight-text-soft"}`}>
                                    {step.title}
                                </h3>
                                <p className={`text-[12px] transition-colors duration-300 ${isActive ? "text-twilight-text-muted" : "hidden"}`}>
                                    {step.desc}
                                </p>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Skip & Exit */}
            <div className="mt-auto px-4 lg:px-6">
                <Button
                    variant="ghost"
                    size="md"
                    onClick={() => {
                        localStorage.setItem("cadence_last_weekly_reset", toISODate(new Date()));
                        window.location.href = "/";
                    }}
                    aria-label="Exit weekly reset"
                    className="w-full justify-start gap-3 whitespace-nowrap"
                >
                    <ArrowLeft size={16} />
                    <span>Skip &amp; Exit</span>
                </Button>
            </div>
        </div>
    );
}
