import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
    Database, ChevronDown, ChevronRight, Sparkles, Trash2, BellRing, CheckCircle2, Info, TriangleAlert, CircleAlert,
    LoaderCircle, CalendarClock, Flower2, Sun, Leaf, Snowflake,
} from "lucide-react";
import * as DropdownMenu from "../primitives/DropdownMenu";
import * as AlertDialog from "../primitives/AlertDialog";
import { Tip } from "../primitives";
import { Button } from "../primitives/Button";
import { useApiClient } from "../../hooks/auth/use-api-client";
import { hardRefreshWorkspaceCaches } from "../../lib/api/workspace-cache";
import type { Season } from "../../lib/themes/season";

/** Loading-screen previews in the dev tools; no season means the real one (date or theme preset). */
const LOADING_PREVIEWS: readonly { season?: Season; label: string; icon: typeof Sun; iconClassName: string }[] = [
    { label: "Current", icon: CalendarClock, iconClassName: "text-twilight-text-soft" },
    { season: "spring", label: "Spring", icon: Flower2, iconClassName: "text-pink-300" },
    { season: "summer", label: "Summer", icon: Sun, iconClassName: "text-amber-300" },
    { season: "autumn", label: "Autumn", icon: Leaf, iconClassName: "text-orange-400" },
    { season: "winter", label: "Winter", icon: Snowflake, iconClassName: "text-sky-300" },
];

