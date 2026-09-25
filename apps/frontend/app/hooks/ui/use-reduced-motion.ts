import { useReducedMotion } from "framer-motion";
import { useSettings } from "../core/use-settings";

/** Reduced motion as the user chose it: the Motion setting, else the OS preference. */
export function useReducedMotionSetting(): boolean {
    const prefersReducedMotion = useReducedMotion();
    const { data: settings } = useSettings();
    const motion = settings?.appearance?.motion;
    return motion === "reduced" || (motion !== "full" && Boolean(prefersReducedMotion));
}
