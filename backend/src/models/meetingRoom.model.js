import mongoose, { Schema } from "mongoose";

const meetingRoomSchema = new Schema(
  {
    meetingId: { type: String, required: true, unique: true, trim: true, index: true },
    passwordHash: { type: String, required: true },
    hostUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    hostEmail: { type: String, required: true, trim: true, lowercase: true, index: true },
    createdByName: { type: String, required: true, trim: true },
    scheduledStartAt: { type: Date, required: true, index: true },
    durationMinutes: { type: Number, required: true, min: 1, max: 720 },
    scheduledEndAt: { type: Date, required: true, index: true },
    reminderAt: { type: Date, required: true, index: true },
    reminderSentAt: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
  }
);

const MeetingRoom = mongoose.model("MeetingRoom", meetingRoomSchema);

export { MeetingRoom };
