/**
 * Primitives barrel export.
 *
 * All Radix UI primitives are pre-themed here as the "base layer".
 * Domain components import from this barrel — never from @radix-ui/* directly.
 *
 * Usage:
 *   import * as DropdownMenu from "~/components/primitives/DropdownMenu";
 *   import * as Tooltip from "~/components/primitives/Tooltip";
 */
export { Button, type ButtonProps, type ButtonVariant, type ButtonSize } from "./Button";
export * as AlertDialog from "./AlertDialog";
export * as Collapsible from "./Collapsible";
export * as DropdownMenu from "./DropdownMenu";
export * as Popover from "./Popover";
export * as ScrollArea from "./ScrollArea";
export * as Separator from "./Separator";
export * as Tooltip from "./Tooltip";
export { Tip, type TipProps } from "./Tooltip";
export * as Dialog from "./Dialog";
export * from "./Skeleton";
export * from "./Switch";
export * from "./Input";
export * from "./TimePicker";
export * as Select from "./Select";
