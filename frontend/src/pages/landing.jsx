import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import "../App.css";
import PageTransition from "../components/common/PageTransition";
import { generateMeetingCode } from "../utils/helpers";

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 28 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, delay, ease: [0.25, 0.46, 0.45, 0.94] },
  },
});

const scaleIn = (delay = 0) => ({
  initial: { opacity: 0, scale: 0.92 },
  animate: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.6, delay, ease: [0.25, 0.46, 0.45, 0.94] },
  },
});

const stagger = {
  animate: { transition: { staggerChildren: 0.1 } },
};

const statItem = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

export default function LandingPage() {
  const router = useNavigate();

  return (
    <PageTransition>
      <div className="landingPageContainer">
        <motion.nav
          className="landingNav"
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <div className="landingBrand">
            <motion.div
              className="brandDot"
              animate={{ scale: [1, 1.3, 1] }}
              transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
            />
            <h2>Apna Meet</h2>
          </div>
          <div className="landingActions">
            <motion.button
              className="landingButton landingButtonGhost"
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => router("/auth")}
            >
              Register
            </motion.button>
            <motion.button
              className="landingButton"
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => router("/auth")}
            >
              Sign in
            </motion.button>
            <motion.button
              className="landingButton landingButtonPrimary"
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => router(`/${generateMeetingCode()}`)}
            >
              Join as friend
            </motion.button>
          </div>
        </motion.nav>

        <div className="landingHero">
          <div className="landingContent">
            <motion.div className="landingGlassCard" {...scaleIn(0.15)}>
              <motion.p className="eyebrow" {...fadeUp(0.25)}>
                Trusted video calls
              </motion.p>
              <motion.h1 className="landingTitle" {...fadeUp(0.35)}>
                Meet your team in a calm, reliable space.
              </motion.h1>
              <motion.p className="landingSubtitle" {...fadeUp(0.45)}>
                Apna Meet keeps conversations clear with crisp video, smart
                layout, and fast join links — with built-in sign language
                recognition.
              </motion.p>
              <motion.div className="landingCtaRow" {...fadeUp(0.55)}>
                <motion.div
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.97 }}
                >
                  <Link
                    className="landingButton landingButtonPrimary"
                    to="/auth"
                  >
                    Get started
                  </Link>
                </motion.div>
                <motion.button
                  className="landingButton landingButtonGhost"
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => router(`/${generateMeetingCode()}`)}
                >
                  Join as friend
                </motion.button>
              </motion.div>
            </motion.div>

            <motion.div
              className="landingStats"
              variants={stagger}
              initial="initial"
              animate="animate"
            >
              {[
                { title: "HD", desc: "Video quality" },
                { title: "Accessible", desc: "Sign language support" },
                { title: "Secure", desc: "Encrypted rooms" },
              ].map((stat) => (
                <motion.div key={stat.title} variants={statItem}>
                  <h3>{stat.title}</h3>
                  <p>{stat.desc}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>

          <motion.div className="landingIllustration" {...scaleIn(0.3)}>
            <img src="/mobile.png" alt="App preview" />
          </motion.div>
        </div>
      </div>
    </PageTransition>
  );
}
