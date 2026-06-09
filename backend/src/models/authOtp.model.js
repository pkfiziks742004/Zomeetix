import mongoose, { Schema } from "mongoose";

const authOtpSchema = new Schema(
    {
        email: { type: String, required: true, lowercase: true, trim: true, index: true },
        purpose: { type: String, required: true, default: "auth", index: true },
        codeHash: { type: String, required: true },
        attempts: { type: Number, default: 0 },
        maxAttempts: { type: Number, default: 5 },
        verifiedAt: { type: Date, default: null },
        verificationTokenHash: { type: String, default: null },
        verificationExpiresAt: { type: Date, default: null, index: true },
        consumedAt: { type: Date, default: null },
        expiresAt: { type: Date, required: true, index: true },
    },
    { timestamps: true }
);

authOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const AuthOtp = mongoose.model("AuthOtp", authOtpSchema);

export { AuthOtp };
