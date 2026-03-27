import { useMemo } from "react";
import { resolveLoadingSeason, type Season } from "../../lib/themes/season";
import { LoadingSky } from "./loading/LoadingSky";
import { LoadingMountains } from "./loading/LoadingMountains";
import { LoadingCityscape } from "./loading/LoadingCityscape";
import { LoadingWater } from "./loading/LoadingWater";
import { LoadingLanterns } from "./loading/LoadingLanterns";
import { LoadingParticles } from "./loading/LoadingParticles";
import { LoadingForeground } from "./loading/LoadingForeground";
import "./loading/loading-tokens.css";

export type LoadingMode = "twilight" | "daylight";

/**
 * Adaptive loading screen — "threshold of the sanctuary."
 *
 * Seasonally themed (spring rain, summer breeze, autumn harvest, winter snow)
 * with full light/dark mode adaptation. Token-driven colors, accent-responsive
 * elements, refined lantern placement, and CSS particle systems.
 *
 * Season is derived from the current date (or user's seasonal theme preset
 * when available in localStorage during initial load).
 * Mode is derived from the data-theme attribute on <html> or localStorage.
 */
export function Loading() {
    const { season, mode } = useMemo<{ season: Season; mode: LoadingMode }>(() => {
        // SSR guard — browser APIs aren't available on the server
        if (typeof document === "undefined") {
            return { season: resolveLoadingSeason(), mode: "twilight" as LoadingMode };
        }

        let resolvedSeason: Season;
        let resolvedMode: LoadingMode = "twilight";

        // Check the live DOM attribute first (set by useThemeSync)
        const htmlTheme = document.documentElement.getAttribute("data-theme");
        if (htmlTheme === "daylight") {
            resolvedMode = "daylight";
        }

        // Read the lightweight appearance cache written by useThemeSync.
        try {
            const raw = localStorage.getItem("cadence-appearance");
            if (raw) {
                const parsed = JSON.parse(raw);
                resolvedSeason = resolveLoadingSeason(parsed?.themePreset);
                // If DOM didn't have it, check localStorage
                if (resolvedMode === "twilight") {
                    const storedTheme = parsed?.theme;
                    if (storedTheme === "daylight") {
                        resolvedMode = "daylight";
                    } else if (storedTheme === "system") {
                        resolvedMode = window.matchMedia("(prefers-color-scheme: light)").matches
                            ? "daylight" : "twilight";
                    }
                }
            } else {
                resolvedSeason = resolveLoadingSeason();
            }
        } catch {
            resolvedSeason = resolveLoadingSeason();
        }

        return { season: resolvedSeason!, mode: resolvedMode };
    }, []);

    return (
        <div
            className="loading-screen fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden"
            style={{ background: "var(--loading-sky-deep, #050811)" }}
            data-loading-season={season}
            data-loading-mode={mode}
        >
            {/* Background SVG Scene */}
            <div className="absolute inset-0 pointer-events-none">
                <svg
                    className="w-full h-full object-cover"
                    viewBox="0 0 1920 1080"
                    preserveAspectRatio="xMidYMid slice"
                    xmlns="http://www.w3.org/2000/svg"
                >
                    <defs>
                        {/* Token-driven sky gradient */}
                        <radialGradient id="sky-grad" cx="50%" cy="100%" r="100%">
                            <stop offset="0%" stopColor="var(--loading-sky-horizon, #2A4B5A)" />
                            <stop offset="30%" stopColor="var(--loading-sky-mid, #1E3349)" />
                            <stop offset="60%" stopColor="var(--loading-sky-deep, #0D182E)" />
                            <stop offset="100%" stopColor="var(--loading-sky-deep, #040914)" />
                        </radialGradient>

                        <radialGradient id="moon-glow" cx="50%" cy="50%" r="50%">
                            <stop offset="0%" stopColor="var(--loading-moon-color, #e2f1ff)" stopOpacity="1" />
                            <stop offset="30%" stopColor="var(--loading-moon-color, #a3ccff)" stopOpacity="0.4" />
                            <stop offset="100%" stopColor="var(--loading-sky-deep, #111c38)" stopOpacity="0" />
                        </radialGradient>

                        {/* Lantern glows — accent-responsive */}
                        <radialGradient id="lantern-glow-core" cx="50%" cy="50%" r="50%">
                            <stop offset="0%" stopColor="#FFF4D2" stopOpacity="1" />
                            <stop offset="20%" stopColor="var(--accent-primary, #FFD166)" stopOpacity="0.9" />
                            <stop offset="50%" stopColor="var(--accent-primary, #FF9D00)" stopOpacity="0.5" />
                            <stop offset="100%" stopColor="var(--accent-primary, #FF6200)" stopOpacity="0" />
                        </radialGradient>

                        <radialGradient id="lantern-glow-outer" cx="50%" cy="50%" r="50%">
                            <stop offset="0%" stopColor="var(--accent-primary, #FFB84D)" stopOpacity="0.6" />
                            <stop offset="50%" stopColor="var(--accent-primary, #FF7B00)" stopOpacity="0.2" />
                            <stop offset="100%" stopColor="var(--accent-primary, #CC3300)" stopOpacity="0" />
                        </radialGradient>

                        {/* Lantern body */}
                        <radialGradient id="lantern-body-grad" cx="50%" cy="60%" r="60%" fx="50%" fy="70%">
                            <stop offset="0%" stopColor="#FFF2B2" />
                            <stop offset="25%" stopColor="#FFC837" />
                            <stop offset="70%" stopColor="var(--accent-primary, #FF8008)" />
                            <stop offset="100%" stopColor="#C43A00" />
                        </radialGradient>

                        <linearGradient id="lantern-rim-grad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#5C3A21" />
                            <stop offset="50%" stopColor="#3D1B11" />
                            <stop offset="100%" stopColor="#1F0D07" />
                        </linearGradient>

                        <linearGradient id="tassel-grad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#FF4D00" />
                            <stop offset="100%" stopColor="#8A1C00" />
                        </linearGradient>

                        {/* Token-driven mountains */}
                        <linearGradient id="mountain-back-1" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="var(--loading-mountain-far, #1E334D)" stopOpacity="0.6" />
                            <stop offset="100%" stopColor="var(--loading-mountain-near, #081021)" stopOpacity="0.9" />
                        </linearGradient>
                        <linearGradient id="mountain-back-2" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="var(--loading-mountain-mid, #14253A)" stopOpacity="0.8" />
                            <stop offset="100%" stopColor="var(--loading-mountain-near, #050A18)" stopOpacity="1" />
                        </linearGradient>
                        <linearGradient id="mountain-mid" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="var(--loading-mountain-mid, #0D1A2E)" />
                            <stop offset="100%" stopColor="var(--loading-mountain-near, #030712)" />
                        </linearGradient>

                        {/* Token-driven buildings */}
                        <linearGradient id="city-buildings-front" x1="0" y1="1" x2="0" y2="0">
                            <stop offset="0%" stopColor="var(--loading-building-front-base, #5A2E1D)" />
                            <stop offset="60%" stopColor="var(--loading-building-front-top, #2A1612)" />
                            <stop offset="100%" stopColor="var(--loading-building-front-top, #110B0E)" />
                        </linearGradient>
                        <linearGradient id="city-buildings-back" x1="0" y1="1" x2="0" y2="0">
                            <stop offset="0%" stopColor="var(--loading-building-back-base, #3D201A)" />
                            <stop offset="100%" stopColor="var(--loading-building-back-top, #0D090B)" />
                        </linearGradient>

                        {/* Token-driven water */}
                        <linearGradient id="water-grad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="var(--loading-water-top, #182A40)" stopOpacity="0.95" />
                            <stop offset="40%" stopColor="var(--loading-water-mid, #0A1424)" stopOpacity="0.98" />
                            <stop offset="100%" stopColor="var(--loading-water-deep, #02050A)" stopOpacity="1" />
                        </linearGradient>

                        {/* Drop shadow filter */}
                        <filter id="glow-shadow" x="-50%" y="-50%" width="200%" height="200%">
                            <feDropShadow dx="0" dy="4" stdDeviation="12" floodColor="var(--accent-primary, #FFB347)" floodOpacity="0.3" />
                        </filter>

                        {/* Reusable lantern graphic */}
                        <g id="lantern">
                            <circle cx="0" cy="5" r="40" fill="url(#lantern-glow-outer)" />
                            <path d="M -18, -22 Q 0, -38 18, -22 L 24, 14 Q 0, 32 -24, 14 Z" fill="url(#lantern-body-grad)" />
                            <path d="M -11, -25 Q 0, -32 11, -25 L 14, 16 Q 0, 26 -14, 16 Z" fill="none" stroke="#FFE28A" strokeWidth="1" opacity="0.5" />
                            <path d="M 0, -28 L 0, 20" fill="none" stroke="#FFE28A" strokeWidth="1" opacity="0.6" />
                            <path d="M -14, -18 Q 0, -26 14, -18" fill="none" stroke="#FFFFFF" strokeWidth="2" opacity="0.4" filter="blur(1px)" />
                            <circle cx="0" cy="0" r="12" fill="url(#lantern-glow-core)" />
                            <rect x="-13" y="16" width="26" height="5" rx="1" fill="url(#lantern-rim-grad)" />
                            <rect x="-14" y="15" width="28" height="2" fill="#5C3A21" />
                            <rect x="-15" y="-26" width="30" height="5" rx="1" fill="url(#lantern-rim-grad)" />
                            <rect x="-15" y="-22" width="30" height="2" fill="#1F0D07" />
                            <path d="M 0, 21 L 0, 30" stroke="#8A1C00" strokeWidth="2" />
                            <path d="M -3, 30 L -5, 45 M -1, 30 L -1, 48 M 1, 30 L 1, 48 M 3, 30 L 5, 45" stroke="url(#tassel-grad)" strokeWidth="1.5" strokeLinecap="round" />
                            <circle cx="0" cy="30" r="2.5" fill="#FFC837" />
                        </g>

                        {/* Animations */}
                        <style>{`
                            @keyframes float-up {
                                0% { transform: translateY(110vh) scale(0.8) rotate(-3deg); opacity: 0; }
                                10% { opacity: 1; }
                                90% { opacity: 1; }
                                100% { transform: translateY(-20vh) scale(1.15) rotate(3deg); opacity: 0; }
                            }
                            @keyframes float {
                                0%, 100% { transform: translateY(0px); }
                                50% { transform: translateY(-8px); }
                            }
                            @keyframes pulse {
                                0%, 100% { opacity: 0.85; transform: scale(1); filter: brightness(1) }
                                50% { opacity: 1; transform: scale(1.02); filter: brightness(1.15) }
                            }
                            @keyframes star-twinkle {
                                0%, 100% { opacity: 0.1; transform: scale(0.7); }
                                50% { opacity: 0.9; transform: scale(1.3); }
                            }
                            @keyframes water-shift {
                                0%, 100% { transform: translateX(-10px); }
                                50% { transform: translateX(10px); }
                            }

                            .lantern-obj { animation: pulse 4s infinite ease-in-out; }
                            .star { animation: star-twinkle 5s infinite ease-in-out; }
                            .s-1 { animation-delay: 0s; }
                            .s-2 { animation-delay: 1.5s; }
                            .s-3 { animation-delay: 2.8s; }
                            .s-4 { animation-delay: 0.9s; }
                            .s-5 { animation-delay: 3.2s; }
                            .water-anim { animation: water-shift 8s infinite ease-in-out; }
                        `}</style>

                        {/* Architectural gradients */}
                        <linearGradient id="wood-front" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="var(--loading-building-front-base, #542312)" />
                            <stop offset="100%" stopColor="var(--loading-building-front-top, #2E1107)" />
                        </linearGradient>
                        <linearGradient id="wood-side" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="var(--loading-building-back-base, #3A170A)" />
                            <stop offset="100%" stopColor="var(--loading-building-back-top, #0F0401)" />
                        </linearGradient>
                        <linearGradient id="roof-front" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="var(--loading-roof-front-start, #D9572B)" />
                            <stop offset="100%" stopColor="var(--loading-roof-front-end, #5E1B09)" />
                        </linearGradient>
                        <linearGradient id="roof-side" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="var(--loading-roof-side-start, #752207)" />
                            <stop offset="100%" stopColor="var(--loading-roof-side-end, #210801)" />
                        </linearGradient>
                        <radialGradient id="window-warm" cx="50%" cy="50%" r="50%">
                            <stop offset="0%" stopColor="var(--loading-window-center, #FFF1B8)" stopOpacity="1" />
                            <stop offset="70%" stopColor="var(--loading-window-edge, var(--accent-primary, #FF9D00))" stopOpacity="0.8" />
                            <stop offset="100%" stopColor="var(--loading-window-edge, var(--accent-primary, #D14E00))" stopOpacity="0.2" />
                        </radialGradient>

                        {/* Building sub-components */}
                        <g id="window-3d">
                            <rect x="0" y="0" width="16" height="24" fill="#140804" />
                            <rect x="2" y="2" width="12" height="20" fill="url(#window-warm)" filter="drop-shadow(0 0 4px var(--accent-primary, #FF9D00))" />
                            <polygon points="7,2 9,2 9,22 7,22" fill="#3D1B11" />
                            <polygon points="2,10 14,10 14,12 2,12" fill="#3D1B11" />
                        </g>
                        <g id="window-side">
                            <polygon points="0,0 12,-6 12,18 0,24" fill="#0A0301" />
                            <polygon points="2,2 10,-2 10,16 2,20" fill="url(#window-warm)" opacity="0.7" />
                        </g>

                        <g id="building-a">
                            <polygon points="0,0 80,0 80,90 0,90" fill="url(#wood-front)" />
                            <polygon points="80,0 130,-25 130,65 80,90" fill="url(#wood-side)" />
                            <use href="#window-3d" x="15" y="40" />
                            <use href="#window-3d" x="45" y="40" />
                            <use href="#window-side" x="90" y="10" />
                            <use href="#window-side" x="110" y="0" />
                            <polygon points="-10,-10 90,-10 140,-35 40,-35" fill="var(--loading-building-front-top, #2E1107)" />
                            <path d="M -15,-5 Q 40,15 95,-5 L 75,-40 Q 40,-30 5,-40 Z" fill="url(#roof-front)" />
                            <path d="M 95,-5 L 150,-30 L 130,-65 L 75,-40 Z" fill="url(#roof-side)" />
                        </g>

                        <g id="building-b">
                            <polygon points="0,100 150,100 150,220 0,220" fill="url(#wood-front)" />
                            <polygon points="150,100 230,60 230,180 150,220" fill="url(#wood-side)" />
                            <use href="#window-3d" x="20" y="150" />
                            <use href="#window-3d" x="65" y="150" />
                            <use href="#window-3d" x="110" y="150" />
                            <use href="#window-side" x="170" y="110" />
                            <use href="#window-side" x="200" y="95" />
                            <path d="M -25,100 Q 75,130 175,100 L 140,40 Q 75,50 10,40 Z" fill="url(#roof-front)" />
                            <path d="M 175,100 L 260,60 L 225,0 L 140,40 Z" fill="url(#roof-side)" />
                            <polygon points="20,-20 130,-20 130,80 20,80" fill="url(#wood-front)" />
                            <polygon points="130,-20 190,-50 190,50 130,80" fill="url(#wood-side)" />
                            <polygon points="10,80 140,80 140,90 10,90" fill="url(#wood-front)" />
                            <polygon points="140,80 200,50 200,60 140,90" fill="url(#wood-side)" />
                            <use href="#window-3d" x="40" y="30" />
                            <use href="#window-3d" x="80" y="30" />
                            <use href="#window-side" x="150" y="-5" />
                            <path d="M -5,-20 Q 75,0 155,-20 L 125,-75 Q 75,-60 25,-75 Z" fill="url(#roof-front)" />
                            <path d="M 155,-20 L 225,-55 L 195,-110 L 125,-75 Z" fill="url(#roof-side)" />
                        </g>

                        <g id="building-c">
                            <polygon points="0,0 200,0 200,60 0,60" fill="url(#wood-front)" />
                            <polygon points="200,0 260,-30 260,30 200,60" fill="url(#wood-side)" />
                            <use href="#window-3d" x="20" y="20" />
                            <use href="#window-3d" x="60" y="20" />
                            <use href="#window-3d" x="100" y="20" />
                            <use href="#window-3d" x="140" y="20" />
                            <path d="M -20,0 Q 100,20 220,0 L 180,-60 Q 100,-45 20,-60 Z" fill="url(#roof-front)" />
                            <path d="M 220,0 L 290,-35 L 250,-90 L 180,-60 Z" fill="url(#roof-side)" />
                        </g>

                        <g id="string-light">
                            <path d="M 0,0 Q 150,50 300,0" fill="none" stroke="var(--loading-building-front-top, #2E1107)" strokeWidth="2" />
                            <circle cx="50" cy="20" r="3" fill="var(--accent-primary, #FFE88A)" filter="drop-shadow(0 0 4px var(--accent-primary, #FF9D00))" />
                            <circle cx="100" cy="35" r="3" fill="var(--accent-primary, #FFE88A)" filter="drop-shadow(0 0 4px var(--accent-primary, #FF9D00))" />
                            <circle cx="150" cy="40" r="4" fill="var(--accent-primary, #FFB84D)" filter="drop-shadow(0 0 6px var(--accent-primary, #FF9D00))" />
                            <circle cx="200" cy="35" r="3" fill="var(--accent-primary, #FFE88A)" filter="drop-shadow(0 0 4px var(--accent-primary, #FF9D00))" />
                            <circle cx="250" cy="20" r="3" fill="var(--accent-primary, #FFE88A)" filter="drop-shadow(0 0 4px var(--accent-primary, #FF9D00))" />
                        </g>
                    </defs>

                    <LoadingSky season={season} mode={mode} />
                    <LoadingMountains season={season} />
                    <LoadingCityscape season={season} />
                    <LoadingWater />
                </svg>
            </div>

            {/* Floating lanterns — refined placement */}
            <LoadingLanterns season={season} mode={mode} />

            {/* Seasonal particles */}
            <LoadingParticles season={season} mode={mode} />

            {/* Foreground content — accent-responsive */}
            <LoadingForeground mode={mode} />
        </div>
    );
}
