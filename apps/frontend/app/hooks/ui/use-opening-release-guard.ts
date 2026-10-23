import { useRef, type SyntheticEvent } from "react";

const fromTouch = (event: SyntheticEvent) => {
    const type = (event.nativeEvent as PointerEvent).pointerType;
    // A keyboard click is a PointerEvent with pointerType "" in Chrome.
    return type === "touch" || type === "pen";
};

/**
 * On touch a menu opens on press and covers its trigger, so the finger that opened it lifts over
 * an item. Until a press starts inside the menu, a touch release and the click it makes are not a
 * choice. Keyboard selection (a click with no pointer, detail 0) and a mouse drag-to-select are untouched.
 * Spread the returned handlers on the menu content; closing resets the guard, then calls `onCloseAutoFocus`.
 */
export function useOpeningReleaseGuard(onCloseAutoFocus?: (event: Event) => void) {
    const pressedInside = useRef(false);
    const swallow = (event: SyntheticEvent) => {
        event.preventDefault();
        event.stopPropagation();
    };
    return {
        onPointerDownCapture: () => { pressedInside.current = true; },
        onPointerUpCapture: (event: React.PointerEvent) => { if (!pressedInside.current && fromTouch(event)) swallow(event); },
        // A real click on an item always starts with a press inside. Safari's tap click carries no pointerType;
        // Chrome's can carry detail 0.
        onClickCapture: (event: React.MouseEvent) => { if (!pressedInside.current && (event.detail > 0 || fromTouch(event))) swallow(event); },
        onCloseAutoFocus: (event: Event) => {
            pressedInside.current = false;
            onCloseAutoFocus?.(event);
        },
    };
}
