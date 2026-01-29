import bcrypt from "bcrypt";
import crypto from "crypto";
import httpStatus from "http-status";
import mongoose from "mongoose";
import { Meeting } from "../models/meeting.model.js";
import { User } from "../models/user.model.js";

// Middleware to check DB connection
const checkDBConnection = async (req, res, next) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      message: "Database connection not ready. Please try again in a moment.",
    });
  }
  next();
};

const login = async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: "Please Provide" });
  }

  try {
    const user = await User.findOne({ username }).maxTimeMS(10000); // 10 second timeout
    if (!user) {
      return res
        .status(httpStatus.NOT_FOUND)
        .json({ message: "User Not Found" });
    }

    let isPasswordCorrect = await bcrypt.compare(password, user.password);

    if (isPasswordCorrect) {
      let token = crypto.randomBytes(20).toString("hex");

      user.token = token;
      await user.save();
      return res.status(httpStatus.OK).json({ token: token });
    } else {
      return res
        .status(httpStatus.UNAUTHORIZED)
        .json({ message: "Password sahi daalo broo..." });
    }
  } catch (e) {
    console.error("Login error:", e);
    return res
      .status(500)
      .json({ message: `Something went wrong ${e.message}` });
  }
};

const register = async (req, res) => {
  const { name, username, password } = req.body;

  try {
    const existingUser = await User.findOne({ username }).maxTimeMS(10000); // 10 second timeout
    if (existingUser) {
      return res
        .status(httpStatus.FOUND)
        .json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      name: name,
      username: username,
      password: hashedPassword,
    });

    await newUser.save();

    res.status(httpStatus.CREATED).json({ message: "User Registered" });
  } catch (e) {
    console.error("Register error:", e);
    res.status(500).json({ message: `Something went wrong ${e.message}` });
  }
};

const getUserHistory = async (req, res) => {
  const { token } = req.query;

  try {
    const user = await User.findOne({ token: token }).maxTimeMS(10000);

    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    const meetings = await Meeting.find({ user_id: user._id }).maxTimeMS(10000);
    res.json(meetings);
  } catch (e) {
    console.error("Get history error:", e);
    res.status(500).json({ message: `Something went wrong ${e.message}` });
  }
};

const addToHistory = async (req, res) => {
  const { token, meeting_code } = req.body;

  try {
    const user = await User.findOne({ token: token }).maxTimeMS(10000);

    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    const newMeeting = new Meeting({
      user_id: user._id,
      meetingCode: meeting_code,
    });

    await newMeeting.save();

    res.status(httpStatus.CREATED).json({ message: "Added code to history" });
  } catch (e) {
    res.status(500).json({ message: `Something went wrong ${e}` });
  }
};

export { addToHistory, checkDBConnection, getUserHistory, login, register };
