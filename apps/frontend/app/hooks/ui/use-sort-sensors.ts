import { KeyboardSensor, useSensor, useSensors } from "@dnd-kit/core";
import { MouseSensor, TouchSensor } from "../../lib/utils/dnd";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";

export function useSortSensors(keyboard = true) {
    const mouse = useSensor(MouseSensor, { activationConstraint: { distance: 4 } });
    const touch = useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 10 } });
    const keys = useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates });
    return useSensors(mouse, touch, keyboard ? keys : null);
}
