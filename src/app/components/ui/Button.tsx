import type { ComponentProps, ReactNode } from "react";
import { Link, type LinkProps } from "react-router-dom";

type ButtonStyleProps = {
  size?: "small" | "normal";
  fullWidth?: boolean;
  className?: string;
  children?: ReactNode;
} & (
  | { variant: "3d"; color?: never; shape?: never }
  | { variant: "primary"; color?: "accent"; shape?: "rounded" | "square" }
  | { variant: "primary"; color: "black" | "danger"; shape?: "rounded" }
  | { variant?: "outline"; color?: "black" | "danger" | "oauth"; shape?: "rounded" }
);

export type ButtonProps = ButtonStyleProps &
  (
    | ({ to: LinkProps["to"]; href?: never } & Omit<LinkProps, keyof ButtonStyleProps | "to">)
    | ({ href: string; to?: never } & Omit<ComponentProps<"a">, keyof ButtonStyleProps | "href">)
    | ({ href?: never; to?: never } & Omit<ComponentProps<"button">, keyof ButtonStyleProps>)
  );

export function Button({
  variant = "outline",
  color = variant === "primary" ? "accent" : "black",
  size = "normal",
  shape = "rounded",
  fullWidth = false,
  className,
  children,
  ...props
}: ButtonProps) {
  const small3d = variant === "3d" && size === "small";
  const square = variant === "primary" && shape === "square";
  const classes = [
    small3d ? "coffee-button coffee-button--header" : square ? "autocomplete__confirm" : "button",
    variant === "3d" && !small3d && "button--primary button--3d",
    variant === "primary" &&
      !square &&
      (color === "danger" ? "button--danger-solid" : "button--primary"),
    variant === "primary" && color === "accent" && !square && "button--orange",
    variant === "outline" && color === "danger" && "button--danger",
    variant === "outline" && color === "oauth" && "button--oauth",
    size === "small" && !small3d && "button--small",
    fullWidth && "button--full-width",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  const content = small3d ? <span className="coffee-button__face">{children}</span> : children;

  if (props.to !== undefined) {
    return (
      <Link {...props} className={classes}>
        {content}
      </Link>
    );
  }
  if (props.href !== undefined) {
    return (
      <a {...props} className={classes}>
        {content}
      </a>
    );
  }
  return (
    <button type="button" {...props} className={classes}>
      {content}
    </button>
  );
}
