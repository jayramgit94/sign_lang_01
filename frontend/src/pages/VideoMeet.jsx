/**
 * VideoMeet — Main video call page.
 *
 * This is now a slim orchestrator that composes hooks and components.
 * All logic lives in dedicated hooks (useWebRTC, useChat, useSignLanguage).
 *
 * Previously 1703 lines → now ~200 lines.
 */
import { useSnackbar } from "notistack";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

// Hooks
import useChat from "../hooks/useChat";
import useSignLanguage from "../hooks/useSignLanguage";
import useWebRTC from "../hooks/useWebRTC";

// Components
import ChatPanel from "../components/chat/ChatPanel";
import CaptionOverlay from "../components/video/CaptionOverlay";
import ControlBar from "../components/video/ControlBar";
import Lobby from "../components/video/Lobby";
import PeoplePanel from "../components/video/PeoplePanel";
import VideoGrid from "../components/video/VideoGrid";

// Context & services
import { AuthContext } from "../contexts/AuthContextType";
import { disconnectSocket, getSocket } from "../services/socket";

import styles from "../styles/videoComponent.module.css";

const VideoMeet = () => {
  const { userData, addToUserHistory, isAuthenticated } =
    useContext(AuthContext);
  const navigate = useNavigate();
  const { url } = useParams();
  const { enqueueSnackbar } = useSnackbar();

  // Meeting code from URL path parameter
  const meetingCode = url || "";
  // Guest name (set from Lobby for unauthenticated users)
  const [guestName, setGuestName] = useState("");
  // Effective display name — auth username takes priority, then guest name
  const username = userData?.username || guestName || "";

  // UI state
  const [inLobby, setInLobby] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [captionsVisible, setCaptionsVisible] = useState(true);

  // Socket — created once. getSocket is idempotent (returns existing socket
  // even if still connecting), so StrictMode double-invoke is safe.
  const [socket] = useState(() =>
    meetingCode ? getSocket(userData?.username || "") : null,
  );

  // Redirect if no meeting code
  const hasRedirected = useRef(false);
  useEffect(() => {
    if (!meetingCode && !hasRedirected.current) {
      hasRedirected.current = true;
      enqueueSnackbar("No meeting code provided.", { variant: "error" });
      navigate("/home");
    }
  }, [meetingCode, navigate, enqueueSnackbar]);

  // Socket error listener
  useEffect(() => {
    if (!socket) return;

    const handleError = ({ message }) => {
      enqueueSnackbar(message || "Socket error", { variant: "error" });
    };
    socket.on("error", handleError);

    return () => {
      socket.off("error", handleError);
    };
  }, [socket, enqueueSnackbar]);

  // --- Hooks ---
  const {
    localStream,
    remoteStreams,
    participantList,
    video,
    audio,
    screen,
    startLocalStream,
    joinRoom,
    endCall: rtcEndCall,
    toggleVideo,
    toggleAudio,
    toggleScreenShare,
  } = useWebRTC({ socket, username });

  const { messages, sendMessage, newMessageCount, resetNewMessages } = useChat({
    socket,
  });

  const {
    isEnabled: signLangEnabled,
    toggle: toggleSignLang,
    captionText,
    captionScore,
    correctedSentence,
    remoteCaptions,
  } = useSignLanguage({ localStream, socket, username });

  // --- Join from lobby ---
  const handleJoinFromLobby = useCallback(
    async (displayName) => {
      try {
        await startLocalStream();

        const effectiveName = userData?.username || displayName || "Guest";
        joinRoom(meetingCode, effectiveName);
        setInLobby(false);

        // Store guest name for UI display (after joinRoom to avoid race)
        if (!userData?.username && displayName) {
          setGuestName(displayName);
        }

        // Record in history if authenticated
        if (isAuthenticated) {
          addToUserHistory(meetingCode);
        }
      } catch {
        enqueueSnackbar(
          "Camera/microphone access denied. Please allow permissions.",
          { variant: "error" },
        );
      }
    },
    [
      startLocalStream,
      joinRoom,
      meetingCode,
      isAuthenticated,
      addToUserHistory,
      enqueueSnackbar,
      userData,
    ],
  );

  // --- End call ---
  const handleEndCall = useCallback(() => {
    rtcEndCall();
    disconnectSocket();
    navigate("/home");
  }, [rtcEndCall, navigate]);

  // --- Toggle chat panel ---
  const handleToggleChat = useCallback(() => {
    setChatOpen((prev) => {
      if (!prev) resetNewMessages();
      return !prev;
    });
  }, [resetNewMessages]);

  // --- Toggle captions visibility ---
  const handleToggleCaptions = useCallback(() => {
    setCaptionsVisible((prev) => !prev);
  }, []);

  // --- Toggle people panel ---
  const handleTogglePeople = useCallback(() => {
    setPeopleOpen((prev) => !prev);
  }, []);

  // --- Keyboard shortcuts ---
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't trigger shortcuts when typing in input
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")
        return;

      switch (e.key.toLowerCase()) {
        case "m":
          toggleAudio();
          break;
        case "v":
          toggleVideo();
          break;
        case "s":
          if (e.ctrlKey) {
            e.preventDefault();
            toggleScreenShare();
          }
          break;
        case "escape":
          setChatOpen(false);
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleAudio, toggleVideo, toggleScreenShare]);

  // --- Lobby view ---
  if (inLobby) {
    return (
      <Lobby
        meetingCode={meetingCode}
        username={username}
        onJoin={handleJoinFromLobby}
      />
    );
  }

  // --- Call view ---
  return (
    <div className={styles.meetContainer}>
      {/* Main video area */}
      <div
        className={`${styles.videoArea} ${chatOpen || peopleOpen ? styles.videoAreaWithChat : ""}`}
      >
        <VideoGrid
          localStream={localStream}
          remoteStreams={remoteStreams}
          username={username}
          video={video}
          audio={audio}
        />

        {/* Caption overlay — only shown when captions are enabled */}
        {captionsVisible && (
          <CaptionOverlay
            localCaption={
              captionText ? { text: captionText, score: captionScore } : null
            }
            remoteCaptions={remoteCaptions}
            correctedSentence={correctedSentence}
          />
        )}
      </div>

      {/* Chat panel (side drawer) */}
      {chatOpen && (
        <ChatPanel
          messages={messages}
          onSend={sendMessage}
          username={username}
          onClose={() => setChatOpen(false)}
        />
      )}

      {/* People panel (side drawer) */}
      {peopleOpen && (
        <PeoplePanel
          participants={participantList}
          localUsername={username}
          onClose={() => setPeopleOpen(false)}
        />
      )}

      {/* Bottom control bar */}
      <ControlBar
        video={video}
        audio={audio}
        screen={screen}
        signLangEnabled={signLangEnabled}
        captionsVisible={captionsVisible}
        chatOpen={chatOpen}
        newMessages={newMessageCount}
        peopleOpen={peopleOpen}
        participantCount={1 + participantList.length}
        onToggleVideo={toggleVideo}
        onToggleAudio={toggleAudio}
        onToggleScreen={toggleScreenShare}
        onToggleSignLang={toggleSignLang}
        onToggleCaptions={handleToggleCaptions}
        onToggleChat={handleToggleChat}
        onTogglePeople={handleTogglePeople}
        onEndCall={handleEndCall}
      />
    </div>
  );
};

export default VideoMeet;
