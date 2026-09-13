import { useNavigate } from "react-router";
import { LocateFixed, MapPin, X } from "lucide-react";
import { useUserLocation } from "../../hooks/environment/use-user-location";

/**
 * A one-time, non-blocking note that weather and holidays use an approximate
 * location. Every button here, closing it included, is saved to settings, so it
 * never comes back on this device or any other.
 */
export function LocationNotice() {
    const location = useUserLocation();
    const navigate = useNavigate();

    if (!location.shouldShowPrompt) return null;

    return (
        <aside
            aria-label="Location for weather and holidays"
            className="fixed inset-x-3 top-16 z-30 rounded-[1.75rem] border border-white/[0.08] bg-twilight-deep/95 p-5 shadow-[0_24px_60px_rgba(0,0,0,0.32)] backdrop-blur-2xl sm:inset-x-auto sm:right-6 sm:w-[25rem]"
        >
            <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-moonlit/20 bg-moonlit/10 text-moonlit">
                    <MapPin size={16} aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-twilight-text">Weather and holidays use your approximate area</p>
                    <p className="mt-1 text-sm leading-relaxed text-twilight-text-soft">
                        Cadence estimates it from your network connection, so there&apos;s no permission prompt. You can change this any time in Settings.
                    </p>
                </div>
                <button
                    type="button"
                    aria-label="Close"
                    onClick={() => void location.dismissPrompt()}
                    className="btn-icon -mr-2 -mt-2 h-9 w-9 shrink-0 rounded-xl text-twilight-text-muted hover:bg-white/[0.06] hover:text-twilight-text"
                >
                    <X size={15} aria-hidden="true" />
                </button>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <button
                    type="button"
                    className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full border border-moonlit/25 bg-moonlit/10 px-4 text-sm font-medium text-moonlit transition-colors hover:bg-moonlit/15"
                    onClick={() => void location.dismissPrompt()}
                >
                    Sounds good
                </button>
                <button
                    type="button"
                    className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-4 text-sm font-medium text-twilight-text transition-colors hover:bg-white/[0.07] disabled:cursor-wait disabled:opacity-70"
                    onClick={() => void location.setMode("precise")}
                    disabled={location.isLocating}
                >
                    <LocateFixed size={14} aria-hidden="true" />
                    {location.isLocating ? "Locating..." : "Use precise location"}
                </button>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-twilight-text-muted">
                <button
                    type="button"
                    className="min-h-9 cursor-pointer transition-colors hover:text-twilight-text"
                    onClick={() => void location.setMode("off")}
                >
                    Turn location off
                </button>
                <button
                    type="button"
                    className="min-h-9 cursor-pointer transition-colors hover:text-twilight-text"
                    onClick={() => {
                        void location.dismissPrompt();
                        navigate("?settings=location");
                    }}
                >
                    More options
                </button>
            </div>
        </aside>
    );
}
