import mongoose, { Schema } from "mongoose";

const userSchema = new Schema(
    {
        name: { type: String, required: true, trim: true },
        username: { type: String, required: true, unique: true, trim: true },
        email: { type: String, required: true, unique: true, lowercase: true, trim: true },
        password: { type: String, required: true },
        token: { type: String, default: null }, // legacy session token (deprecated)
        tokenHash: { type: String, default: null, index: true },
        tokenExpiresAt: { type: Date, default: null, index: true },
        role: { type: String, enum: ["user", "host", "admin"], default: "user", index: true },
        isActive: { type: Boolean, default: true, index: true },
        lastLoginAt: { type: Date, default: null },
    },
    { timestamps: true }
);

const User = mongoose.model("User", userSchema);

export { User };
