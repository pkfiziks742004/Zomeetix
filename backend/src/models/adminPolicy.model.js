import mongoose, { Schema } from "mongoose";

const adminPolicySchema = new Schema(
  {
    singletonKey: { type: String, required: true, unique: true, default: "global" },
    allowGuestJoin: { type: Boolean, default: true },
    enforceWaitingRoom: { type: Boolean, default: false },
    maxMeetingDurationMinutes: { type: Number, default: 120, min: 15, max: 720 },
    recordingRetentionDays: { type: Number, default: 30, min: 1, max: 3650 },
    requireStrongMeetingPassword: { type: Boolean, default: true },
    updatedByUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    updatedByEmail: { type: String, default: "", trim: true, lowercase: true },
  },
  {
    timestamps: true,
  }
);

const AdminPolicy = mongoose.model("AdminPolicy", adminPolicySchema);

export { AdminPolicy };
