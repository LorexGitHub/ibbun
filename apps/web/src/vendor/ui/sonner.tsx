import { Toaster as Sonner, type ToasterProps } from "sonner"

// Toasts follow the Learner's look and mode, and use no stock icons.
const Toaster = ({ ...props }: ToasterProps) => (
  <Sonner
    className="toaster group"
    style={
      {
        "--normal-bg": "var(--color-card)",
        "--normal-text": "var(--color-ink)",
        "--normal-border": "var(--color-rule)",
        "--border-radius": "14px",
      } as React.CSSProperties
    }
    toastOptions={{
      classNames: {
        toast: "font-sans! text-base! shadow-[var(--shadow-card)]!",
        description: "text-muted-foreground!",
      },
    }}
    {...props}
  />
)

export { Toaster }
