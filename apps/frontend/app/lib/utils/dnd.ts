import {
    MouseSensor as LibMouseSensor,
    TouchSensor as LibTouchSensor,
} from "@dnd-kit/core";

function allowsDrag(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return true;
    return !target.closest('[data-no-dnd="true"]');
}

export class MouseSensor extends LibMouseSensor {
    static activators = [
        {
            eventName: "onMouseDown" as const,
            handler: ({ nativeEvent }: { nativeEvent: MouseEvent }) =>
                nativeEvent.button === 0 && allowsDrag(nativeEvent.target),
        },
    ];
}

export class TouchSensor extends LibTouchSensor {
    static activators = [
        {
            eventName: "onTouchStart" as const,
            handler: ({ nativeEvent }: { nativeEvent: TouchEvent }) =>
                allowsDrag(nativeEvent.target),
        },
    ];
}
