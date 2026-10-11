/** True when focus moved into a floating popover or dialog, which renders outside the field that opened it. */
export const isFloatingFocus = (target: EventTarget | null): boolean =>
    target instanceof HTMLElement && Boolean(target.closest('[data-cadence-popover-content="true"], [data-cadence-dialog-content="true"]'));
