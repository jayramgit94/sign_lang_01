import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import RestoreIcon from "@mui/icons-material/Restore";
import ShareIcon from "@mui/icons-material/Share";
import VideoCallIcon from "@mui/icons-material/VideoCall";
import { Button, IconButton, TextField, Tooltip } from "@mui/material";
import { AnimatePresence, motion } from "framer-motion";
import { useSnackbar } from "notistack";
import { useContext, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../App.css";
import PageTransition from "../components/common/PageTransition";
import { AuthContext } from "../contexts/AuthContext";
import { generateMeetingCode } from "../utils/helpers";

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 24 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay, ease: [0.25, 0.46, 0.45, 0.94] },
  },
});

const scaleIn = (delay = 0) => ({
  initial: { opacity: 0, scale: 0.93 },
  animate: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.55, delay, ease: [0.25, 0.46, 0.45, 0.94] },
  },
});

const stagger = {
  animate: { transition: { staggerChildren: 0.08 } },
};

const statItem = {
  initial: { opacity: 0, y: 14 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: "easeOut" },
  },
};

function HomeComponent() {
  let navigate = useNavigate();
  const [meetingCode, setMeetingCode] = useState("");
  const [generatedCode, setGeneratedCode] = useState("");
  const [copied, setCopied] = useState(false);
  const { enqueueSnackbar } = useSnackbar();

  const { addToUserHistory, handleLogout } = useContext(AuthContext);

  let handleJoinVideoCall = async () => {
    const code = meetingCode.trim();
    if (!code) {
      enqueueSnackbar("Please enter a meeting code.", { variant: "warning" });
      return;
    }
    await addToUserHistory(code);
    navigate(`/${code}`);
  };

  const handleGenerate = () => {
    const code = generateMeetingCode();
    setGeneratedCode(code);
    setCopied(false);
  };

  const getMeetingLink = () => `${window.location.origin}/${generatedCode}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(getMeetingLink());
      setCopied(true);
      enqueueSnackbar("Meeting link copied!", { variant: "success" });
      setTimeout(() => setCopied(false), 2500);
    } catch {
      enqueueSnackbar("Failed to copy.", { variant: "error" });
    }
  };

  const handleShare = async () => {
    const link = getMeetingLink();
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Join my Apna Meet",
          text: `Join my meeting on Apna Meet: ${generatedCode}`,
          url: link,
        });
      } catch {
        /* user cancelled */
      }
    } else {
      handleCopyLink();
    }
  };

  return (
    <PageTransition>
      <div className="homePage">
        <motion.header
          className="homeTopBar"
          initial={{ opacity: 0, y: -14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
        >
          <div className="homeBrand">
            <motion.div
              className="brandDot"
              animate={{ scale: [1, 1.3, 1] }}
              transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
            />
            <h2>Apna Meet</h2>
          </div>
          <div className="homeActions">
            <motion.button
              className="homeActionButton"
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => navigate("/history")}
            >
              <RestoreIcon />
              <span>History</span>
            </motion.button>
            <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
              <Button
                className="homeActionButtonPrimary"
                onClick={handleLogout}
              >
                Logout
              </Button>
            </motion.div>
          </div>
        </motion.header>

        <main className="homeHero">
          <motion.div className="homeCard" {...scaleIn(0.1)}>
            <motion.p className="homeEyebrow" {...fadeUp(0.2)}>
              Quick start
            </motion.p>
            <motion.h1 className="homeTitle" {...fadeUp(0.3)}>
              Start your meeting in seconds.
            </motion.h1>
            <motion.p className="homeSubtitle" {...fadeUp(0.38)}>
              Paste a meeting code or join instantly. Your recent calls and
              history are always one tap away.
            </motion.p>

            <motion.div className="homeForm" {...fadeUp(0.46)}>
              <TextField
                onChange={(e) => setMeetingCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleJoinVideoCall();
                }}
                id="outlined-basic"
                label="Meeting code"
                variant="outlined"
                size="small"
                className="homeField"
              />
              <Button onClick={handleJoinVideoCall} variant="contained">
                Join meeting
              </Button>
            </motion.div>

            {/* ---- Generate & Share section ---- */}
            <motion.div className="homeGenerateSection" {...fadeUp(0.54)}>
              <div className="homeGenerateRow">
                <motion.div
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                >
                  <Button
                    onClick={handleGenerate}
                    variant="outlined"
                    className="homeGenerateBtn"
                    startIcon={<VideoCallIcon />}
                  >
                    New meeting
                  </Button>
                </motion.div>
                <span className="homeGenerateHint">
                  Generate a code &amp; share the link
                </span>
              </div>

              <AnimatePresence>
                {generatedCode && (
                  <motion.div
                    className="homeShareCard"
                    initial={{ opacity: 0, height: 0, marginTop: 0 }}
                    animate={{ opacity: 1, height: "auto", marginTop: 12 }}
                    exit={{ opacity: 0, height: 0, marginTop: 0 }}
                    transition={{
                      duration: 0.3,
                      ease: [0.25, 0.46, 0.45, 0.94],
                    }}
                  >
                    <div className="homeShareLinkBox">
                      <span className="homeShareUrl">{getMeetingLink()}</span>
                      <div className="homeShareActions">
                        <Tooltip title={copied ? "Copied!" : "Copy link"} arrow>
                          <IconButton
                            size="small"
                            onClick={handleCopyLink}
                            className="homeShareIconBtn"
                          >
                            <ContentCopyIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Share" arrow>
                          <IconButton
                            size="small"
                            onClick={handleShare}
                            className="homeShareIconBtn"
                          >
                            <ShareIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </div>
                    </div>
                    <div className="homeShareBtnRow">
                      <motion.div
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                      >
                        <Button
                          variant="contained"
                          size="small"
                          onClick={async () => {
                            await addToUserHistory(generatedCode);
                            navigate(`/${generatedCode}`);
                          }}
                        >
                          Start meeting
                        </Button>
                      </motion.div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            <motion.div
              className="homeStats"
              variants={stagger}
              initial="initial"
              animate="animate"
            >
              {[
                { title: "Reliable", desc: "Stable calls on any device" },
                { title: "Secure", desc: "Protected rooms and access" },
                { title: "Responsive", desc: "Optimized for phone & laptop" },
              ].map((stat) => (
                <motion.div key={stat.title} variants={statItem}>
                  <h3>{stat.title}</h3>
                  <p>{stat.desc}</p>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>

          <motion.div className="homePreview" {...scaleIn(0.25)}>
            <img srcSet="/logo3.png" alt="App preview" />
          </motion.div>
        </main>
      </div>
    </PageTransition>
  );
}

export default HomeComponent;
