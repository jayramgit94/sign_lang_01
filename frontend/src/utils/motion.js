/** Shared motion presets — Framer Motion + reduced-motion safe */

export const EASE_OUT = [0.22, 1, 0.36, 1];

export const springPanel = (reduced) =>
  reduced
    ? { duration: 0 }
    : { type: "spring", damping: 30, stiffness: 340, mass: 0.8 };

export const pageVariants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
};

export const pageTransition = (reduced) => ({
  duration: reduced ? 0 : 0.38,
  ease: EASE_OUT,
});

export const panelVariants = {
  initial: { x: "100%", opacity: 0 },
  animate: { x: 0, opacity: 1 },
  exit: { x: "100%", opacity: 0 },
};

export const fadeUpVariants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
};

export const fadeUpTransition = (delay = 0, reduced = false) => ({
  duration: reduced ? 0 : 0.42,
  delay: reduced ? 0 : delay,
  ease: EASE_OUT,
});

export const tileVariants = {
  initial: { opacity: 0, scale: 0.97 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.98 },
};

export const tileTransition = (reduced) => ({
  duration: reduced ? 0 : 0.32,
  ease: EASE_OUT,
});

export const captionVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 4 },
};

export const staggerContainer = {
  animate: { transition: { staggerChildren: 0.06 } },
};
