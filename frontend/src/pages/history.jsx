import HomeIcon from "@mui/icons-material/Home";
import { IconButton } from "@mui/material";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardActions from "@mui/material/CardActions";
import CardContent from "@mui/material/CardContent";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import { AnimatePresence, motion } from "framer-motion";
import { useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageTransition from "../components/common/PageTransition";
import { AuthContext } from "../contexts/AuthContext";

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 20 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, delay, ease: [0.25, 0.46, 0.45, 0.94] },
  },
});

const cardVariants = {
  initial: { opacity: 0, y: 18, scale: 0.97 },
  animate: (i) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.4,
      delay: i * 0.07,
      ease: [0.25, 0.46, 0.45, 0.94],
    },
  }),
};

export default function History() {
  const { getHistoryOfUser } = useContext(AuthContext);

  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [cleared, setCleared] = useState(false);

  const routeTo = useNavigate();

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        setLoading(true);
        const isCleared = localStorage.getItem("historyCleared") === "true";
        setCleared(isCleared);
        if (isCleared) {
          setMeetings([]);
          return;
        }
        const history = await getHistoryOfUser();
        console.log("History fetched:", history);
        setMeetings(history || []);
      } catch (err) {
        console.error("Error fetching history:", err);
        setError(err.message || "Failed to fetch history");
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getChatMeta = (meetingCode) => {
    try {
      const raw = localStorage.getItem(`chatHistory:${meetingCode}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) return null;
      const lastMessage = parsed[parsed.length - 1];
      return {
        count: parsed.length,
        lastText: lastMessage?.data || "",
      };
    } catch (err) {
      return null;
    }
  };

  const handleClearHistory = () => {
    localStorage.setItem("historyCleared", "true");
    setCleared(true);
    setMeetings([]);
  };

  const handleRestoreHistory = () => {
    localStorage.removeItem("historyCleared");
    setCleared(false);
    setLoading(true);
    getHistoryOfUser()
      .then((history) => setMeetings(history || []))
      .catch((err) => setError(err.message || "Failed to fetch history"))
      .finally(() => setLoading(false));
  };

  let formatDate = (dateString) => {
    const date = new Date(dateString);
    const day = date.getDate().toString().padStart(2, "0");
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const year = date.getFullYear();

    return `${day}/${month}/${year}`;
  };

  return (
    <PageTransition>
      <div className="historyPage">
        <motion.header
          className="historyHeader"
          initial={{ opacity: 0, y: -14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
        >
          <div>
            <Typography variant="h4" component="h1" className="historyTitle">
              Meeting history
            </Typography>
            <Typography variant="body2" className="historySubtitle">
              Review and rejoin your recent calls.
            </Typography>
          </div>
          <div className="historyHeaderActions">
            <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
              <Button
                variant="outlined"
                size="small"
                onClick={cleared ? handleRestoreHistory : handleClearHistory}
                className="historyClearButton"
              >
                {cleared ? "Restore history" : "Clear history"}
              </Button>
            </motion.div>
            <motion.div whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.95 }}>
              <IconButton
                onClick={() => routeTo("/home")}
                className="historyHomeButton"
              >
                <HomeIcon />
              </IconButton>
            </motion.div>
          </div>
        </motion.header>

        <Container maxWidth="md" className="historyContainer">
          {loading ? (
            <motion.div {...fadeUp(0.1)}>
              <Box sx={{ textAlign: "center", py: 6 }}>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{
                    repeat: Infinity,
                    duration: 1.2,
                    ease: "linear",
                  }}
                  style={{
                    width: 32,
                    height: 32,
                    border: "3px solid rgba(148,163,184,0.15)",
                    borderTopColor: "#6366f1",
                    borderRadius: "50%",
                    margin: "0 auto 1rem",
                  }}
                />
                <Typography variant="body1" className="historyMessage">
                  Loading history...
                </Typography>
              </Box>
            </motion.div>
          ) : error ? (
            <motion.div {...fadeUp(0.1)}>
              <Card className="historyError">
                <Typography color="error">Error: {error}</Typography>
              </Card>
            </motion.div>
          ) : meetings.length !== 0 ? (
            <Box className="historyList">
              <AnimatePresence>
                {meetings.map((meeting, i) => {
                  const chatMeta = getChatMeta(meeting.meetingCode);
                  return (
                    <motion.div
                      key={meeting.meetingCode || i}
                      variants={cardVariants}
                      initial="initial"
                      animate="animate"
                      custom={i}
                      layout
                    >
                      <Card className="historyCard" variant="outlined">
                        <CardContent>
                          <Typography className="historyCode" gutterBottom>
                            Meeting Code: {meeting.meetingCode}
                          </Typography>

                          <Typography className="historyMeta">
                            Date: {formatDate(meeting.date)}
                          </Typography>
                          {chatMeta ? (
                            <Typography className="historyChatMeta">
                              {chatMeta.count} chat messages • Last:{" "}
                              {chatMeta.lastText}
                            </Typography>
                          ) : (
                            <Typography className="historyChatMeta">
                              No chat messages saved
                            </Typography>
                          )}
                        </CardContent>
                        <CardActions className="historyActions">
                          <motion.div
                            whileHover={{ scale: 1.06 }}
                            whileTap={{ scale: 0.96 }}
                          >
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={() => routeTo(`/${meeting.meetingCode}`)}
                            >
                              Rejoin
                            </Button>
                          </motion.div>
                        </CardActions>
                      </Card>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </Box>
          ) : (
            <motion.div {...fadeUp(0.15)}>
              <Card className="historyEmpty">
                <Typography variant="body1" color="textSecondary">
                  No meetings yet. Start a new meeting to see it here.
                </Typography>
              </Card>
            </motion.div>
          )}
        </Container>
      </div>
    </PageTransition>
  );
}
