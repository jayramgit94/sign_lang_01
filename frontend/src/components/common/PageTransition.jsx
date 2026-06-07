import { motion, useReducedMotion } from "framer-motion";
import { pageTransition, pageVariants } from "../../utils/motion";

export default function PageTransition({ children }) {
  const reduced = useReducedMotion();

  return (
    <motion.div
      variants={pageVariants}
      initial={reduced ? false : "initial"}
      animate="animate"
      exit={reduced ? undefined : "exit"}
      transition={pageTransition(reduced)}
      style={{ width: "100%", minHeight: "100dvh" }}
    >
      {children}
    </motion.div>
  );
}
