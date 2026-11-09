/**
 * Primitive: DropdownMenu
 *
 * Pre-themed Radix DropdownMenu with Cadence's twilight glass aesthetic.
 * Domain components import from here — never from @radix-ui/react-dropdown-menu directly.
 */
import * as RadixDropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, type LucideIcon } from "lucide-react";
import { Switch } from "./Switch";
import { useOpeningReleaseGuard } from "../../hooks/ui/use-opening-release-guard";
import { FLOATING_MORPH, MENU_HOVER, MENU_ITEM, MENU_ITEM_DANGER, MENU_LABEL, MENU_ROW, MENU_SEPARATOR, MENU_SWITCH, MENU_SUB_SLIDE, MENU_SURFACE, morphFrom } from "./menu-styles";

/* ── Re-exports (no styling needed) ─────────────────────────────── */
export const Root = RadixDropdownMenu.Root;
export const Trigger = RadixDropdownMenu.Trigger;
export const Portal = RadixDropdownMenu.Portal;
export const Sub = RadixDropdownMenu.Sub;
export const RadioGroup = RadixDropdownMenu.RadioGroup;

/* ── SubTrigger ─────────────────────────────────────────────────── */
export const SubTrigger = ({ className = "", children, ...props }: RadixDropdownMenu.DropdownMenuSubTriggerProps & { ref?: React.Ref<HTMLDivElement> }) => (
    <RadixDropdownMenu.SubTrigger
        className={`${MENU_ROW} text-twilight-text-soft hover:text-twilight-text data-[state=open]:text-twilight-text ${MENU_HOVER} ${className}`}
        {...props}
    >
        {children}
    </RadixDropdownMenu.SubTrigger>
);

/* ── SubContent ─────────────────────────────────────────────────── */
export const SubContent = ({ className = "", sideOffset = 4, ...props }: RadixDropdownMenu.DropdownMenuSubContentProps & { ref?: React.Ref<HTMLDivElement> }) => (
    <RadixDropdownMenu.SubContent
        sideOffset={sideOffset}
        className={`${MENU_SURFACE} ${MENU_SUB_SLIDE} ${className}`}
        {...props}
    />
);


/* ── Content ────────────────────────────────────────────────────── */
export const Content = ({ className = "", sideOffset = 4, collisionPadding = 8, fromRadius, style, onCloseAutoFocus, ...props }: RadixDropdownMenu.DropdownMenuContentProps & { fromRadius?: string; ref?: React.Ref<HTMLDivElement> }) => {
    const guard = useOpeningReleaseGuard(onCloseAutoFocus);
    return (
    <RadixDropdownMenu.Portal>
        <RadixDropdownMenu.Content
            {...guard}
            sideOffset={sideOffset}
            collisionPadding={collisionPadding}
            style={morphFrom(fromRadius, sideOffset, style)}
            className={`${MENU_SURFACE} max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto overscroll-contain ${FLOATING_MORPH} ${className}`}
            {...props}
        />
    </RadixDropdownMenu.Portal>
    );
};

/* ── Item ───────────────────────────────────────────────────────── */
export const Item = ({ className = "", variant = "default", ...props }: RadixDropdownMenu.DropdownMenuItemProps & { variant?: "default" | "danger" } & { ref?: React.Ref<HTMLDivElement> }) => {
    const variants = {
        default:
            `text-twilight-text-soft hover:text-twilight-text focus:text-twilight-text ${MENU_HOVER}`,
        danger: MENU_ITEM_DANGER,
    };

    return (
        <RadixDropdownMenu.Item
            className={`${MENU_ITEM} ${variants[variant]} ${className}`}
            {...props}
        />
    );
};

/* ── Separator ──────────────────────────────────────────────────── */
export const Separator = ({ className = "", ...props }: RadixDropdownMenu.DropdownMenuSeparatorProps & { ref?: React.Ref<HTMLDivElement> }) => (
    <RadixDropdownMenu.Separator
        className={`${MENU_SEPARATOR} ${className}`}
        {...props}
    />
);

/** A selected menu choice, with the same focus and touch targets as other items. */
export const RadioItem = ({ className = "", children, ...props }: RadixDropdownMenu.DropdownMenuRadioItemProps & { ref?: React.Ref<HTMLDivElement> }) => (
    <RadixDropdownMenu.RadioItem className={`relative flex min-h-11 cursor-pointer items-center rounded-lg py-2 pl-9 pr-3 text-[15px] text-twilight-text-soft outline-none transition-colors ${MENU_HOVER} focus:text-twilight-text data-[state=checked]:font-medium data-[state=checked]:text-accent-primary ${className}`} {...props}>
        <span className="absolute left-3 flex size-4 items-center justify-center">
            <RadixDropdownMenu.ItemIndicator><Check size={15} aria-hidden="true" /></RadixDropdownMenu.ItemIndicator>
        </span>
        {children}
    </RadixDropdownMenu.RadioItem>
);

/** A group's mini header (see `MENU_LABEL`). */
export const Label = ({ className = "", ...props }: RadixDropdownMenu.DropdownMenuLabelProps) => (
    <RadixDropdownMenu.Label className={`${MENU_LABEL} ${className}`} {...props} />
);

type RowProps = { icon: LucideIcon; label: string; checked: boolean };

/** One choice of several (a sort order): the chosen row carries the check. */
export const CheckItem = ({ icon: Icon, label, checked, onSelect }: RowProps & { onSelect: () => void }) => (
    <RadixDropdownMenu.CheckboxItem checked={checked} onSelect={onSelect}
        className={`${MENU_ITEM} text-twilight-text-soft hover:text-twilight-text focus:text-twilight-text ${MENU_HOVER}`}>
        <Icon size={14} aria-hidden="true" />
        <span className="flex-1">{label}</span>
        <RadixDropdownMenu.ItemIndicator><Check size={14} className="text-accent-primary" aria-hidden="true" /></RadixDropdownMenu.ItemIndicator>
    </RadixDropdownMenu.CheckboxItem>
);

/** On/off: the row toggles and the menu stays open. */
export const SwitchItem = ({ icon: Icon, label, checked, onCheckedChange }: RowProps & { onCheckedChange: (checked: boolean) => void }) => (
    <RadixDropdownMenu.CheckboxItem checked={checked} onSelect={(event) => { event.preventDefault(); onCheckedChange(!checked); }}
        className={`${MENU_ITEM} text-twilight-text-soft hover:text-twilight-text focus:text-twilight-text ${MENU_HOVER}`}>
        <Icon size={14} aria-hidden="true" />
        <span className="flex-1">{label}</span>
        <Switch checked={checked} tabIndex={-1} aria-hidden="true" className={MENU_SWITCH} />
    </RadixDropdownMenu.CheckboxItem>
);
