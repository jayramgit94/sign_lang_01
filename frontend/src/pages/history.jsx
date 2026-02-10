import HomeIcon from "@mui/icons-material/Home";
import { IconButton } from "@mui/material";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardActions from "@mui/material/CardActions";
import CardContent from "@mui/material/CardContent";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import { useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../contexts/AuthContext";

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
    <div className="historyPage">
      <header className="historyHeader">
        <div>
          <Typography variant="h4" component="h1" className="historyTitle">
            Meeting history
          </Typography>
          <Typography variant="body2" className="historySubtitle">
            Review and rejoin your recent calls.
          </Typography>
        </div>
        <div className="historyHeaderActions">
          <Button
            variant="outlined"
            size="small"
            onClick={cleared ? handleRestoreHistory : handleClearHistory}
            className="historyClearButton"
          >
            {cleared ? "Restore history" : "Clear history"}
          </Button>
          <IconButton
            onClick={() => {
              routeTo("/home");
            }}
            className="historyHomeButton"
          >
            <HomeIcon />
          </IconButton>
        </div>
      </header>

      <Container maxWidth="md" className="historyContainer">
        {loading ? (
          <Typography variant="body1" className="historyMessage">
            Loading history...
          </Typography>
        ) : error ? (
          <Card className="historyError">
            <Typography color="error">Error: {error}</Typography>
          </Card>
        ) : meetings.length !== 0 ? (
          <Box className="historyList">
            {meetings.map((meeting, i) => {
              const chatMeta = getChatMeta(meeting.meetingCode);
              return (
                <Card key={i} className="historyCard" variant="outlined">
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
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => {
                        routeTo(`/${meeting.meetingCode}`);
                      }}
                    >
                      Rejoin
                    </Button>
                  </CardActions>
                </Card>
              );
            })}
          </Box>
        ) : (
          <Card className="historyEmpty">
            <Typography variant="body1" color="textSecondary">
              No meetings yet. Start a new meeting to see it here.
            </Typography>
          </Card>
        )}
      </Container>
    </div>
  );
}
