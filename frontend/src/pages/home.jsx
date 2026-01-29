import React, { useContext, useState } from "react";
import withAuth from "../utils/withAuth";
import { useNavigate } from "react-router-dom";
import "../App.css";
import { Button, IconButton, TextField } from "@mui/material";
import RestoreIcon from "@mui/icons-material/Restore";
import { AuthContext } from "../contexts/AuthContext";

function HomeComponent() {
  let navigate = useNavigate();
  const [meetingCode, setMeetingCode] = useState("");

  const { addToUserHistory } = useContext(AuthContext);
  let handleJoinVideoCall = async () => {
    await addToUserHistory(meetingCode);
    navigate(`/${meetingCode}`);
  };

  return (
    <div className="homePage">
      <header className="homeTopBar">
        <div className="homeBrand">
          <div className="brandDot" />
          <h2>Apna Meet</h2>
        </div>
        <div className="homeActions">
          <button
            className="homeActionButton"
            onClick={() => {
              navigate("/history");
            }}
          >
            <RestoreIcon />
            <span>History</span>
          </button>
          <Button
            className="homeActionButtonPrimary"
            onClick={() => {
              localStorage.removeItem("token");
              navigate("/auth");
            }}
          >
            Logout
          </Button>
        </div>
      </header>

      <main className="homeHero">
        <div className="homeCard">
          <p className="homeEyebrow">Quick start</p>
          <h1 className="homeTitle">
            Start your meeting in seconds.
          </h1>
          <p className="homeSubtitle">
            Paste a meeting code or join instantly. Your recent calls and
            history are always one tap away.
          </p>

          <div className="homeForm">
            <TextField
              onChange={(e) => setMeetingCode(e.target.value)}
              id="outlined-basic"
              label="Meeting code"
              variant="outlined"
              size="small"
              className="homeField"
            />
            <Button onClick={handleJoinVideoCall} variant="contained">
              Join meeting
            </Button>
          </div>

          <div className="homeStats">
            <div>
              <h3>Reliable</h3>
              <p>Stable calls on any device</p>
            </div>
            <div>
              <h3>Secure</h3>
              <p>Protected rooms and access</p>
            </div>
            <div>
              <h3>Responsive</h3>
              <p>Optimized for phone & laptop</p>
            </div>
          </div>
        </div>
        <div className="homePreview">
          <img srcSet="/logo3.png" alt="App preview" />
        </div>
      </main>
    </div>
  );
}

export default withAuth(HomeComponent);
