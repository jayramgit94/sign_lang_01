/**
 * Room Validation Schemas — Zod-based request validation.
 */
import { z } from "zod";

export const joinRoomSchema = z.object({
  params: z.object({
    code: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z]{6}$/, "Room code must be exactly 6 letters."),
  }),
});

export const createRoomSchema = z.object({
  body: z
    .object({
      maxParticipants: z.number().int().min(2).max(50).optional(),
      muteOnJoin: z.boolean().optional(),
    })
    .optional()
    .default({}),
});
