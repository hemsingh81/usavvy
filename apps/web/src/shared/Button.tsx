import type { ButtonHTMLAttributes } from "react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary";
}

// DESIGN.md's button-primary/button-secondary component tokens (see components.css).
export function Button({ variant = "primary", className, ...props }: ButtonProps) {
  const variantClass = variant === "primary" ? "usavvy-button-primary" : "usavvy-button-secondary";
  return <button className={[variantClass, className].filter(Boolean).join(" ")} {...props} />;
}
