import mongoose, { Schema } from "mongoose";

const meetingRecordingSchema = new Schema(
  {
    meetingId: { type: String, required: true, trim: true, index: true },
    hostUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    fileName: { type: String, required: true, trim: true },
    filePath: { type: String, required: true, trim: true },
    mimeType: { type: String, default: "video/webm" },
    sizeBytes: { type: Number, default: 0 },
    durationSeconds: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  }
);

const MeetingRecording = mongoose.model("MeetingRecording", meetingRecordingSchema);

export { MeetingRecording };
