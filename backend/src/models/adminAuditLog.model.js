import mongoose, { Schema } from "mongoose";

const adminAuditLogSchema = new Schema(
  {
    adminUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    adminEmail: { type: String, required: true, trim: true, lowercase: true, index: true },
    action: { type: String, required: true, trim: true, index: true },
    targetType: { type: String, required: true, trim: true, index: true },
    targetId: { type: String, default: "", trim: true, index: true },
    details: { type: Schema.Types.Mixed, default: {} },
    ipAddress: { type: String, default: "", trim: true },
  },
  {
    timestamps: true,
  }
);

const AdminAuditLog = mongoose.model("AdminAuditLog", adminAuditLogSchema);

export { AdminAuditLog };
