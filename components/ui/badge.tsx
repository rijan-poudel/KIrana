"use client"

import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border-2 border-transparent px-2 py-0.5 text-xs font-bold whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-eager-green text-white border-eager-green [a]:hover:bg-eager-green/80",
        secondary:
          "bg-storybook-green text-charcoal border-storybook-green [a]:hover:bg-storybook-green/80",
        destructive:
          "bg-red-100 text-red-600 border-red-200 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:bg-red-200",
        outline:
          "border-faded-gray text-charcoal [a]:hover:bg-storybook-green [a]:hover:text-charcoal",
        ghost:
          "hover:bg-storybook-green/40 hover:text-charcoal dark:hover:bg-muted/50",
        link: "text-spark-blue underline-offset-4 hover:underline",
        success: "bg-storybook-green text-eager-green border-storybook-green",
        warning: "bg-amber-100 text-amber-800 border-amber-200",
        info: "bg-sky-100 text-sky-700 border-sky-200",
        muted: "bg-muted text-pencil-gray border-muted",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
