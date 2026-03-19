import mongoose, { Schema } from "mongoose";

const meetingSchema = new Schema({
  user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
  meetingCode: { type: String, required: true },
  title: { type: String, default: "", trim: true, maxlength: 120 },
  date: { type: Date, default: Date.now },
  endedAt: { type: Date, default: null },
  duration: { type: Number, default: 0 }, // seconds
  participants: [{ type: String, trim: true }], // usernames who joined
  chatMessageCount: { type: Number, default: 0 },
  signDetections: [
    {
      label: { type: String, trim: true },
      count: { type: Number, default: 1 },
    },
  ],
  chatTranscript: [
    {
      sender: { type: String, trim: true, maxlength: 50 },
      text: { type: String, trim: true, maxlength: 2000 },
      timestamp: { type: Date },
    },
  ],
  meetingSummary: {
    quickSummary: { type: String, trim: true, maxlength: 1200 },
    keyPoints: [{ type: String, trim: true, maxlength: 240 }],
    topKeywords: [{ type: String, trim: true, maxlength: 40 }],
    topSigns: [
      {
        label: { type: String, trim: true, maxlength: 50 },
        count: { type: Number, default: 1 },
      },
    ],
    generatedAt: { type: Date },
  },
  starred: { type: Boolean, default: false },
});

meetingSchema.index({ user_id: 1, date: -1 });

const Meeting = mongoose.model("Meeting", meetingSchema);

export { Meeting };
