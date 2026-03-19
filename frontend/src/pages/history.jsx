import AccessTimeIcon from "@mui/icons-material/AccessTime";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import GroupIcon from "@mui/icons-material/Group";
import HomeIcon from "@mui/icons-material/Home";
import SearchIcon from "@mui/icons-material/Search";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import { IconButton, InputAdornment, TextField, Tooltip } from "@mui/material";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardActions from "@mui/material/CardActions";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import { AnimatePresence, motion } from "framer-motion";
import { useSnackbar } from "notistack";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageTransition from "../components/common/PageTransition";
import { AuthContext } from "../contexts/AuthContext";

// ── helpers ────────────────────────────────────────
const formatDuration = (seconds) => {
  if (!seconds || seconds <= 0) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

const getDateGroup = (dateStr) => {
  const d = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);
  if (d >= today) return "Today";
  if (d >= yesterday) return "Yesterday";
  if (d >= weekAgo) return "This Week";
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
};

const formatDate = (dateStr) => {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatTimeOnly = (dateStr) => {
  return new Date(dateStr).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

// ── animation variants ─────────────────────────────
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
      delay: i * 0.06,
      ease: [0.25, 0.46, 0.45, 0.94],
    },
  }),
  exit: { opacity: 0, scale: 0.95, transition: { duration: 0.25 } },
};

// ── stat card ──────────────────────────────────────
const StatCard = ({ label, value, sub, delay }) => (
  <motion.div {...fadeUp(delay)} className="historyStat">
    <Typography className="historyStatValue">{value}</Typography>
    <Typography className="historyStatLabel">{label}</Typography>
    {sub && <Typography className="historyStatSub">{sub}</Typography>}
  </motion.div>
);

