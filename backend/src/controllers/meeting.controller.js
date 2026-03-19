/**
 * Meeting Controller — Meeting history management.
 */
import mongoose from "mongoose";
import { Meeting } from "../models/meeting.model.js";

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "has",
  "he",
  "in",
  "is",
  "it",
  "its",
  "of",
  "on",
  "that",
  "the",
  "to",
  "was",
  "were",
  "will",
  "with",
  "you",
  "your",
  "we",
  "our",
  "i",
  "me",
  "my",
]);

const toDurationLabel = (seconds) => {
  const s = Math.max(0, Number(seconds) || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

const buildMeetingSummary = ({
  title,
  meetingCode,
  participants,
  duration,
  chatTranscript,
  signDetections,
}) => {
  const transcript = Array.isArray(chatTranscript) ? chatTranscript : [];
  const signs = Array.isArray(signDetections) ? signDetections : [];
  const participantSet = new Set((participants || []).filter(Boolean));

  const speakerCounts = new Map();
  const allText = [];
  for (const msg of transcript) {
    if (!msg?.text) continue;
    allText.push(msg.text);
    const speaker = msg.sender || "Unknown";
    speakerCounts.set(speaker, (speakerCounts.get(speaker) || 0) + 1);
    participantSet.add(speaker);
  }

  const keywords = new Map();
  for (const text of allText) {
    const tokens = text
      .toLowerCase()
      .replace(/[^a-z0-9\s']/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2 && !STOP_WORDS.has(t));
    for (const token of tokens) {
      keywords.set(token, (keywords.get(token) || 0) + 1);
    }
  }

  const topKeywords = [...keywords.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([word]) => word);

  const topSigns = [...signs]
    .sort((a, b) => (Number(b.count) || 0) - (Number(a.count) || 0))
    .slice(0, 6)
    .map((s) => ({
      label: (s.label || "").trim().slice(0, 50),
      count: Math.max(1, Number(s.count) || 1),
    }));

  const topSpeaker = [...speakerCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const roomLabel = title || meetingCode;
  const quickSummaryParts = [
    `Meeting ${roomLabel ? `"${roomLabel}" ` : ""}ran for ${toDurationLabel(duration)} with ${participantSet.size || 1} participant(s).`,
    `A total of ${transcript.length} chat message(s) were exchanged.`,
    topSpeaker
      ? `Most active speaker: ${topSpeaker[0]} (${topSpeaker[1]} messages).`
      : "No dominant speaker detected.",
    topSigns.length > 0
      ? `Top sign(s): ${topSigns
          .slice(0, 3)
          .map((s) => `${s.label} (${s.count})`)
          .join(", ")}.`
      : "No sign detections were recorded.",
    topKeywords.length > 0
      ? `Main discussion keywords: ${topKeywords.slice(0, 5).join(", ")}.`
      : "Not enough chat content for keyword extraction.",
  ];

  const keyPoints = [
    `${participantSet.size || 1} participant(s) in this meeting`,
    `${transcript.length} total chat message(s)`,
    `${topSigns.reduce((sum, s) => sum + s.count, 0)} total sign detection(s)`,
  ];

  if (topSpeaker) {
    keyPoints.push(`Most active participant: ${topSpeaker[0]} (${topSpeaker[1]} messages)`);
  }

  return {
    quickSummary: quickSummaryParts.join(" "),
    keyPoints: keyPoints.slice(0, 6),
    topKeywords,
    topSigns,
    generatedAt: new Date(),
  };
};

/**
 * POST /api/v1/meetings — Record a meeting in history. Returns the created doc.
 */
export const addToHistory = async (req, res, next) => {
  try {
    const { meetingCode } = req.body;

    if (!meetingCode || typeof meetingCode !== "string") {
      return res.status(400).json({ message: "Meeting code is required." });
    }

    const sanitized = meetingCode.trim().slice(0, 100);
    if (!sanitized || !/^[\w-]+$/.test(sanitized)) {
      return res.status(400).json({ message: "Invalid meeting code format." });
    }

    const meeting = await Meeting.create({
      user_id: req.user.userId,
      meetingCode: sanitized,
    });

    res.status(201).json(meeting);
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/v1/meetings/:id — Update meeting with end-of-call data.
 */
export const updateMeeting = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid meeting ID." });
    }

    const allowed = [
      "title",
      "endedAt",
      "duration",
      "participants",
      "chatMessageCount",
      "chatTranscript",
      "signDetections",
      "meetingSummary",
      "starred",
    ];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    if (updates.title && typeof updates.title === "string") {
      updates.title = updates.title.trim().slice(0, 120);
    }
    if (updates.participants && Array.isArray(updates.participants)) {
      updates.participants = updates.participants
        .filter((p) => typeof p === "string")
        .map((p) => p.trim().slice(0, 50))
        .slice(0, 50);
    }
    if (updates.signDetections && Array.isArray(updates.signDetections)) {
      updates.signDetections = updates.signDetections
        .filter((d) => d && typeof d.label === "string")
        .map((d) => ({
          label: d.label.trim().slice(0, 50),
          count: Math.max(1, Number(d.count) || 1),
        }))
        .slice(0, 100);
    }

    if (updates.chatTranscript && Array.isArray(updates.chatTranscript)) {
      updates.chatTranscript = updates.chatTranscript
        .map((m) => {
          const sender =
            typeof m?.sender === "string" ? m.sender.trim().slice(0, 50) : "Guest";
          const rawText = typeof m?.text === "string" ? m.text : m?.data;
          const text = typeof rawText === "string" ? rawText.trim().slice(0, 2000) : "";
          if (!text) return null;
          const ts = m?.timestamp ? new Date(m.timestamp) : new Date();
          return {
            sender,
            text,
            timestamp: Number.isNaN(ts.getTime()) ? new Date() : ts,
          };
        })
        .filter(Boolean)
        .slice(0, 500);
    }

    const existingMeeting = await Meeting.findOne({
      _id: id,
      user_id: req.user.userId,
    }).lean();

    if (!existingMeeting) {
      return res.status(404).json({ message: "Meeting not found." });
    }

    if (!updates.meetingSummary) {
      const merged = { ...existingMeeting, ...updates };
      updates.meetingSummary = buildMeetingSummary(merged);
    }

    const meeting = await Meeting.findOneAndUpdate(
      { _id: id, user_id: req.user.userId },
      { $set: updates },
      { new: true },
    ).lean();

    res.json(meeting);
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/v1/meetings/:id — Delete a single meeting from history.
 */
export const deleteMeeting = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid meeting ID." });
    }

    const result = await Meeting.findOneAndDelete({
      _id: id,
      user_id: req.user.userId,
    });

    if (!result) {
      return res.status(404).json({ message: "Meeting not found." });
    }

    res.json({ message: "Meeting deleted." });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/meetings/stats — Get aggregated meeting stats.
 */
export const getStats = async (req, res, next) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.userId);
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [stats] = await Meeting.aggregate([
      { $match: { user_id: userId } },
      {
        $facet: {
          total: [{ $count: "count" }],
          thisWeek: [
            { $match: { date: { $gte: weekAgo } } },
            { $count: "count" },
          ],
          thisMonth: [
            { $match: { date: { $gte: monthAgo } } },
            { $count: "count" },
          ],
          totalDuration: [
            { $group: { _id: null, sum: { $sum: "$duration" } } },
          ],
          avgDuration: [
            { $match: { duration: { $gt: 0 } } },
            { $group: { _id: null, avg: { $avg: "$duration" } } },
          ],
          frequentRooms: [
            { $group: { _id: "$meetingCode", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 5 },
          ],
          totalSignDetections: [
            { $unwind: "$signDetections" },
            {
              $group: {
                _id: "$signDetections.label",
                count: { $sum: "$signDetections.count" },
              },
            },
            { $sort: { count: -1 } },
            { $limit: 10 },
          ],
        },
      },
    ]);

    res.json({
      totalMeetings: stats.total[0]?.count || 0,
      thisWeek: stats.thisWeek[0]?.count || 0,
      thisMonth: stats.thisMonth[0]?.count || 0,
      totalDuration: stats.totalDuration[0]?.sum || 0,
      avgDuration: Math.round(stats.avgDuration[0]?.avg || 0),
      frequentRooms: stats.frequentRooms || [],
      topSignDetections: stats.totalSignDetections || [],
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/meetings — Get user's meeting history with pagination & search.
 */
export const getHistory = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;
    const search = req.query.search?.trim().slice(0, 100) || "";
    const starred = req.query.starred;

    const filter = { user_id: req.user.userId };

    if (search) {
      filter.$or = [
        { meetingCode: { $regex: search, $options: "i" } },
        { title: { $regex: search, $options: "i" } },
        { participants: { $regex: search, $options: "i" } },
      ];
    }

    if (starred === "true") {
      filter.starred = true;
    }

    const [meetings, total] = await Promise.all([
      Meeting.find(filter).sort({ date: -1 }).skip(skip).limit(limit).lean(),
      Meeting.countDocuments(filter),
    ]);

    res.json({
      meetings,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      hasMore: skip + meetings.length < total,
    });
  } catch (err) {
    next(err);
  }
};
