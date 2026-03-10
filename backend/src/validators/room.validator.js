/**
 * Room Validation Schemas — Zod-based request validation.
 */
import { z } from "zod";

export const joinRoomSchema = z.object({
  params: z.object({
    code: z
      .string()
      .min(1, "Room code is required.")
      .max(100, "Invalid room code."),
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
