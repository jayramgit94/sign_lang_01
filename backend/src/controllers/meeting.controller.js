/**
 * Meeting Controller — Meeting history management.
 */
import { Meeting } from "../models/meeting.model.js";

/**
 * POST /api/v1/meetings — Record a meeting in history.
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

    await Meeting.create({
      user_id: req.user.userId,
      meetingCode: sanitized,
    });

    res.status(201).json({ message: "Meeting recorded." });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/meetings — Get user's meeting history.
 */
export const getHistory = async (req, res, next) => {
  try {
    const meetings = await Meeting.find({ user_id: req.user.userId })
      .sort({ date: -1 })
      .limit(50)
      .lean();

    res.status(200).json(meetings);
  } catch (err) {
    next(err);
  }
};
