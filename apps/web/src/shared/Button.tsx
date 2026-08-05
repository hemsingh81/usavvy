import type { ButtonHTMLAttributes } from "react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "destructive";
}

const VARIANT_CLASSES = {
  primary: "usavvy-button-primary",
  secondary: "usavvy-button-secondary",
  // Story 1.7: no DESIGN.md component token for a destructive action — reuses the
  // existing error-color tokens (see components.css) rather than a new color.
  destructive: "usavvy-button-destructive",
} as const;

// DESIGN.md's button-primary/button-secondary component tokens (see components.css).
export function Button({ variant = "primary", className, ...props }: ButtonProps) {
  return <button className={[VARIANT_CLASSES[variant], className].filter(Boolean).join(" ")} {...props} />;
}
