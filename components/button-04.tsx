import type { ReactNode } from "react";
import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cn } from "cn";

/**
 * Hover-fill + text-slide toggle button (pure CSS — see the `.button-04`
 * block in `app/globals.css`). Built on the same base-ui primitive as the
 * shadcn `Button`, with the animated label wrapped for the text-slide effect.
 *
 * Active state is styled automatically via `aria-pressed` / `aria-checked`.
 * Pass className to theme it (pills, compact chips, ink/alert fills).
 */
function Button04({
  className,
  children,
  ...props
}: ButtonPrimitive.Props & { className?: string; children?: ReactNode }) {
  return (
    <ButtonPrimitive
      data-slot="button-04"
      className={cn("button-04", className)}
      {...props}
    >
      <div className="span-wrapper">
        <span className="span-text">{children}</span>
      </div>
    </ButtonPrimitive>
  );
}

export { Button04 };