import type { ElementType, HTMLAttributes, ReactNode } from "react";

export type RevealVariant =
  | "fade-up"
  | "fade-in"
  | "scale-up"
  | "fade-left"
  | "fade-right";

export interface ScrollRevealProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
  as?: ElementType;
  variant?: RevealVariant;
  delay?: number;
  className?: string;
}

/**
 * Lightweight, SSR-safe scroll reveal wrapper.
 * Elements render visible by default and smoothly animate in as they enter the viewport.
 */
export function ScrollReveal({
  children,
  as: Component = "div",
  variant = "fade-up",
  delay,
  className = "",
  style,
  ...props
}: ScrollRevealProps) {
  return (
    <Component
      data-reveal={variant}
      data-delay={delay ? delay.toString() : undefined}
      style={style}
      className={className}
      {...props}
    >
      {children}
    </Component>
  );
}
