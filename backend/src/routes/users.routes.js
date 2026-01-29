import { Router } from "express";
import {
  addToHistory,
  checkDBConnection,
  getUserHistory,
  login,
  register,
} from "../controllers/user.controller.js";

const router = Router();

// Apply DB connection check to all routes
router.use(checkDBConnection);

router.route("/login").post(login);
router.route("/register").post(register);
router.route("/add_to_activity").post(addToHistory);
router.route("/get_all_activity").get(getUserHistory);

export default router;
