import { useRef, type SyntheticEvent } from "react";

const fromTouch = (event: SyntheticEvent) => {
    const type = (event.nativeEvent as PointerEvent).pointerType;
    // A keyboard click is a PointerEvent with pointerType "" in Chrome.
    return type === "touch" || type === "pen";
};

export function useOpeningReleaseGuard(onCloseAutoFocus?: (event: Event) => void) {
    const pressedInside = useRef(false);
    const swallow = (event: SyntheticEvent) => {
        event.preventDefault();
        event.stopPropagation();
    };
    return {
        onPointerDownCapture: () => {
            pressedInside.current = true;
        },
        onPointerUpCapture: (event: React.PointerEvent) => {
            if (!pressedInside.current && fromTouch(event)) swallow(event);
        },
        onClickCapture: (event: React.MouseEvent) => {
            if (!pressedInside.current && (event.detail > 0 || fromTouch(event))) swallow(event);
        },
        onCloseAutoFocus: (event: Event) => {
            pressedInside.current = false;
            onCloseAutoFocus?.(event);
        },
    };
}
