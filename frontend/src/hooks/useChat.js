/**
 * useChat — In-room messaging hook.
 */
import { useCallback, useEffect, useState } from "react";
import { MAX_CHAT_MESSAGE_LENGTH } from "../utils/constants";

const useChat = ({ socket }) => {
  const [messages, setMessages] = useState([]);
  const [newMessageCount, setNewMessageCount] = useState(0);

  useEffect(() => {
    if (!socket) return;

    const handleIncomingMessage = (msg) => {
      setMessages((prev) => [
        ...prev,
        { ...msg, timestamp: msg.timestamp || Date.now() },
      ]);
      setNewMessageCount((prev) => prev + 1);
    };

    // Load initial messages when joining
    const handleRoomJoined = ({ messages: initialMessages }) => {
      if (initialMessages?.length) {
        setMessages(initialMessages);
      }
    };

    socket.on("chat-message", handleIncomingMessage);
    socket.on("room-joined", handleRoomJoined);

    return () => {
      socket.off("chat-message", handleIncomingMessage);
      socket.off("room-joined", handleRoomJoined);
    };
  }, [socket]);

  const sendMessage = useCallback(
    (text, sender) => {
      if (!socket || !text?.trim()) return;

      const sanitized = text.trim().slice(0, MAX_CHAT_MESSAGE_LENGTH);
      socket.emit("chat-message", {
        data: sanitized,
        sender: sender || "Guest",
      });
    },
    [socket],
  );

  const resetNewMessages = useCallback(() => {
    setNewMessageCount(0);
  }, []);

  return {
    messages,
    sendMessage,
    newMessageCount,
    resetNewMessages,
  };
};

export default useChat;