/** The icon rail's developer tools (admins only): seed or wipe the workspace, preview toasts and loading scenes. */
export function DeveloperTools() {
    const api = useApiClient();
    const queryClient = useQueryClient();
    const [isLoading, setIsLoading] = useState(false);

    // Dialog states
    const [wipeConfirmOpen, setWipeConfirmOpen] = useState(false);

    const handleSeedData = async () => {
        setIsLoading(true);
        try {
            await toast.promise(
                async () => {
                    const res = await api.api.debug.seed.$post();
                    if (!res.ok) throw new Error("Failed to seed data");
                    await hardRefreshWorkspaceCaches(queryClient);
                },
                {
                    loading: "Injecting test data...",
                    success: "Test data injected successfully!",
                    error: "Failed to inject data.",
                }
            );
        } finally {
            setIsLoading(false);
        }
    };

    const handleClearData = async () => {
        setIsLoading(true);
        try {
            await toast.promise(
                async () => {
                    const res = await api.api.debug.clear.$post();
                    if (!res.ok) throw new Error("Failed to clear data");
                    await hardRefreshWorkspaceCaches(queryClient);
                },
                {
                    loading: "Wiping database...",
                    success: "Workspace wiped. Account kept intact.",
                    error: "Failed to wipe data.",
                }
            );
        } finally {
            setWipeConfirmOpen(false);
            setIsLoading(false);
        }
    };

    const handlePreviewToast = (kind: "default" | "success" | "info" | "warning" | "error" | "loading") => {
        toast.dismiss();

        switch (kind) {
            case "default":
                toast.message("Default toast", {
                    description: "Neutral Cadence surface with the animated progress border.",
                });
                return;
            case "success":
                toast.success("Success toast", {
                    description: "Use this for saved changes, completed actions, and confirmations.",
                });
                return;
            case "info":
                toast.info("Info toast", {
                    description: "Good for ambient updates that do not need immediate action.",
                });
                return;
            case "warning":
                toast.warning("Warning toast", {
                    description: "Previewing action and cancel pills on the warning variant.",
                    action: {
                        label: "Review",
                        onClick: () => undefined,
                    },
                    cancel: {
                        label: "Later",
                        onClick: () => undefined,
                    },
                    duration: 6500,
                });
                return;
            case "error":
                toast.error("Error toast", {
                    description: "Use for failed mutations, sync issues, and blocked flows.",
                });
                return;
            case "loading":
                toast.loading("Loading toast", {
                    description: "Loading toasts keep the progress border hidden while work is in flight.",
                });
        }
    };

    const devToolTiles = [
        {
            key: "seed",
            label: "Seed",
            meta: "Data",
            icon: Sparkles,
            iconClassName: "text-accent-primary",
            surfaceClassName: "border-accent-primary/18 bg-accent-primary/[0.08] shadow-[0_0_24px_color-mix(in_srgb,var(--accent-primary)_8%,transparent)]",
            action: () => {
                void handleSeedData();
            },
        },
        {
            key: "default",
            label: "Default",
            meta: "Toast",
            icon: BellRing,
            iconClassName: "text-twilight-text-soft",
            surfaceClassName: "border-white/10 bg-white/[0.035]",
            action: () => handlePreviewToast("default"),
        },
        {
            key: "loading_screen",
            label: "Loading",
            meta: "Screen",
            icon: Sparkles,
            iconClassName: "text-blue-400",
            surfaceClassName: "border-blue-500/20 bg-blue-500/10",
            action: () => {
                window.dispatchEvent(new CustomEvent("debug:loading"));
            },
        },
        {
            key: "success",
            label: "Success",
            meta: "Toast",
            icon: CheckCircle2,
            iconClassName: "text-feedback-success",
            surfaceClassName: "border-feedback-success/18 bg-feedback-success/[0.08]",
            action: () => handlePreviewToast("success"),
        },
        {
            key: "info",
            label: "Info",
            meta: "Toast",
            icon: Info,
            iconClassName: "text-moonlit",
            surfaceClassName: "border-moonlit/18 bg-moonlit/[0.08]",
            action: () => handlePreviewToast("info"),
        },
        {
            key: "warning",
            label: "Warning",
            meta: "Toast",
            icon: TriangleAlert,
            iconClassName: "text-accent-primary",
            surfaceClassName: "border-accent-primary/18 bg-accent-primary/[0.08]",
            action: () => handlePreviewToast("warning"),
        },
        {
            key: "error",
            label: "Error",
            meta: "Toast",
            icon: CircleAlert,
            iconClassName: "text-feedback-error",
            surfaceClassName: "border-feedback-error/18 bg-feedback-error/[0.08]",
            action: () => handlePreviewToast("error"),
        },
        {
            key: "loading",
            label: "Loading",
            meta: "Toast",
            icon: LoaderCircle,
            iconClassName: "text-moonlit",
            surfaceClassName: "border-moonlit/18 bg-moonlit/[0.08]",
            action: () => handlePreviewToast("loading"),
        },
        {
            key: "wipe",
            label: "Wipe",
            meta: "Workspace",
            icon: Trash2,
            iconClassName: "text-feedback-error",
            surfaceClassName: "border-feedback-error/18 bg-feedback-error/[0.08] shadow-[0_0_24px_rgba(217,119,86,0.08)]",
            action: () => setWipeConfirmOpen(true),
        },
    ] as const;

    return (
        <>
            {/* Developer Tools */}
            <div className="w-[40%] h-px bg-twilight-border my-0.5 rounded-full opacity-50" aria-hidden="true" />

            <AlertDialog.Root open={wipeConfirmOpen} onOpenChange={setWipeConfirmOpen}>
                <DropdownMenu.Root>
                    <Tip label={isLoading ? "Working..." : "Developer tools"}>
                        <DropdownMenu.Trigger asChild>
                            <button
                                disabled={isLoading}
                                aria-label="Developer tools"
                                className="btn-icon relative rounded-2xl text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 disabled:opacity-50 outline-none"
                            >
                                <Database size={18} aria-hidden="true" />
                                <ChevronDown
                                    size={11}
                                    aria-hidden="true"
                                    className="absolute bottom-1.5 right-1.5 text-current/70"
                                />
                            </button>
                        </DropdownMenu.Trigger>
                    </Tip>

                    <DropdownMenu.Content
                        side="right"
                        align="center"
                        sideOffset={14}
                        className="w-[340px] p-2.5"
                    >
                        <div className="px-1.5 pb-3 pt-1">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-twilight-text-soft">
                                Developer Tools
                            </p>
                            <p className="mt-1 text-xs leading-relaxed text-twilight-text-muted">
                                Workspace utilities and toast previews, arranged like a compact launchpad.
                            </p>
                        </div>

                        <div className="grid grid-cols-4 gap-2">
                            {devToolTiles.map(({ key, label, meta, icon: Icon, iconClassName, surfaceClassName, action }) => {
                                const tileClassName = `
                                    group relative min-h-[88px] rounded-[1.35rem] border p-0 text-left
                                    backdrop-blur-xl transition-[transform,border-color,background-color,box-shadow]
                                    data-[disabled]:pointer-events-none data-[disabled]:opacity-50
                                    data-[highlighted]:-translate-y-0.5 data-[highlighted]:border-white/16
                                    data-[highlighted]:bg-white/[0.05]
                                    ${surfaceClassName}
                                `;
                                const body = (
                                    <div className="flex h-full flex-col items-center justify-center gap-2.5 px-2 py-3 text-center">
                                        <div
                                            className={`
                                                flex size-10 items-center justify-center rounded-[1rem] border border-white/8
                                                bg-twilight-void/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]
                                                ${iconClassName}
                                            `}
                                        >
                                            <Icon
                                                size={16}
                                                aria-hidden="true"
                                                className={key === "loading" ? "animate-spin" : undefined}
                                            />
                                        </div>
                                        <div className="space-y-0.5">
                                            <p className="text-[11px] font-medium leading-none text-twilight-text">
                                                {label}
                                            </p>
                                            <p className="text-[9px] uppercase tracking-[0.18em] text-twilight-text-muted">
                                                {meta}
                                            </p>
                                        </div>
                                    </div>
                                );

                                // Loading screen: opens a season picker instead of firing straight away.
                                if (key === "loading_screen") {
                                    return (
                                        <DropdownMenu.Sub key={key}>
                                            <DropdownMenu.SubTrigger
                                                disabled={isLoading}
                                                className={`${tileClassName} data-[state=open]:border-white/16 data-[state=open]:bg-white/[0.05]`}
                                            >
                                                {body}
                                                <ChevronRight size={11} aria-hidden="true" className="absolute right-2 top-2 text-twilight-text-muted" />
                                            </DropdownMenu.SubTrigger>
                                            <DropdownMenu.Portal>
                                                <DropdownMenu.SubContent sideOffset={10} className="w-[168px] p-1.5">
                                                    <p className="px-2 pb-1.5 pt-1 text-[9px] font-semibold uppercase tracking-[0.2em] text-twilight-text-muted">
                                                        Preview season
                                                    </p>
                                                    {LOADING_PREVIEWS.map(({ season, label: seasonLabel, icon: SeasonIcon, iconClassName: seasonIconClass }) => (
                                                        <DropdownMenu.Item
                                                            key={seasonLabel}
                                                            onSelect={() => {
                                                                window.dispatchEvent(new CustomEvent("debug:loading", { detail: season ? { season } : undefined }));
                                                            }}
                                                            className="flex items-center gap-2.5 px-2 py-2 text-[13px]"
                                                        >
                                                            <SeasonIcon size={14} aria-hidden="true" className={seasonIconClass} />
                                                            {seasonLabel}
                                                        </DropdownMenu.Item>
                                                    ))}
                                                    <p className="px-2 pb-1 pt-1.5 text-[10px] text-twilight-text-muted">Esc to close</p>
                                                </DropdownMenu.SubContent>
                                            </DropdownMenu.Portal>
                                        </DropdownMenu.Sub>
                                    );
                                }

                                return (
                                    <DropdownMenu.Item
                                        key={key}
                                        disabled={isLoading}
                                        onSelect={(event) => {
                                            if (isLoading) {
                                                event.preventDefault();
                                                return;
                                            }
                                            action();
                                        }}
                                        className={tileClassName}
                                    >
                                        {body}
                                    </DropdownMenu.Item>
                                );
                            })}
                        </div>
                    </DropdownMenu.Content>
                </DropdownMenu.Root>

                <AlertDialog.Content>
                    <AlertDialog.Header>
                        <AlertDialog.Title>Wipe all test workspace data?</AlertDialog.Title>
                        <AlertDialog.Description>
                            This deletes every user-scoped record except the `users` table entry and its saved settings.
                            Lists, tasks, habits, inbox items, sections, tags, metrics, and AI memory will all be removed.
                        </AlertDialog.Description>
                    </AlertDialog.Header>
                    <AlertDialog.Footer>
                        <AlertDialog.Cancel asChild>
                            <Button variant="secondary" size="md">
                                Cancel
                            </Button>
                        </AlertDialog.Cancel>
                        <AlertDialog.Action asChild>
                            <Button
                                variant="danger"
                                size="md"
                                onClick={() => {
                                    void handleClearData();
                                }}
                            >
                                Wipe workspace
                            </Button>
                        </AlertDialog.Action>
                    </AlertDialog.Footer>
                </AlertDialog.Content>
            </AlertDialog.Root>
        </>
    );
}
