import { Bot, ClipboardList, Goal, Feather, Heart, Check, ShieldCheck, type LucideIcon } from "lucide-react";
import { SettingsSection, SettingsRow } from "../layout/SettingsLayout";
import { Input } from "../../primitives";
import { Switch } from "../../primitives";
import { useSettings, useUpdateSettings } from "../../../hooks/core/use-settings";
import { SETTINGS_DEFAULTS, type UserSettings } from "../../../types/settings";
import { cn } from "../../../lib/utils";

const CUSTOM_INSTRUCTIONS_MAX = 600;

type Persona = UserSettings["assistant"]["persona"];
type Tone = UserSettings["assistant"]["tone"];
type Verbosity = UserSettings["assistant"]["verbosity"];

const personaOptions: ReadonlyArray<{
    value: Persona;
    label: string;
    description: string;
    icon: LucideIcon;
}> = [
    { value: "secretary", label: "Secretary", description: "Efficient, low-friction planning partner", icon: ClipboardList },
    { value: "coach", label: "Coach", description: "Warmer and momentum-focused", icon: Goal },
    { value: "minimalist", label: "Minimalist", description: "Lists only, near-zero prose", icon: Feather },
    { value: "companion", label: "Companion", description: "Gentle, high-empathy company", icon: Heart },
];

/**
 * Persona is the single voice control. Selecting one also sets a coherent base
 * tone + length under the hood, so we never expose redundant Tone / Response-length
 * pickers (the Minimalist persona already *is* "terse"). Adaptive tone then shifts
 * delivery under load on top of this.
 */
const PERSONA_REGISTER: Record<Persona, { tone: Tone; verbosity: Verbosity }> = {
    secretary: { tone: "neutral", verbosity: "balanced" },
    coach: { tone: "warm", verbosity: "balanced" },
    minimalist: { tone: "neutral", verbosity: "terse" },
    companion: { tone: "warm", verbosity: "detailed" },
};

