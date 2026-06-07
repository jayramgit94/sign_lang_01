import { z } from "zod";

export const offerSchema = z.object({
  to: z.string().min(1).max(64),
  offer: z.unknown(),
});

export const answerSchema = z.object({
  to: z.string().min(1).max(64),
  answer: z.unknown(),
});

export const candidateSchema = z.object({
  to: z.string().min(1).max(64),
  candidate: z.unknown(),
});

export const renegotiateSchema = z.object({
  to: z.string().min(1).max(64),
});

export const captionSchema = z.object({
  text: z.string().min(1).max(2000),
  score: z.number().optional(),
  isSentence: z.boolean().optional(),
});

export const joinRoomSchema = z.object({
  roomCode: z.string().min(1).max(12),
  username: z.string().max(50).optional(),
});

export const mediaStateSchema = z.object({
  video: z.boolean().optional(),
  audio: z.boolean().optional(),
});

export const chatSchema = z.object({
  data: z.string().min(1).max(2000),
  sender: z.string().max(50).optional(),
});
