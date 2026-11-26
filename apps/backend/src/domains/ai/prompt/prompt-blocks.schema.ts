import type { ApprovalMode, ChatSurface } from "@cadence/contracts/ai";
import type { UserSettings } from "@cadence/contracts/settings";
import type { ProfileLine } from "../memory/memory-store";

type AssistantSettings = NonNullable<UserSettings["assistant"]>;
export type Voice = NonNullable<AssistantSettings["persona"]>;

export interface PromptBlocks {
    base: string[];
    memoryPolicy: string;
    voices: Record<Voice, string>;
    workloadHigh: string;
    customInstructions: string;
    environment: string;
    snapshot: string;
    surfaces: Record<ChatSurface, string>;
    weekAhead: string;
    memoryFacts: string;
    memoryFact: string;
    memoryOff: string;
}

export type AssistantPersona = Required<AssistantSettings>;

export interface PromptRuntimeContext {
    timezone: string;
    now: string;
    locale: string;
    weekStart: "Sunday" | "Monday" | "Saturday";
    approvalMode: ApprovalMode;
    workloadHigh: boolean;
    persona: AssistantPersona;
    snapshot?: string;
    surface?: ChatSurface;
    weekAhead?: string;
    memories?: ProfileLine[];
    memoryOff?: boolean;
}
