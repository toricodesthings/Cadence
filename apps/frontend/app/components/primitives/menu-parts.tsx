import type { ComponentProps, ElementType } from "react";
import {
    MENU_HOVER,
    MENU_ITEM,
    MENU_ITEM_DANGER,
    MENU_ROW,
    MENU_SEPARATOR,
    MENU_SUB_SLIDE,
    MENU_SURFACE,
} from "./menu-styles";

type RadixMenu = { SubTrigger: ElementType; SubContent: ElementType; Item: ElementType; Separator: ElementType };

const ITEM_VARIANTS = {
    default: `text-twilight-text-soft hover:text-twilight-text focus:text-twilight-text ${MENU_HOVER}`,
    danger: MENU_ITEM_DANGER,
};

/** The rows both menus style the same way, themed for one Radix namespace (each keeps its own context). */
export function themedMenuParts<M extends RadixMenu>(Radix: M) {
    const { SubTrigger: RSubTrigger, SubContent: RSubContent, Item: RItem, Separator: RSeparator } = Radix as RadixMenu;
    return {
        SubTrigger: ({ className = "", ...props }: ComponentProps<M["SubTrigger"]>) => (
            <RSubTrigger
                className={`${MENU_ROW} text-twilight-text-soft hover:text-twilight-text data-[state=open]:text-twilight-text ${MENU_HOVER} ${className}`}
                {...props}
            />
        ),
        SubContent: ({ className = "", sideOffset = 4, ...props }: ComponentProps<M["SubContent"]>) => (
            <RSubContent
                sideOffset={sideOffset}
                className={`${MENU_SURFACE} ${MENU_SUB_SLIDE} ${className}`}
                {...props}
            />
        ),
        Item: ({
            className = "",
            variant = "default",
            ...props
        }: ComponentProps<M["Item"]> & { variant?: keyof typeof ITEM_VARIANTS }) => (
            <RItem
                className={`${MENU_ITEM} ${ITEM_VARIANTS[variant as keyof typeof ITEM_VARIANTS]} ${className}`}
                {...props}
            />
        ),
        Separator: ({ className = "", ...props }: ComponentProps<M["Separator"]>) => (
            <RSeparator className={`${MENU_SEPARATOR} ${className}`} {...props} />
        ),
    };
}
