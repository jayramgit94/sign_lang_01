/**
 * Auth Validation Schemas — Zod-based request validation.
 */
import { z } from "zod";

export const registerSchema = z.object({
  body: z.object({
    name: z
      .string()
      .min(2, "Name must be at least 2 characters.")
      .max(50, "Name cannot exceed 50 characters.")
      .trim(),
    username: z
      .string()
      .min(3, "Username must be at least 3 characters.")
      .max(30, "Username cannot exceed 30 characters.")
      .regex(
        /^[a-zA-Z0-9_]+$/,
        "Username can only contain letters, numbers, and underscores.",
      )
      .trim()
      .toLowerCase(),
    password: z
      .string()
      .min(4, "Password must be at least 4 characters.")
      .max(128, "Password cannot exceed 128 characters."),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    username: z.string().min(1, "Username is required.").trim().toLowerCase(),
    password: z.string().min(1, "Password is required."),
  }),
});