export function AssistantTab() {
    const { data: settings } = useSettings();
    const updateSettings = useUpdateSettings();
    const assistant = settings?.assistant ?? SETTINGS_DEFAULTS.assistant;
    const customInstructions = assistant.customInstructions ?? "";
    const assistantName = assistant.assistantName?.trim() || SETTINGS_DEFAULTS.assistant.assistantName;
    const charsNearLimit = customInstructions.length > CUSTOM_INSTRUCTIONS_MAX * 0.9;

    const updateAssistant = (patch: Partial<UserSettings["assistant"]>) => {
        updateSettings.mutate({ assistant: patch });
    };

    const selectPersona = (value: Persona) =>
        updateAssistant({ persona: value, ...PERSONA_REGISTER[value] });

    return (
        <div className="flex flex-col gap-10">
            <div>
                <h2 className="mb-2 flex items-center gap-2 text-2xl font-bold text-twilight-text">
                    <Bot className="h-6 w-6 text-accent-primary" aria-hidden="true" />
                    Cadence Assistant
                </h2>
                <p className="max-w-3xl text-sm leading-relaxed text-twilight-text-soft">
                    Tune how {assistantName} talks, how much initiative {assistantName} takes, and what
                    personal guidance should stay in mind while helping you plan.
                </p>
            </div>

            {/* ── Identity ── */}
            <SettingsSection title="Identity">
                <SettingsRow
                    title="Assistant name"
                    description="The name the assistant uses for itself in conversations."
                >
                    <Input
                        value={assistant.assistantName ?? SETTINGS_DEFAULTS.assistant.assistantName}
                        maxLength={40}
                        onChange={(event) => updateAssistant({ assistantName: event.target.value })}
                        placeholder="Janny"
                    />
                </SettingsRow>

                <SettingsRow
                    title="Your nickname"
                    description="Optional name the assistant can use when addressing you."
                >
                    <Input
                        value={assistant.nickname ?? ""}
                        maxLength={40}
                        onChange={(event) =>
                            updateAssistant({ nickname: event.target.value.trim() ? event.target.value : null })
                        }
                        placeholder="Not set"
                    />
                </SettingsRow>
            </SettingsSection>

            {/* ── Personality ── persona is the single voice control */}
            <SettingsSection title="Personality">
                <fieldset className="flex flex-col gap-3">
                    <legend className="sr-only">Assistant persona</legend>
                    <p className="text-sm leading-relaxed text-twilight-text-soft">
                        Pick a voice. It sets how {assistantName} speaks and how much it says — adaptive
                        tone gently softens it when your workload spikes.
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        {personaOptions.map((option) => {
                            const isActive = assistant.persona === option.value;
                            const Icon = option.icon;
                            return (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => selectPersona(option.value)}
                                    aria-pressed={isActive}
                                    className={cn(
                                        "relative flex min-h-[7.5rem] cursor-pointer flex-col justify-between rounded-[1.4rem] border p-4 text-left transition-all duration-200 active:scale-[0.99]",
                                        isActive
                                            ? "border-accent-primary/40 bg-accent-primary/12 text-twilight-text shadow-[0_0_0_1px_var(--color-accent-primary-soft)]"
                                            : "border-twilight-border bg-twilight-surface/40 text-twilight-text-soft hover:border-twilight-border-interactive hover:bg-twilight-surface-hover/60 hover:text-twilight-text",
                                    )}
                                >
                                    {isActive ? (
                                        <span
                                            className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-accent-primary text-[var(--accent-on-primary)]"
                                            aria-hidden="true"
                                        >
                                            <Check className="h-3 w-3" strokeWidth={3} />
                                        </span>
                                    ) : null}
                                    <span
                                        className={cn(
                                            "flex h-9 w-9 items-center justify-center rounded-full border transition-colors",
                                            isActive
                                                ? "border-accent-primary/30 bg-accent-primary/15 text-accent-primary"
                                                : "border-twilight-border bg-twilight-elevated text-twilight-text-soft",
                                        )}
                                    >
                                        <Icon className="h-4 w-4" aria-hidden="true" />
                                    </span>
                                    <span>
                                        <span className="block text-sm font-semibold">{option.label}</span>
                                        <span className="mt-1 block text-xs leading-relaxed text-twilight-text-muted">
                                            {option.description}
                                        </span>
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </fieldset>
            </SettingsSection>

            {/* ── Behavior ── */}
            <SettingsSection title="Behavior">
                <SettingsRow
                    title="Adaptive tone"
                    description="Let the assistant soften or tighten its tone based on workload and burnout signals."
                >
                    <Switch
                        checked={assistant.adaptiveTone}
                        onCheckedChange={(value) => updateAssistant({ adaptiveTone: value })}
                    />
                </SettingsRow>

                <SettingsRow
                    title="Proactive suggestions"
                    description="Allow the assistant to suggest useful next steps without waiting for an explicit request."
                >
                    <Switch
                        checked={assistant.proactiveSuggestions}
                        onCheckedChange={(value) => updateAssistant({ proactiveSuggestions: value })}
                    />
                </SettingsRow>

                <SettingsRow
                    title="Emoji"
                    description="Let the assistant mirror emoji when you use them. It never leads with them. Interface icons are unaffected."
                >
                    <Switch
                        checked={assistant.emoji}
                        onCheckedChange={(value) => updateAssistant({ emoji: value })}
                    />
                </SettingsRow>

                <SettingsRow
                    title="Memory"
                    description="Let the assistant recall durable preferences across conversations when generating replies."
                >
                    <Switch
                        checked={assistant.memoryEnabled}
                        onCheckedChange={(value) => updateAssistant({ memoryEnabled: value })}
                    />
                </SettingsRow>
            </SettingsSection>

            {/* ── Custom Guidance ── full-width, never a SettingsRow (which caps width) */}
            <SettingsSection title="Custom Guidance">
                <div className="flex w-full flex-col gap-4 rounded-[1.4rem] border border-twilight-border bg-twilight-surface/40 p-4">
                    <div className="flex flex-col gap-1">
                        <h4 className="text-base font-medium text-twilight-text">Personal instructions</h4>
                        <p className="text-sm leading-relaxed text-twilight-text-soft">
                            Added to {assistantName}&rsquo;s context at the start of every conversation to
                            shape its voice, your defaults, and how it breaks work down. It&rsquo;s read as a
                            preference, not a command &mdash; it can&rsquo;t change Cadence&rsquo;s core
                            behavior or override its safety rules.
                        </p>
                    </div>

                    <textarea
                        value={customInstructions}
                        maxLength={CUSTOM_INSTRUCTIONS_MAX}
                        onChange={(event) =>
                            updateAssistant({
                                customInstructions: event.target.value.trim() ? event.target.value : null,
                            })
                        }
                        rows={6}
                        placeholder="Example: Be direct when I'm overcommitted, and help me break vague tasks into calendar-sized steps."
                        className="min-h-[10rem] w-full resize-y rounded-xl border border-twilight-border-light bg-twilight-surface/50 px-3.5 py-3 text-sm leading-relaxed text-twilight-text shadow-sm transition-colors placeholder:text-twilight-text-muted focus-visible:border-accent-primary/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-primary/40"
                    />

                    <div className="flex items-center justify-between gap-3 text-xs text-twilight-text-muted">
                        <span className="inline-flex items-center gap-1.5">
                            <ShieldCheck className="h-3.5 w-3.5 text-accent-primary" aria-hidden="true" />
                            Guides style only &mdash; safety always wins.
                        </span>
                        <span className={cn("tabular-nums", charsNearLimit && "text-feedback-error")}>
                            {customInstructions.length}/{CUSTOM_INSTRUCTIONS_MAX}
                        </span>
                    </div>
                </div>
            </SettingsSection>
        </div>
    );
}
