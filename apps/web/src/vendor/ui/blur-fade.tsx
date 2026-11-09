import { motion } from "motion/react"

// Magic UI's Blur Fade (magicui.design/docs/components/blur-fade), cut to the one entrance the app uses:
// rise a few pixels out of a soft blur. Reduced motion is handled by the MotionConfig around the app.
export function BlurFade({ children, delay = 0, className }: { children: React.ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ delay: 0.04 + delay, duration: 0.4, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  )
}
