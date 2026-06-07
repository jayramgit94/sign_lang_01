/**
 * Meeting Routes
 */
import { Router } from "express";
import {
  addToHistory,
  deleteMeeting,
  getHistory,
  getStats,
  updateMeeting,
} from "../controllers/meeting.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { readLimiter, statsLimiter } from "../middleware/rateLimiter.js";

const router = Router();

router.get("/stats", requireAuth, statsLimiter, getStats);
router.post("/", requireAuth, addToHistory);
router.get("/", requireAuth, readLimiter, getHistory);
router.patch("/:id", requireAuth, updateMeeting);
router.delete("/:id", requireAuth, deleteMeeting);

export default router;
