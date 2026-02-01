"use client";

import { cloneElement, isValidElement } from "react";
import type { ComponentProps, ReactNode, ReactElement } from "react";

type Variant = "primary" | "ghost" | "subtle";

type Props = {
  children: ReactNode;
  variant?: Variant;
  fullWidth?: boolean;
  asChild?: boolean;
} & ComponentProps<"button">;

export default function Button({ children, variant = "primary", fullWidth, asChild, className, ...rest }: Props) {
  const classes = [
    "btn",
    variant === "primary" && "btn-primary",
    variant === "ghost" && "btn-ghost",
    variant === "subtle" && "btn-subtle",
    fullWidth && "full-width",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (asChild && isValidElement(children)) {
    return cloneElement(children as ReactElement, {
      className: [classes, (children as ReactElement).props.className].filter(Boolean).join(" "),
    });
  }

  return (
    <button className={classes} {...rest}>
      {children}
    </button>
  );
}
