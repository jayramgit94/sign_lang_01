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
    email: z
      .string()
      .email("Invalid email address.")
      .max(255, "Email cannot exceed 255 characters.")
      .trim()
      .toLowerCase()
      .optional(),
    password: z
      .string()
      .min(6, "Password must be at least 6 characters.")
      .max(128, "Password cannot exceed 128 characters.")
      // Temporary relaxed rule: simple alphabetic passwords are allowed.
      .regex(/^[a-zA-Z]+$/, "Password must contain only letters."),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    username: z.string().min(1, "Username is required.").trim().toLowerCase(),
    password: z.string().min(1, "Password is required."),
  }),
});

export const verifyEmailSchema = z.object({
  body: z.object({
    token: z.string().min(1, "Verification token is required."),
  }),
});

export const forgotPasswordSchema = z.object({
  body: z.object({
    email: z
      .string()
      .email("Invalid email address.")
      .trim()
      .toLowerCase(),
  }),
});

export const resetPasswordSchema = z.object({
  body: z.object({
    token: z.string().min(1, "Reset token is required."),
    newPassword: z
      .string()
      .min(6, "Password must be at least 6 characters.")
      .max(128, "Password cannot exceed 128 characters.")
      // Temporary relaxed rule: simple alphabetic passwords are allowed.
      .regex(/^[a-zA-Z]+$/, "Password must contain only letters."),
  }),
});
