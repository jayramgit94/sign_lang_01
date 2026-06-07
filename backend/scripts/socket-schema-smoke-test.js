import assert from "assert";
import {
  answerSchema,
  candidateSchema,
  captionSchema,
  chatSchema,
  joinRoomSchema,
  mediaStateSchema,
  offerSchema,
  renegotiateSchema,
} from "../src/controllers/socket/schemas.js";

const mustPass = (schema, payload) => {
  const result = schema.safeParse(payload);
  assert.ok(result.success, `Expected schema to pass: ${schema._def?.typeName}`);
};

const mustFail = (schema, payload) => {
  const result = schema.safeParse(payload);
  assert.ok(!result.success, `Expected schema to fail: ${schema._def?.typeName}`);
};

mustPass(offerSchema, { to: "peer-1", offer: { type: "offer" } });
mustPass(answerSchema, { to: "peer-1", answer: { type: "answer" } });
mustPass(candidateSchema, { to: "peer-1", candidate: { candidate: "abc" } });
mustPass(renegotiateSchema, { to: "peer-1" });
mustPass(captionSchema, { text: "hello", score: 0.9, isSentence: false });
mustPass(joinRoomSchema, { roomCode: "abcdef", username: "Guest" });
mustPass(mediaStateSchema, { video: true, audio: false });
mustPass(chatSchema, { data: "hello", sender: "Guest" });

mustFail(joinRoomSchema, { roomCode: "" });
mustFail(captionSchema, { text: "" });
mustFail(chatSchema, { data: "" });

console.log("Socket schema smoke test passed.");
