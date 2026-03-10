/**
 * Meeting Routes
 */
import { Router } from "express";
import { addToHistory, getHistory } from "../controllers/meeting.controller.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.post("/", requireAuth, addToHistory);
router.get("/", requireAuth, getHistory);

export default router;
