/**
 * VideoGrid — Responsive, scalable grid for 1–50+ participants.
 * Supports spotlight (pinned) layout and gallery pagination for large calls.
 */
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { IconButton } from "@mui/material";
import React, { useCallback, useMemo, useState } from "react";
import styles from "../../styles/videoComponent.module.css";
import {
  GALLERY_PAGE_SIZE,
  GALLERY_THRESHOLD,
  getGridLayout,
} from "../../utils/helpers";
import VideoTile from "./VideoTile";

const VideoGrid = ({
  localStream,
  remoteStreams,
  username,
  video,
  audio,
  pinnedId = null,
  onPinToggle,
  onAudioLevel,
}) => {
  const [galleryPage, setGalleryPage] = useState(0);

  const tiles = useMemo(() => {
    const local = {
      id: "local",
      stream: localStream,
      username: `${username} (You)`,
      muted: true,
      isLocal: true,
      videoEnabled: video,
      audioEnabled: audio,
    };
    const remotes = remoteStreams.map(
      ({
        socketId,
        stream,
        username: peerName,
        video: peerVideo,
        audio: peerAudio,
      }) => ({
        id: socketId,
        stream,
        username: peerName || "Peer",
        muted: false,
        isLocal: false,
        videoEnabled: peerVideo !== false,
        audioEnabled: peerAudio !== false,
      }),
    );
    return [local, ...remotes];
  }, [localStream, remoteStreams, username, video, audio]);

  const orderedTiles = useMemo(() => {
    if (!pinnedId) return tiles;
    const pinned = tiles.find((t) => t.id === pinnedId);
    if (!pinned) return tiles;
    return [pinned, ...tiles.filter((t) => t.id !== pinnedId)];
  }, [tiles, pinnedId]);

  const totalCount = orderedTiles.length;
  const canPin = totalCount > 1 && Boolean(onPinToggle);
  const isSpotlight = Boolean(pinnedId) && totalCount >= 2;
  const needsPagination = totalCount > GALLERY_THRESHOLD && !isSpotlight;

  const totalPages = needsPagination
    ? Math.ceil(totalCount / GALLERY_PAGE_SIZE)
    : 1;

  const safePage = Math.min(galleryPage, Math.max(0, totalPages - 1));

  const visibleTiles = useMemo(() => {
    if (isSpotlight) return orderedTiles;
    if (!needsPagination) return orderedTiles;
    const start = safePage * GALLERY_PAGE_SIZE;
    return orderedTiles.slice(start, start + GALLERY_PAGE_SIZE);
  }, [orderedTiles, isSpotlight, needsPagination, safePage]);

  const layout = getGridLayout(
    isSpotlight ? Math.max(1, totalCount - 1) : visibleTiles.length,
  );

  const goToPrevPage = useCallback(() => {
    setGalleryPage((page) => Math.max(0, page - 1));
  }, []);

  const goToNextPage = useCallback(() => {
    setGalleryPage((page) => Math.min(totalPages - 1, page + 1));
  }, [totalPages]);

  const gridClasses = [
    styles.videoGrid,
    isSpotlight ? styles.gridSpotlight : styles[layout.className],
  ]
    .filter(Boolean)
    .join(" ");

  const renderTile = (tile, variant = "default") => (
    <VideoTile
      key={tile.id}
      tileId={tile.id}
      stream={tile.stream}
      username={tile.username}
      muted={tile.muted}
      isLocal={tile.isLocal}
      videoEnabled={tile.videoEnabled}
      audioEnabled={tile.audioEnabled}
      isPinned={pinnedId === tile.id}
      onAudioLevel={onAudioLevel}
      onPinToggle={
        canPin
          ? () => onPinToggle(tile.id === pinnedId ? null : tile.id)
          : undefined
      }
      variant={variant}
    />
  );

  if (isSpotlight) {
    const [main, ...rest] = orderedTiles;
    return (
      <div className={styles.videoGridWrapper}>
        <div
          className={gridClasses}
          role="region"
          aria-label={`Video gallery, ${totalCount} participants, spotlight view`}
        >
          <div className={styles.spotlightMain}>
            {renderTile(main, "spotlight")}
          </div>
          <div className={styles.spotlightStrip} aria-label="Other participants">
            {rest.map((tile) => renderTile(tile, "thumbnail"))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.videoGridWrapper}>
      <div
        className={gridClasses}
        role="region"
        aria-label={`Video gallery, ${totalCount} participants`}
        style={
          layout.columns
            ? {
                gridTemplateColumns: `repeat(${layout.columns}, minmax(0, 1fr))`,
              }
            : undefined
        }
      >
        {visibleTiles.map((tile) => renderTile(tile))}
      </div>

      {needsPagination && totalPages > 1 && (
        <nav
          className={styles.galleryPagination}
          aria-label="Participant pages"
        >
          <IconButton
            size="small"
            onClick={goToPrevPage}
            disabled={safePage === 0}
            aria-label="Previous page"
            className={styles.galleryNavBtn}
          >
            <ChevronLeftIcon />
          </IconButton>
          <span className={styles.galleryPageInfo}>
            Page {safePage + 1} of {totalPages}
            <span className={styles.galleryPageCount}>
              ({totalCount} participants)
            </span>
          </span>
          <IconButton
            size="small"
            onClick={goToNextPage}
            disabled={safePage >= totalPages - 1}
            aria-label="Next page"
            className={styles.galleryNavBtn}
          >
            <ChevronRightIcon />
          </IconButton>
        </nav>
      )}
    </div>
  );
};

export default React.memo(VideoGrid);
