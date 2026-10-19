import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export const inputClasses =
  "w-full rounded-xl border border-border bg-bg/60 px-4 py-3 text-base text-ink placeholder:text-muted/80 " +
  "transition-colors hover:border-muted/60 focus:border-amber aria-[invalid=true]:border-danger";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} className={cn(inputClasses, "min-h-12", className)} {...rest} />;
});
