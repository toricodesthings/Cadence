import { useReducedMotion } from "framer-motion";
import { useSettings } from "../core/use-settings";

export function useReducedMotionSetting(): boolean {
    const prefersReducedMotion = useReducedMotion();
    const { data: settings } = useSettings();
    const motion = settings?.appearance?.motion;
    return motion === "reduced" || (motion !== "full" && Boolean(prefersReducedMotion));
}