// ── main component ─────────────────────────────────
export default function History() {
  const { getHistoryOfUser, deleteMeeting, updateMeeting, getMeetingStats } =
    useContext(AuthContext);
  const { enqueueSnackbar } = useSnackbar();
  const routeTo = useNavigate();

  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterStarred, setFilterStarred] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
    setMeetings([]);
  }, [debouncedSearch, filterStarred]);

  // Fetch meetings
  const fetchMeetings = useCallback(
    async (pageNum) => {
      try {
        setLoading(true);
        const params = { page: pageNum, limit: 20 };
        if (debouncedSearch) params.search = debouncedSearch;
        if (filterStarred) params.starred = "true";

        const data = await getHistoryOfUser(params);
        setMeetings((prev) =>
          pageNum === 1 ? data.meetings : [...prev, ...data.meetings],
        );
        setHasMore(data.hasMore);
        setTotal(data.total);
      } catch (err) {
        setError(err.message || "Failed to fetch history");
      } finally {
        setLoading(false);
      }
    },
    [getHistoryOfUser, debouncedSearch, filterStarred],
  );

  useEffect(() => {
    fetchMeetings(page);
  }, [fetchMeetings, page]);

  // Fetch stats once on mount
  useEffect(() => {
    getMeetingStats().then((s) => s && setStats(s));
  }, [getMeetingStats]);

  // ── actions ──
  const handleDelete = async (id) => {
    const ok = await deleteMeeting(id);
    if (ok) {
      setMeetings((prev) => prev.filter((m) => m._id !== id));
      setTotal((prev) => prev - 1);
      enqueueSnackbar("Meeting deleted", { variant: "success" });
    }
  };

  const handleToggleStar = async (meeting) => {
    const updated = await updateMeeting(meeting._id, {
      starred: !meeting.starred,
    });
    if (updated) {
      setMeetings((prev) =>
        prev.map((m) => (m._id === updated._id ? updated : m)),
      );
    }
  };

  const handleCopyLink = (code) => {
    const link = `${window.location.origin}/${code}`;
    navigator.clipboard.writeText(link);
    enqueueSnackbar("Meeting link copied!", { variant: "info" });
  };

  const handleLoadMore = () => setPage((p) => p + 1);

  // ── group meetings by date ──
  const grouped = useMemo(() => {
    const groups = new Map();
    meetings.forEach((m) => {
      const key = getDateGroup(m.date);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(m);
    });
    return groups;
  }, [meetings]);

  // ── render ──
  return (
    <PageTransition>
      <div className="historyPage">
        {/* ── Header ── */}
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
              {total > 0
                ? `${total} meetings recorded`
                : "Review your past calls"}
            </Typography>
          </div>
          <div className="historyHeaderActions">
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

        {/* ── Stats Dashboard ── */}
        {stats && (
          <div className="historyStatsRow">
            <StatCard
              label="This Week"
              value={stats.thisWeek}
              sub="meetings"
              delay={0.05}
            />
            <StatCard
              label="This Month"
              value={stats.thisMonth}
              sub="meetings"
              delay={0.1}
            />
            <StatCard
              label="Total Time"
              value={formatDuration(stats.totalDuration) || "0m"}
              sub="in calls"
              delay={0.15}
            />
            <StatCard
              label="Avg Duration"
              value={formatDuration(stats.avgDuration) || "—"}
              sub="per call"
              delay={0.2}
            />
            {stats.topSignDetections?.length > 0 && (
              <StatCard
                label="Top Sign"
                value={stats.topSignDetections[0]._id}
                sub={`${stats.topSignDetections[0].count}× detected`}
                delay={0.25}
              />
            )}
          </div>
        )}

        {/* ── Frequent Rooms ── */}
        {stats?.frequentRooms?.length > 0 && (
          <motion.div {...fadeUp(0.2)} className="historyFrequentRow">
            <Typography className="historyFrequentTitle">
              Frequent rooms
            </Typography>
            <div className="historyFrequentChips">
              {stats.frequentRooms.map((r) => (
                <Chip
                  key={r._id}
                  label={`${r._id} (${r.count}×)`}
                  variant="outlined"
                  size="small"
                  className="historyFrequentChip"
                  onClick={() => routeTo(`/${r._id}`)}
                />
              ))}
            </div>
          </motion.div>
        )}

        {/* ── Search & Filter Bar ── */}
        <motion.div {...fadeUp(0.15)} className="historySearchRow">
          <TextField
            placeholder="Search by code, title, or participant..."
            variant="outlined"
            size="small"
            fullWidth
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="historySearchField"
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ color: "var(--text-muted)" }} />
                  </InputAdornment>
                ),
              },
            }}
          />
          <Tooltip title={filterStarred ? "Show all" : "Starred only"}>
            <IconButton
              onClick={() => setFilterStarred((p) => !p)}
              className={`historyFilterBtn ${filterStarred ? "active" : ""}`}
            >
              {filterStarred ? (
                <StarIcon sx={{ color: "#fbbf24" }} />
              ) : (
                <StarBorderIcon />
              )}
            </IconButton>
          </Tooltip>
        </motion.div>

        {/* ── Meeting List ── */}
        <Container maxWidth="md" className="historyContainer">
          {loading && meetings.length === 0 ? (
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
            <>
              {Array.from(grouped.entries()).map(
                ([groupLabel, groupMeetings]) => (
                  <Box key={groupLabel} className="historyDateGroup">
                    <Typography className="historyDateLabel">
                      {groupLabel}
                    </Typography>
                    <AnimatePresence>
                      {groupMeetings.map((meeting, i) => {
                        const dur = formatDuration(meeting.duration);
                        const pCount = meeting.participants?.length || 0;
                        const isExpanded = expandedId === meeting._id;

                        return (
                          <motion.div
                            key={meeting._id}
                            variants={cardVariants}
                            initial="initial"
                            animate="animate"
                            exit="exit"
                            custom={i}
                            layout
                          >
                            <Card
                              className={`historyCard ${isExpanded ? "expanded" : ""}`}
                              variant="outlined"
                              onClick={() =>
                                setExpandedId(isExpanded ? null : meeting._id)
                              }
                            >
                              <CardContent className="historyCardContent">
                                <div className="historyCardTopRow">
                                  <div className="historyCardInfo">
                                    <Typography
                                      className="historyCode"
                                      gutterBottom
                                    >
                                      {meeting.title || meeting.meetingCode}
                                    </Typography>
                                    {meeting.title && (
                                      <Typography className="historyCodeSub">
                                        {meeting.meetingCode}
                                      </Typography>
                                    )}
                                  </div>

                                  <div className="historyCardBadges">
                                    {dur && (
                                      <Chip
                                        icon={
                                          <AccessTimeIcon
                                            sx={{ fontSize: 14 }}
                                          />
                                        }
                                        label={dur}
                                        size="small"
                                        className="historyChip duration"
                                      />
                                    )}
                                    {pCount > 0 && (
                                      <Chip
                                        icon={
                                          <GroupIcon sx={{ fontSize: 14 }} />
                                        }
                                        label={`${pCount}`}
                                        size="small"
                                        className="historyChip participants"
                                      />
                                    )}
                                    {meeting.signDetections?.length > 0 && (
                                      <Chip
                                        label={`🤟 ${meeting.signDetections.reduce((sum, d) => sum + d.count, 0)}`}
                                        size="small"
                                        className="historyChip signs"
                                      />
                                    )}
                                    {meeting.chatMessageCount > 0 && (
                                      <Chip
                                        label={`💬 ${meeting.chatMessageCount}`}
                                        size="small"
                                        className="historyChip chat"
                                      />
                                    )}
                                  </div>
                                </div>

                                <Typography className="historyMeta">
                                  {formatDate(meeting.date)}
                                </Typography>

                                {/* ── Expanded Detail ── */}
                                <AnimatePresence>
                                  {isExpanded && (
                                    <motion.div
                                      initial={{ height: 0, opacity: 0 }}
                                      animate={{ height: "auto", opacity: 1 }}
                                      exit={{ height: 0, opacity: 0 }}
                                      transition={{ duration: 0.3 }}
                                      className="historyExpanded"
                                    >
                                      {pCount > 0 && (
                                        <div className="historyDetailRow">
                                          <Typography className="historyDetailLabel">
                                            Participants
                                          </Typography>
                                          <div className="historyParticipantChips">
                                            {meeting.participants.map((p) => (
                                              <Chip
                                                key={p}
                                                label={p}
                                                size="small"
                                                className="historyParticipantChip"
                                              />
                                            ))}
                                          </div>
                                        </div>
                                      )}

                                      {meeting.signDetections?.length > 0 && (
                                        <div className="historyDetailRow">
                                          <Typography className="historyDetailLabel">
                                            Signs Detected
                                          </Typography>
                                          <div className="historySignChips">
                                            {meeting.signDetections.map((d) => (
                                              <Chip
                                                key={d.label}
                                                label={`${d.label} ×${d.count}`}
                                                size="small"
                                                className="historySignChip"
                                              />
                                            ))}
                                          </div>
                                        </div>
                                      )}

                                      {meeting.chatMessageCount > 0 && (
                                        <div className="historyDetailRow">
                                          <Typography className="historyDetailLabel">
                                            Chat Messages
                                          </Typography>
                                          <Typography className="historyDetailValue">
                                            {meeting.chatMessageCount} messages
                                            exchanged
                                          </Typography>
                                        </div>
                                      )}

                                      {meeting.meetingSummary?.quickSummary && (
                                        <div className="historyDetailRow">
                                          <Typography className="historyDetailLabel">
                                            Meeting Summary
                                          </Typography>
                                          <Typography className="historySummaryText">
                                            {meeting.meetingSummary.quickSummary}
                                          </Typography>

                                          {meeting.meetingSummary.keyPoints
                                            ?.length > 0 && (
                                            <div className="historySummaryPoints">
                                              {meeting.meetingSummary.keyPoints.map(
                                                (point, idx) => (
                                                  <Typography
                                                    key={`${meeting._id}-kp-${idx}`}
                                                    className="historySummaryPoint"
                                                  >
                                                    • {point}
                                                  </Typography>
                                                ),
                                              )}
                                            </div>
                                          )}

                                          {meeting.meetingSummary.topKeywords
                                            ?.length > 0 && (
                                            <div className="historyKeywordChips">
                                              {meeting.meetingSummary.topKeywords.map(
                                                (k) => (
                                                  <Chip
                                                    key={`${meeting._id}-kw-${k}`}
                                                    label={k}
                                                    size="small"
                                                    className="historyKeywordChip"
                                                  />
                                                ),
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      )}

                                      {meeting.chatTranscript?.length > 0 && (
                                        <div className="historyDetailRow">
                                          <Typography className="historyDetailLabel">
                                            Full Chat Transcript
                                          </Typography>
                                          <div className="historyTranscriptBox">
                                            {meeting.chatTranscript.map((msg, idx) => (
                                              <div
                                                key={`${meeting._id}-msg-${idx}`}
                                                className="historyTranscriptRow"
                                              >
                                                <Typography className="historyTranscriptMeta">
                                                  {msg.sender || "Guest"} •{" "}
                                                  {msg.timestamp
                                                    ? formatTimeOnly(msg.timestamp)
                                                    : "--:--"}
                                                </Typography>
                                                <Typography className="historyTranscriptText">
                                                  {msg.text || msg.data}
                                                </Typography>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}

                                      {dur && (
                                        <div className="historyDetailRow">
                                          <Typography className="historyDetailLabel">
                                            Duration
                                          </Typography>
                                          <Typography className="historyDetailValue">
                                            {dur}
                                            {meeting.endedAt &&
                                              ` — ended ${formatDate(meeting.endedAt)}`}
                                          </Typography>
                                        </div>
                                      )}
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </CardContent>

                              <CardActions
                                className="historyActions"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <motion.div
                                  whileHover={{ scale: 1.06 }}
                                  whileTap={{ scale: 0.96 }}
                                >
                                  <Button
                                    size="small"
                                    variant="outlined"
                                    onClick={() =>
                                      routeTo(`/${meeting.meetingCode}`)
                                    }
                                  >
                                    Rejoin
                                  </Button>
                                </motion.div>

                                <Tooltip title="Copy meeting link">
                                  <IconButton
                                    size="small"
                                    className="historyActionIcon"
                                    onClick={() =>
                                      handleCopyLink(meeting.meetingCode)
                                    }
                                  >
                                    <ContentCopyIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>

                                <Tooltip
                                  title={meeting.starred ? "Unstar" : "Star"}
                                >
                                  <IconButton
                                    size="small"
                                    className="historyActionIcon"
                                    onClick={() => handleToggleStar(meeting)}
                                  >
                                    {meeting.starred ? (
                                      <StarIcon
                                        fontSize="small"
                                        sx={{ color: "#fbbf24" }}
                                      />
                                    ) : (
                                      <StarBorderIcon fontSize="small" />
                                    )}
                                  </IconButton>
                                </Tooltip>

                                <Tooltip title="Delete">
                                  <IconButton
                                    size="small"
                                    className="historyActionIcon delete"
                                    onClick={() => handleDelete(meeting._id)}
                                  >
                                    <DeleteOutlineIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              </CardActions>
                            </Card>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </Box>
                ),
              )}

              {/* Load more */}
              {hasMore && (
                <motion.div
                  {...fadeUp(0.1)}
                  style={{ textAlign: "center", marginTop: "1.5rem" }}
                >
                  <Button
                    variant="outlined"
                    onClick={handleLoadMore}
                    disabled={loading}
                    className="historyClearButton"
                  >
                    {loading ? "Loading..." : "Load more"}
                  </Button>
                </motion.div>
              )}
            </>
          ) : (
            <motion.div {...fadeUp(0.15)}>
              <Card className="historyEmpty">
                <Typography variant="body1" color="textSecondary">
                  {debouncedSearch || filterStarred
                    ? "No meetings match your filters."
                    : "No meetings yet. Start a new meeting to see it here."}
                </Typography>
              </Card>
            </motion.div>
          )}
        </Container>
      </div>
    </PageTransition>
  );
}
