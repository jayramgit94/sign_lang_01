/**
 * Meeting Controller — Meeting history management.
 */
import mongoose from "mongoose";
import { Meeting } from "../models/meeting.model.js";

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
      "signDetections",
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

    const meeting = await Meeting.findOneAndUpdate(
      { _id: id, user_id: req.user.userId },
      { $set: updates },
      { new: true },
    ).lean();

    if (!meeting) {
      return res.status(404).json({ message: "Meeting not found." });
    }

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
