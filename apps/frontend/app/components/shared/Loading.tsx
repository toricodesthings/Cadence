import { LoadingDefs } from "./loading/LoadingDefs";
import { LoadingSky, LoadingSkyMotion } from "./loading/LoadingSky";
import { LoadingMountains } from "./loading/LoadingMountains";
import { LoadingCityscape } from "./loading/LoadingCityscape";
import { LoadingWater } from "./loading/LoadingWater";
import { LoadingLanterns } from "./loading/LoadingLanterns";
import { LoadingParticles } from "./loading/LoadingParticles";
import { LoadingFrame } from "./loading/LoadingFrame";
import { LoadingForeground } from "./loading/LoadingForeground";
import "./loading/loading-tokens.css";
import "./loading/loading-scene.css";
import type { ReactNode } from "react";

/**
 * Loading scene — a lantern-lit autumn valley on a moon-viewing night.
 *
 * Markup is identical for every season and mode. The head boot script stamps
 * `data-loading-season`, `data-loading-mode` and `data-motion` on `<html>`, and
 * the tokens and visibility gates in `loading-tokens.css` do the rest. This keeps
 * the pre-rendered `HydrateFallback` correct before JS and hydration-safe.
 */
export function Loading({ title, children }: { title?: string; children?: ReactNode }) {
    return (
        <div className="loading-screen layer-loading-screen fixed inset-0 flex items-center justify-center overflow-hidden">
            <div className="loading-stage" aria-hidden="true">
                <svg className="ls-layer" viewBox="0 0 1920 1080" xmlns="http://www.w3.org/2000/svg">
                    <LoadingDefs />
                    <LoadingSky />
                </svg>
                <LoadingSkyMotion />
                <LoadingMountains />
                <LoadingLanterns plane="far" />
                <LoadingCityscape />
                <LoadingWater />
                <LoadingLanterns plane="near" />
            </div>
            <LoadingParticles />
            <LoadingFrame />
            <div className="ls-vignette" aria-hidden="true" />
            <LoadingForeground title={title}>{children}</LoadingForeground>
        </div>
    );
}
