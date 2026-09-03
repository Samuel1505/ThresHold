import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "default" | "ghost" | "danger";
type Size = "sm" | "md";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const base =
  "inline-flex items-center justify-center gap-2 rounded font-medium select-none " +
  "transition-[background-color,border-color,color,opacity] duration-fast ease-out " +
  "disabled:opacity-40 disabled:pointer-events-none whitespace-nowrap";

const variants: Record<Variant, string> = {
  primary:
    "bg-fg text-bg border border-fg hover:bg-white active:translate-y-px",
  default:
    "bg-panel-2 text-fg border border-line-strong hover:border-fg-3 hover:bg-[#1a1e26] active:translate-y-px",
  ghost: "text-fg-2 hover:text-fg hover:bg-panel-2 border border-transparent",
  danger:
    "bg-transparent text-failed border border-failed/40 hover:bg-failed/10 hover:border-failed/70",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-9 px-4 text-sm",
};

export const Button = forwardRef<HTMLButtonElement, Props>(
  ({ variant = "default", size = "md", className, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    />
  ),
);
Button.displayName = "Button";
