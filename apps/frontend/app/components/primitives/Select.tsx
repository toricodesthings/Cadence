import * as React from "react"
import * as SelectPrimitive from "@radix-ui/react-select"
import { Check, ChevronDown } from "lucide-react"

import { cn } from "../../lib/utils"
import { FLOATING_MORPH, MENU_HOVER, morphFrom } from "./menu-styles"

const Select = SelectPrimitive.Root

const SelectValue = SelectPrimitive.Value

const SelectTrigger = ({ className, children, ...props }: React.ComponentProps<typeof SelectPrimitive.Trigger>) => (
    <SelectPrimitive.Trigger
        className={cn(
            "flex h-11 w-full items-center justify-between whitespace-nowrap rounded-xl border border-twilight-border-light bg-white/[0.05] px-3 py-2 text-sm text-twilight-text shadow-sm ring-offset-twilight-base placeholder:text-twilight-text-muted focus:outline-none focus:ring-1 focus:ring-accent-primary/40 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1 cursor-pointer hover:bg-white/[0.08] transition-[background-color,opacity]",
            // On touch the open menu covers its trigger, so the trigger becomes the menu.
            "pointer-coarse:data-[state=open]:opacity-0",
            className
        )}
        {...props}
    >
        {children}
        <SelectPrimitive.Icon asChild>
            <ChevronDown className="h-4 w-4 opacity-50" />
        </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
);

const SelectContent = ({ className, children, position = "popper", sideOffset = 4, fromRadius = "0.75rem", style, ...props }: React.ComponentProps<typeof SelectPrimitive.Content> & { fromRadius?: string }) => (
    <SelectPrimitive.Portal>
        <SelectPrimitive.Content
            className={cn(
                "surface-floating glass-edge layer-floating-ui relative max-h-96 min-w-[8rem] overflow-hidden rounded-xl text-twilight-text",
                position === "popper" && FLOATING_MORPH,
                className
            )}
            position={position}
            sideOffset={position === "popper" ? sideOffset : undefined}
            style={morphFrom(fromRadius, sideOffset, style)}
            {...props}
        >
            <SelectPrimitive.Viewport
                className={cn(
                    "p-1",
                    position === "popper" &&
                    "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]"
                )}
            >
                {children}
            </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
);

const SelectItem = ({ className, children, ...props }: React.ComponentProps<typeof SelectPrimitive.Item>) => (
    <SelectPrimitive.Item
        className={cn(
            "relative flex w-full cursor-pointer select-none items-center rounded-lg py-2 pl-8 pr-2 text-sm outline-none focus:text-accent-primary data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
            MENU_HOVER,
            className
        )}
        {...props}
    >
        <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
            <SelectPrimitive.ItemIndicator>
                <Check className="h-4 w-4" />
            </SelectPrimitive.ItemIndicator>
        </span>
        <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
);

/**
 * A search box docked to the top of `SelectContent`, for lists too long to scan (timezones,
 * long project lists). Radix Select has no search of its own: this hijacks keys itself so
 * typing filters instead of triggering Radix's single-letter typeahead, and hands `ArrowDown`
 * off to the first item so keyboard users can still reach the (filtered) list.
 * Radix Select focuses the selected item on open and doesn't expose `onOpenAutoFocus` to steal
 * that back, so pair this with a controlled `open` on `Select` and focus it from an effect:
 * `useEffect(() => { if (open) requestAnimationFrame(() => ref.current?.focus()); }, [open])`.
 */
const SelectSearch = ({ className, onKeyDown, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { ref?: React.Ref<HTMLInputElement> }) => (
    <div className="sticky top-0 z-10 -mx-1 -mt-1 mb-1 bg-[inherit] px-1 pb-1 pt-1">
        <input
            type="search"
            onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                    event.preventDefault()
                    const option = event.currentTarget
                        .closest("[data-radix-select-viewport]")
                        ?.querySelector<HTMLElement>('[role="option"]')
                    option?.focus()
                } else if (event.key !== "Escape") {
                    // Keep typing in the box; only Escape should reach Radix's own handling (closes the menu).
                    event.stopPropagation()
                }
                onKeyDown?.(event)
            }}
            className={cn(
                "w-full rounded-lg border border-twilight-border-light bg-white/[0.06] px-2.5 py-1.5 text-sm text-twilight-text placeholder:text-twilight-text-muted outline-none focus:ring-1 focus:ring-accent-primary/40",
                className
            )}
            {...props}
        />
    </div>
);

export {
    Select,
    SelectValue,
    SelectTrigger,
    SelectContent,
    SelectItem,
    SelectSearch,
}
