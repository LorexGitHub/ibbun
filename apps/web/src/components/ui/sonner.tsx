import { Toaster as Sonner, type ToasterProps } from "sonner"

// Hum is light only and uses no stock icons, so the toast is a plain card-stock slip.
const Toaster = ({ ...props }: ToasterProps) => (
  <Sonner
    theme="light"
    className="toaster group"
    style={
      {
        "--normal-bg": "var(--color-card)",
        "--normal-text": "var(--color-ink)",
        "--normal-border": "var(--color-rule)",
        "--border-radius": "var(--radius-stock)",
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
