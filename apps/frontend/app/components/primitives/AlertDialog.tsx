"use client";

import * as React from "react";
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import { twMerge } from "tailwind-merge";
import { clsx, type ClassValue } from "clsx";
import { DIALOG_CONTENT, DIALOG_DESCRIPTION, DIALOG_FOOTER, DIALOG_HEADER, DIALOG_OVERLAY, DIALOG_TITLE } from "./dialog-styles";

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

const Root = AlertDialogPrimitive.Root;
const Trigger = AlertDialogPrimitive.Trigger;
const Portal = AlertDialogPrimitive.Portal;

const Cancel = React.forwardRef<
    React.ElementRef<typeof AlertDialogPrimitive.Cancel>,
    React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Cancel>
>(({ className, ...props }, ref) => (
    <AlertDialogPrimitive.Cancel
        ref={ref}
        className={cn("cursor-pointer", className)}
        {...props}
    />
));
Cancel.displayName = AlertDialogPrimitive.Cancel.displayName;

const Action = React.forwardRef<
    React.ElementRef<typeof AlertDialogPrimitive.Action>,
    React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Action>
>(({ className, ...props }, ref) => (
    <AlertDialogPrimitive.Action
        ref={ref}
        className={cn("cursor-pointer", className)}
        {...props}
    />
));
Action.displayName = AlertDialogPrimitive.Action.displayName;

const Overlay = React.forwardRef<
    React.ElementRef<typeof AlertDialogPrimitive.Overlay>,
    React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
    <AlertDialogPrimitive.Overlay
        ref={ref}
        className={cn(DIALOG_OVERLAY, className)}
        {...props}
    />
));
Overlay.displayName = AlertDialogPrimitive.Overlay.displayName;

const Content = React.forwardRef<
    React.ElementRef<typeof AlertDialogPrimitive.Content>,
    React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Content>
>(({ className, ...props }, ref) => (
    <Portal>
        <Overlay />
        <AlertDialogPrimitive.Content
            ref={ref}
            className={cn(DIALOG_CONTENT, "sm:max-w-md", className)}
            {...props}
        />
    </Portal>
));
Content.displayName = AlertDialogPrimitive.Content.displayName;

const Header = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div className={cn(DIALOG_HEADER, className)} {...props} />
);
Header.displayName = "AlertDialogHeader";

const Footer = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div className={cn(DIALOG_FOOTER, className)} {...props} />
);
Footer.displayName = "AlertDialogFooter";

const Title = React.forwardRef<
    React.ElementRef<typeof AlertDialogPrimitive.Title>,
    React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Title>
>(({ className, ...props }, ref) => (
    <AlertDialogPrimitive.Title
        ref={ref}
        className={cn(DIALOG_TITLE, className)}
        {...props}
    />
));
Title.displayName = AlertDialogPrimitive.Title.displayName;

const Description = React.forwardRef<
    React.ElementRef<typeof AlertDialogPrimitive.Description>,
    React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Description>
>(({ className, ...props }, ref) => (
    <AlertDialogPrimitive.Description
        ref={ref}
        className={cn(DIALOG_DESCRIPTION, className)}
        {...props}
    />
));
Description.displayName = AlertDialogPrimitive.Description.displayName;

export {
    Root,
    Trigger,
    Portal,
    Overlay,
    Content,
    Header,
    Footer,
    Title,
    Description,
    Cancel,
    Action,
};
