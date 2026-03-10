/**
 * VideoGrid — Responsive grid layout for video tiles.
 */
import React from "react";
import styles from "../../styles/videoComponent.module.css";
import { getGridClass } from "../../utils/helpers";
import VideoTile from "./VideoTile";

const VideoGrid = ({ localStream, remoteStreams, username, video, audio }) => {
  const totalCount = 1 + remoteStreams.length; // local + remote
  const gridClass = getGridClass(totalCount);

  return (
    <div className={`${styles.videoGrid} ${styles[gridClass]}`}>
      {/* Local video tile */}
      <VideoTile
        stream={localStream}
        username={`${username} (You)`}
        muted
        isLocal
        videoEnabled={video}
        audioEnabled={audio}
      />

      {/* Remote video tiles */}
      {remoteStreams.map(
        ({
          socketId,
          stream,
          username: peerName,
          video: peerVideo,
          audio: peerAudio,
        }) => (
          <VideoTile
            key={socketId}
            stream={stream}
            username={peerName || "Peer"}
            videoEnabled={peerVideo !== false}
            audioEnabled={peerAudio !== false}
          />
        ),
      )}
    </div>
  );
};

export default React.memo(VideoGrid);
