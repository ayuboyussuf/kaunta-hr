"use client";

import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-aproksi-ultra/50 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-aproksi-ultra text-white shadow-sm hover:bg-aproksi-ultra/90",
        destructive:
          "bg-aproksi-red text-white shadow-sm hover:bg-aproksi-red/90",
        outline:
          "border border-aproksi-mist bg-aproksi-white shadow-sm hover:bg-aproksi-stone hover:text-aproksi-ink",
        secondary:
          "bg-aproksi-stone text-aproksi-ink shadow-sm hover:bg-aproksi-mist",
        ghost:
          "hover:bg-aproksi-stone hover:text-aproksi-ink",
        link:
          "text-aproksi-ultra underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm:      "h-8 rounded-lg px-3 text-xs",
        lg:      "h-10 rounded-lg px-8",
        icon:    "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size:    "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
