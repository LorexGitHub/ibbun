import type { ButtonHTMLAttributes, ReactNode } from "react";

/** Card stock: the secondary recipe, pear for the primary action, coral for the one loud press (such as Forgot). */
export type ButtonVariant = "secondary" | "primary" | "loud";
export type ButtonLook = { variant?: ButtonVariant; big?: boolean };

/** The class list for a card-stock control. Links that look like buttons use it too. */
export const buttonClass = ({ variant = "secondary", big = false }: ButtonLook = {}): string =>
  ["btn", variant !== "secondary" && `btn--${variant}`, big && "btn--big"].filter(Boolean).join(" ");

export const Button = ({ variant, big, ...rest }: ButtonLook & ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button type="button" {...rest} className={buttonClass({ variant, big })} />
);

/** The class list for a pill. An ink pill is the selected one, such as the current nav entry. */
export const pillClass = (ink: boolean): string => (ink ? "pill pill--ink" : "pill");

export const Pill = ({ ink = false, children }: { ink?: boolean; children: ReactNode }) => (
  <span className={pillClass(ink)}>{children}</span>
);

export const Card = ({ className, children }: { className?: string; children: ReactNode }) => (
  <div className={className ? `card ${className}` : "card"}>{children}</div>
);

/** A torn sheet of paper with its pale fibre core showing one pixel below. `tear` is the edge shape, `fill` the paper. */
export type Tear = "nav" | "band" | "sheet";
export type Fill = "paper" | "kraft" | "pear";

export const Sheet = ({ tear, fill, children }: { tear: Tear; fill: Fill; children: ReactNode }) => (
  <div className="sheet-wrap" data-tear={tear}>
    <div className="fringe" aria-hidden="true" />
    <div className="torn" data-fill={fill}>
      {children}
    </div>
  </div>
);
