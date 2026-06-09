import httpStatus from "http-status";
import bcrypt from "bcrypt";
import crypto from "crypto";
import supabase, { SupabaseRestError } from "../db/supabase.js";

const normalizeEmail = (email) => (email ? String(email).trim().toLowerCase() : "");
const normalizeUsername = (username) => (username ? String(username).trim() : "");
const normalizeSetupKey = (value) => String(value || "").trim().replace(/^['"]|['"]$/g, "");
const normalizePurpose = (purpose) => (purpose ? String(purpose).trim().toLowerCase() : "auth");
const hashValue = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");
const isOtpRequired = () => String(process.env.AUTH_EMAIL_OTP_REQUIRED || "true").toLowerCase() !== "false";
const isOtpPreviewEnabled = () =>
  String(process.env.AUTH_EMAIL_OTP_PREVIEW || "").trim().toLowerCase() === "true";
const getSessionTtlDays = () => {
  const raw = Number(process.env.AUTH_TOKEN_TTL_DAYS || 7);
  if (!Number.isFinite(raw)) return 7;
  return Math.min(90, Math.max(1, Math.floor(raw)));
};
const getMinPasswordLength = () => {
  const raw = Number(process.env.AUTH_MIN_PASSWORD_LENGTH || 8);
  if (!Number.isFinite(raw)) return 8;
  return Math.min(72, Math.max(6, Math.floor(raw)));
};
const getPasswordResetTtlMinutes = () => {
  const raw = Number(process.env.AUTH_PASSWORD_RESET_TTL_MINUTES || 30);
  if (!Number.isFinite(raw)) return 30;
  return Math.min(180, Math.max(10, Math.floor(raw)));
};

const getPrimaryFrontendOrigin = () => {
  const raw = String(process.env.FRONTEND_ORIGIN || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return raw[0] || "http://localhost:3000";
};

const isUniqueViolation = (error) => {
  const code = error?.payload?.code || error?.code;
  if (code === "23505") return true;
  const message = String(error?.message || "").toLowerCase();
  return message.includes("duplicate key") || message.includes("unique constraint");
};

const createNumericOtp = () => String(Math.floor(100000 + Math.random() * 900000));

const normalizeSmtpPass = (value) => {
  const trimmed = String(value || "").trim();
  const looksLikeGroupedAppPassword = /^[a-zA-Z0-9]{4}(?:\s+[a-zA-Z0-9]{4}){3}$/.test(trimmed);
  return looksLikeGroupedAppPassword ? trimmed.replace(/\s+/g, "") : trimmed;
};

const sendOtpEmail = async ({ email, otpCode, purpose }) => {
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = Number(process.env.SMTP_PORT || 587);
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = normalizeSmtpPass(process.env.SMTP_PASS);
  const smtpFrom = process.env.SMTP_FROM || smtpUser || "no-reply@zomeetix.local";

  if (!smtpHost || !smtpUser || !smtpPass) {
    return false;
  }

  let nodemailer;
  try {
    ({ default: nodemailer } = await import("nodemailer"));
  } catch {
    return false;
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: String(process.env.SMTP_SECURE || "").toLowerCase() === "true" || smtpPort === 465,
    auth: { user: smtpUser, pass: smtpPass },
  });

  const subject = purpose === "login" ? "Zomeetix login verification code" : "Zomeetix verification code";
  await transporter.sendMail({
    from: smtpFrom,
    to: email,
    subject,
    text: `Your Zomeetix verification code is ${otpCode}. It expires in 10 minutes.`,
    html: `<p>Your Zomeetix verification code is <b>${otpCode}</b>.</p><p>This code expires in 10 minutes.</p>`,
  });

  return true;
};

const sendPasswordResetEmail = async ({ email, resetLink, expiresInMinutes }) => {
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = Number(process.env.SMTP_PORT || 587);
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = normalizeSmtpPass(process.env.SMTP_PASS);
  const smtpFrom = process.env.SMTP_FROM || smtpUser || "no-reply@zomeetix.local";

  if (!smtpHost || !smtpUser || !smtpPass) {
    return false;
  }

  let nodemailer;
  try {
    ({ default: nodemailer } = await import("nodemailer"));
  } catch {
    return false;
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: String(process.env.SMTP_SECURE || "").toLowerCase() === "true" || smtpPort === 465,
    auth: { user: smtpUser, pass: smtpPass },
  });

  const subject = "Reset your Zomeetix password";
  const minutes = Number(expiresInMinutes || 30);
  const safeMinutes = Number.isFinite(minutes) ? minutes : 30;
  await transporter.sendMail({
    from: smtpFrom,
    to: email,
    subject,
    text: `We received a request to reset your Zomeetix password.\n\nReset link (valid for ${safeMinutes} minutes):\n${resetLink}\n\nIf you didn't request this, you can ignore this email.`,
    html: `<p>We received a request to reset your Zomeetix password.</p>
      <p><a href="${resetLink}" target="_blank" rel="noreferrer">Reset your password</a></p>
      <p>This link is valid for <b>${safeMinutes} minutes</b>. If you didn't request this, you can ignore this email.</p>`,
  });

  return true;
};

const assertOtpVerification = async ({ email, verificationToken, purpose }) => {
  if (!isOtpRequired()) {
    return null;
  }

  if (!verificationToken) {
    const error = new Error("Email verification required");
    error.status = httpStatus.UNAUTHORIZED;
    throw error;
  }

  const tokenHash = hashValue(verificationToken);
  const now = new Date();
  const { rows } = await supabase.select("auth_otps", {
    select:
      "id,email,purpose,verified_at,verification_token_hash,verification_expires_at,consumed_at,created_at",
    filters: [
      { column: "email", operator: "eq", value: email },
      { column: "purpose", operator: "eq", value: purpose },
      { column: "verification_token_hash", operator: "eq", value: tokenHash },
      { column: "verification_expires_at", operator: "gt", value: now.toISOString() },
      { column: "consumed_at", operator: "is", value: null },
    ],
    orderBy: "created_at.desc",
    limit: 1,
  });

  const record = rows[0] || null;
  if (!record || !record.verified_at) {
    const error = new Error("Verification expired. Please request a new OTP code.");
    error.status = httpStatus.UNAUTHORIZED;
    throw error;
  }

  return record.id;
};

const consumeOtpVerification = async (otpId) => {
  if (!otpId) return;
  const now = new Date();
  await supabase.update(
    "auth_otps",
    { consumed_at: now.toISOString() },
    { filters: [{ column: "id", operator: "eq", value: otpId }], returning: false }
  );
};

const selectAuthUserColumns =
  "id,name,username,email,password_hash,role,is_active,token,token_hash,token_expires_at,last_login_at,created_at";

const fetchAuthUserRow = async ({ username, email }) => {
  if (email) {
    const { rows } = await supabase.select("users", {
      select: selectAuthUserColumns,
      filters: [{ column: "email", operator: "eq", value: email }],
      limit: 1,
    });
    if (rows[0]) {
      return rows[0];
    }
  }

  if (username) {
    const { rows } = await supabase.select("users", {
      select: selectAuthUserColumns,
      filters: [{ column: "username", operator: "eq", value: username }],
      limit: 1,
    });
    if (rows[0]) {
      return rows[0];
    }
  }

  return null;
};

const authenticateUser = async ({ username, email, password }) => {
  const row = await fetchAuthUserRow({ username, email });
  if (!row) {
    return { error: { status: httpStatus.NOT_FOUND, message: "User not found" } };
  }
  if (row.is_active === false) {
    return { error: { status: httpStatus.FORBIDDEN, message: "Account is disabled" } };
  }

  const passwordHash = row.password_hash ? String(row.password_hash) : "";
  if (!passwordHash) {
    console.error(`Auth failed: missing password hash for user ${row.id}`);
    return { error: { status: httpStatus.UNAUTHORIZED, message: "Invalid password" } };
  }

  let isPasswordCorrect = false;
  try {
    isPasswordCorrect = await bcrypt.compare(password, passwordHash);
  } catch (error) {
    console.error(`Auth failed: invalid password hash for user ${row.id}: ${error.message}`);
    return { error: { status: httpStatus.UNAUTHORIZED, message: "Invalid password" } };
  }
  if (!isPasswordCorrect) {
    return { error: { status: httpStatus.UNAUTHORIZED, message: "Invalid password" } };
  }

  const user = {
    _id: row.id,
    id: row.id,
    name: row.name,
    username: row.username,
    email: row.email,
    password: passwordHash,
    role: row.role,
    isActive: row.is_active,
    token: row.token,
    tokenHash: row.token_hash,
    tokenExpiresAt: row.token_expires_at,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
  };

  return { user };
};

const issueSession = async (user) => {
  const token = crypto.randomBytes(32).toString("hex");
  const now = new Date();

  const tokenHash = hashValue(token);
  const tokenExpiresAt = new Date(now.getTime() + getSessionTtlDays() * 24 * 60 * 60 * 1000);

  await supabase.update(
    "users",
    {
      token: null,
      token_hash: tokenHash,
      token_expires_at: tokenExpiresAt.toISOString(),
      last_login_at: now.toISOString(),
    },
    { filters: [{ column: "id", operator: "eq", value: user._id || user.id }], returning: false }
  );

  user.token = null;
  user.tokenHash = tokenHash;
  user.tokenExpiresAt = tokenExpiresAt;
  user.lastLoginAt = now;
  return token;
};

const authPreflight = async (req, res) => {
  const email = normalizeEmail(req.body.email);

  if (!email) {
    return res.status(httpStatus.BAD_REQUEST).json({ message: "Email is required" });
  }

  try {
    const { rows } = await supabase.select("users", {
      select: "id,email,username,is_active",
      filters: [{ column: "email", operator: "eq", value: email }],
      limit: 1,
    });
    const user = rows[0] || null;

    return res.status(httpStatus.OK).json({
      email,
      exists: Boolean(user),
      usernameHint: user?.username || null,
      isActive: user ? user.is_active !== false : false,
    });
  } catch (e) {
    if (e?.status) {
      return res.status(e.status).json({ message: e.message });
    }
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json({ message: `Something went wrong: ${e.message}` });
  }
};

const requestAuthOtp = async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const purpose = normalizePurpose(req.body.purpose);

  if (!email) {
    return res.status(httpStatus.BAD_REQUEST).json({ message: "Email is required" });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(httpStatus.BAD_REQUEST).json({ message: "Invalid email format" });
  }

  try {
    const now = new Date();
    const otpCode = createNumericOtp();
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000);

    await supabase.update(
      "auth_otps",
      { consumed_at: now.toISOString() },
      {
        filters: [
          { column: "email", operator: "eq", value: email },
          { column: "purpose", operator: "eq", value: purpose },
          { column: "consumed_at", operator: "is", value: null },
          { column: "expires_at", operator: "gt", value: now.toISOString() },
        ],
        returning: false,
      }
    );

    const codeHash = hashValue(otpCode);
    await supabase.insert(
      "auth_otps",
      {
        id: supabase.createId(),
        email,
        purpose,
        code_hash: codeHash,
        expires_at: expiresAt.toISOString(),
        max_attempts: 5,
      },
      { returning: false }
    );

    let delivered = false;
    let deliveryError = null;
    try {
      delivered = await sendOtpEmail({ email, otpCode, purpose });
    } catch (err) {
      deliveryError = err;
      delivered = false;
    }

    const allowPreview =
      !delivered && process.env.NODE_ENV !== "production" && isOtpPreviewEnabled();

    if (!delivered && isOtpRequired() && !allowPreview) {
      console.error(
        `OTP email delivery failed for ${email}: ${deliveryError?.message || "SMTP not configured"}`
      );
      return res.status(httpStatus.SERVICE_UNAVAILABLE).json({
        message: "OTP email delivery failed. Please try again later.",
      });
    }

    const response = {
      message: delivered ? "Verification code sent to your email" : "Verification code generated",
      delivery: delivered ? "email" : "preview",
      expiresInSeconds: 600,
    };

    if (!delivered && allowPreview) {
      response.devOtp = otpCode;
    }

    return res.status(httpStatus.OK).json(response);
  } catch (e) {
    if (e?.status) {
      return res.status(e.status).json({ message: e.message });
    }
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json({ message: `Something went wrong: ${e.message}` });
  }
};

const verifyAuthOtp = async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const purpose = normalizePurpose(req.body.purpose);
  const otpCode = String(req.body.otp || "").trim();

  if (!email || !otpCode) {
    return res.status(httpStatus.BAD_REQUEST).json({ message: "Email and OTP are required" });
  }

  try {
    const now = new Date();
    const { rows } = await supabase.select("auth_otps", {
      select:
        "id,email,purpose,code_hash,attempts,max_attempts,verified_at,verification_token_hash,verification_expires_at,consumed_at,expires_at,created_at",
      filters: [
        { column: "email", operator: "eq", value: email },
        { column: "purpose", operator: "eq", value: purpose },
        { column: "consumed_at", operator: "is", value: null },
        { column: "expires_at", operator: "gt", value: now.toISOString() },
      ],
      orderBy: "created_at.desc",
      limit: 1,
    });

    const record = rows[0] || null;

    if (!record) {
      return res.status(httpStatus.UNAUTHORIZED).json({ message: "OTP expired or not found" });
    }

    if (record.attempts >= record.max_attempts) {
      return res.status(httpStatus.TOO_MANY_REQUESTS).json({ message: "Too many invalid OTP attempts" });
    }

    const otpHash = hashValue(otpCode);
    const isValidCode = otpHash === record.code_hash;
    if (!isValidCode) {
      await supabase.update(
        "auth_otps",
        { attempts: Number(record.attempts || 0) + 1 },
        { filters: [{ column: "id", operator: "eq", value: record.id }], returning: false }
      );
      return res.status(httpStatus.UNAUTHORIZED).json({ message: "Invalid OTP code" });
    }

    const verificationToken = crypto.randomBytes(24).toString("hex");
    await supabase.update(
      "auth_otps",
      {
        verified_at: now.toISOString(),
        verification_token_hash: hashValue(verificationToken),
        verification_expires_at: new Date(now.getTime() + 15 * 60 * 1000).toISOString(),
      },
      { filters: [{ column: "id", operator: "eq", value: record.id }], returning: false }
    );

    return res.status(httpStatus.OK).json({
      message: "OTP verified successfully",
      verificationToken,
      verificationExpiresInSeconds: 900,
    });
  } catch (e) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json({ message: `Something went wrong: ${e.message}` });
  }
};

const getRequestIp = (req) => {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    return String(forwarded).split(",")[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || "";
};

const createPasswordResetLink = ({ token, email }) => {
  const origin = getPrimaryFrontendOrigin();
  const url = new URL("/reset-password", origin);
  url.searchParams.set("token", token);
  url.searchParams.set("email", email);
  return url.toString();
};

const requestPasswordReset = async (req, res) => {
  const email = normalizeEmail(req.body.email);

  if (!email) {
    return res.status(httpStatus.BAD_REQUEST).json({ message: "Email is required" });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(httpStatus.BAD_REQUEST).json({ message: "Invalid email format" });
  }

  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = normalizeSmtpPass(process.env.SMTP_PASS);
  if (!smtpHost || !smtpUser || !smtpPass) {
    return res.status(httpStatus.SERVICE_UNAVAILABLE).json({
      message: "Email service is not configured. Please try again later.",
    });
  }

  const genericResponse = {
    message: "If an account exists, a password reset link has been sent to your email.",
  };

  try {
    const { rows } = await supabase.select("users", {
      select: "id,email,is_active",
      filters: [{ column: "email", operator: "eq", value: email }],
      limit: 1,
    });

    const user = rows[0] || null;
    if (!user) {
      return res.status(httpStatus.OK).json(genericResponse);
    }

    const now = new Date();
    const ttlMinutes = getPasswordResetTtlMinutes();
    const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000);

    await supabase.update(
      "password_reset_tokens",
      { consumed_at: now.toISOString() },
      {
        filters: [
          { column: "user_id", operator: "eq", value: user.id },
          { column: "consumed_at", operator: "is", value: null },
          { column: "expires_at", operator: "gt", value: now.toISOString() },
        ],
        returning: false,
      }
    );

    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashValue(token);
    const ipAddress = getRequestIp(req);

    await supabase.insert(
      "password_reset_tokens",
      {
        id: supabase.createId(),
        user_id: user.id,
        email,
        token_hash: tokenHash,
        expires_at: expiresAt.toISOString(),
        consumed_at: null,
        ip_address: ipAddress,
      },
      { returning: false }
    );

    const resetLink = createPasswordResetLink({ token, email });
    try {
      const delivered = await sendPasswordResetEmail({ email, resetLink, expiresInMinutes: ttlMinutes });
      if (!delivered) {
        console.error(`Password reset email delivery failed for ${email}: SMTP not configured`);
      }
    } catch (error) {
      console.error(`Password reset email delivery failed for ${email}: ${error?.message || error}`);
    }

    return res.status(httpStatus.OK).json(genericResponse);
  } catch (e) {
    if (e?.status) {
      return res.status(e.status).json({ message: e.message });
    }
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json({ message: `Something went wrong: ${e.message}` });
  }
};

const resetPassword = async (req, res) => {
  const token = String(req.body.token || "").trim();
  const email = normalizeEmail(req.body.email);
  const newPassword = req.body.password ? String(req.body.password) : "";

  if (!token) {
    return res.status(httpStatus.BAD_REQUEST).json({ message: "Reset token is required" });
  }

  const minPasswordLength = getMinPasswordLength();
  if (newPassword.length < minPasswordLength) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json({ message: `Password must be at least ${minPasswordLength} characters long` });
  }

  if (newPassword.length > 72) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json({ message: "Password must be at most 72 characters long" });
  }

  try {
    const tokenHash = hashValue(token);
    const now = new Date();
    const { rows } = await supabase.select("password_reset_tokens", {
      select: "id,user_id,email,expires_at,consumed_at,created_at",
      filters: [
        { column: "token_hash", operator: "eq", value: tokenHash },
        { column: "consumed_at", operator: "is", value: null },
        { column: "expires_at", operator: "gt", value: now.toISOString() },
      ],
      orderBy: "created_at.desc",
      limit: 1,
    });

    const record = rows[0] || null;
    if (!record) {
      return res
        .status(httpStatus.UNAUTHORIZED)
        .json({ message: "Reset link is invalid or expired" });
    }

    if (email && normalizeEmail(record.email) !== email) {
      return res
        .status(httpStatus.UNAUTHORIZED)
        .json({ message: "Reset link is invalid or expired" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);

    await supabase.update(
      "users",
      {
        password_hash: hashedPassword,
        token: null,
        token_hash: null,
        token_expires_at: null,
      },
      { filters: [{ column: "id", operator: "eq", value: record.user_id }], returning: false }
    );

    await supabase.update(
      "password_reset_tokens",
      { consumed_at: now.toISOString() },
      { filters: [{ column: "id", operator: "eq", value: record.id }], returning: false }
    );

    return res.status(httpStatus.OK).json({ message: "Password updated successfully" });
  } catch (e) {
    if (e?.status) {
      return res.status(e.status).json({ message: e.message });
    }
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json({ message: `Something went wrong: ${e.message}` });
  }
};

const selectMeUserColumns =
  "id,name,username,email,role,is_active,last_login_at,created_at,updated_at";
const selectUserProfileColumns =
  "user_id,display_name,organization,work_role,phone,bio,location,created_at,updated_at";

const ensureUserProfile = async (userId) => {
  const { rows } = await supabase.select("user_profiles", {
    select: selectUserProfileColumns,
    filters: [{ column: "user_id", operator: "eq", value: userId }],
    limit: 1,
  });

  if (rows[0]) {
    return rows[0];
  }

  const inserted = await supabase.upsert(
    "user_profiles",
    {
      user_id: userId,
      display_name: "",
      organization: "",
      work_role: "",
      phone: "",
      bio: "",
      location: "",
    },
    { onConflict: "user_id" }
  );

  return (
    inserted[0] || {
      user_id: userId,
      display_name: "",
      organization: "",
      work_role: "",
      phone: "",
      bio: "",
      location: "",
    }
  );
};

const getMe = async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  if (!userId) {
    return res.status(httpStatus.UNAUTHORIZED).json({ message: "Authentication required" });
  }

  try {
    const { rows } = await supabase.select("users", {
      select: selectMeUserColumns,
      filters: [{ column: "id", operator: "eq", value: userId }],
      limit: 1,
    });

    const user = rows[0] || null;
    if (!user) {
      return res.status(httpStatus.NOT_FOUND).json({ message: "User not found" });
    }

    let profile = null;
    try {
      profile = await ensureUserProfile(userId);
    } catch (error) {
      profile = null;
      console.error(`Unable to load user profile for ${userId}: ${error?.message || error}`);
    }

    return res.status(httpStatus.OK).json({
      user: {
        _id: user.id,
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
        isActive: user.is_active,
        lastLoginAt: user.last_login_at,
        createdAt: user.created_at,
      },
      profile: profile
        ? {
            displayName: profile.display_name || "",
            organization: profile.organization || "",
            workRole: profile.work_role || "",
            phone: profile.phone || "",
            bio: profile.bio || "",
            location: profile.location || "",
            updatedAt: profile.updated_at,
          }
        : null,
    });
  } catch (e) {
    if (e?.status) {
      return res.status(e.status).json({ message: e.message });
    }
    return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: `Something went wrong: ${e.message}` });
  }
};

const parseOptionalTextField = (value, { field, min = 0, max = 120 } = {}) => {
  if (value === undefined) {
    return undefined;
  }

  const text = String(value || "").trim();
  if (text.length < min) {
    const error = new Error(`${field} must be at least ${min} characters`);
    error.status = httpStatus.BAD_REQUEST;
    throw error;
  }
  if (text.length > max) {
    const error = new Error(`${field} must be at most ${max} characters`);
    error.status = httpStatus.BAD_REQUEST;
    throw error;
  }

  return text;
};

const updateMe = async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  if (!userId) {
    return res.status(httpStatus.UNAUTHORIZED).json({ message: "Authentication required" });
  }

  try {
    const name = parseOptionalTextField(req.body?.name, { field: "Name", min: 2, max: 80 });
    const displayName = parseOptionalTextField(req.body?.displayName, { field: "Display name", min: 0, max: 60 });
    const organization = parseOptionalTextField(req.body?.organization, { field: "Organization", min: 0, max: 80 });
    const workRole = parseOptionalTextField(req.body?.workRole, { field: "Role", min: 0, max: 80 });
    const phone = parseOptionalTextField(req.body?.phone, { field: "Phone", min: 0, max: 30 });
    const bio = parseOptionalTextField(req.body?.bio, { field: "Bio", min: 0, max: 280 });
    const location = parseOptionalTextField(req.body?.location, { field: "Location", min: 0, max: 80 });

    const userUpdates = {};
    if (name !== undefined) {
      userUpdates.name = name;
    }

    if (Object.keys(userUpdates).length > 0) {
      await supabase.update("users", userUpdates, {
        filters: [{ column: "id", operator: "eq", value: userId }],
        returning: false,
      });
    }

    const profileUpdates = {
      user_id: userId,
    };
    if (displayName !== undefined) profileUpdates.display_name = displayName;
    if (organization !== undefined) profileUpdates.organization = organization;
    if (workRole !== undefined) profileUpdates.work_role = workRole;
    if (phone !== undefined) profileUpdates.phone = phone;
    if (bio !== undefined) profileUpdates.bio = bio;
    if (location !== undefined) profileUpdates.location = location;

    const hasProfileChanges = Object.keys(profileUpdates).length > 1;
    if (hasProfileChanges) {
      await supabase.upsert("user_profiles", profileUpdates, { onConflict: "user_id", returning: false });
    }

    return getMe(req, res);
  } catch (e) {
    if (e?.status) {
      return res.status(e.status).json({ message: e.message });
    }
    if (e instanceof SupabaseRestError) {
      return res.status(e.status || httpStatus.INTERNAL_SERVER_ERROR).json({ message: e.message });
    }
    return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: `Something went wrong: ${e.message}` });
  }
};

const login = async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const username = normalizeUsername(req.body.username);
  const password = req.body.password ? String(req.body.password) : "";

  if ((!username && !email) || !password) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json({ message: "Please provide username or email, and password" });
  }

  try {
    const { user, error } = await authenticateUser({ username, email, password });
    if (error) {
      return res.status(error.status).json({ message: error.message });
    }

    const token = await issueSession(user);

    return res.status(httpStatus.OK).json({
      token,
      expiresAt: user.tokenExpiresAt,
      expiresInDays: getSessionTtlDays(),
      message: "Login successful",
      user: {
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role || "user",
      },
    });
  } catch (e) {
    if (e?.status) {
      return res.status(e.status).json({ message: e.message });
    }
    return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: `Something went wrong: ${e.message}` });
  }
};

const register = async (req, res) => {
  const name = req.body.name ? String(req.body.name).trim() : "";
  const username = normalizeUsername(req.body.username);
  const email = normalizeEmail(req.body.email);
  const password = req.body.password ? String(req.body.password) : "";
  const accountType = String(req.body.accountType || "user").trim().toLowerCase();
  const verificationToken = String(req.body.verificationToken || "").trim();

  if (!name || !username || !email || !password) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json({ message: "Please provide name, username, email, and password" });
  }

  const minPasswordLength = getMinPasswordLength();
  if (password.length < minPasswordLength) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json({ message: `Password must be at least ${minPasswordLength} characters long` });
  }

  if (password.length > 72) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json({ message: "Password must be at most 72 characters long" });
  }

  try {
    const otpId = await assertOtpVerification({ email, verificationToken, purpose: "auth" });
    if (accountType && !["user", "host"].includes(accountType)) {
      return res.status(httpStatus.BAD_REQUEST).json({ message: "accountType must be user or host" });
    }

    const { rows: existingRows } = await supabase.select("users", {
      select: "id,email,username",
      or: [
        { column: "email", operator: "eq", value: email },
        { column: "username", operator: "eq", value: username },
      ],
      limit: 1,
    });

    if (existingRows.length > 0) {
      return res
        .status(httpStatus.CONFLICT)
        .json({ message: "User already exists with this email or username" });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    await supabase.insert(
      "users",
      {
        id: supabase.createId(),
        name,
        username,
        email,
        password_hash: hashedPassword,
        role: accountType === "host" ? "host" : "user",
        is_active: true,
      },
      { returning: false }
    );

    await consumeOtpVerification(otpId).catch(() => undefined);

    return res
      .status(httpStatus.CREATED)
      .json({ message: "User registered successfully" });
  } catch (e) {
    if (e?.status) {
      return res.status(e.status).json({ message: e.message });
    }
    if (isUniqueViolation(e)) {
      return res
        .status(httpStatus.CONFLICT)
        .json({ message: "User already exists with this email or username" });
    }

    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json({ message: `Something went wrong: ${e.message}` });
  }
};

const adminLogin = async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const username = normalizeUsername(req.body.username);
  const password = req.body.password ? String(req.body.password) : "";

  if ((!username && !email) || !password) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json({ message: "Please provide username or email, and password" });
  }

  try {
    const { user, error } = await authenticateUser({ username, email, password });
    if (error) {
      return res.status(error.status).json({ message: error.message });
    }

    if (user.role !== "admin") {
      return res.status(httpStatus.FORBIDDEN).json({ message: "Admin access required" });
    }

    const token = await issueSession(user);

    return res.status(httpStatus.OK).json({
      token,
      expiresAt: user.tokenExpiresAt,
      expiresInDays: getSessionTtlDays(),
      message: "Admin login successful",
      user: {
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
      },
    });
  } catch (e) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json({ message: `Something went wrong: ${e.message}` });
  }
};

const bootstrapAdmin = async (req, res) => {
  const setupKey = normalizeSetupKey(req.body.setupKey || req.headers["x-admin-setup-key"]);
  const expectedKey = normalizeSetupKey(process.env.ADMIN_SETUP_KEY);

  if (!expectedKey) {
    return res
      .status(httpStatus.FORBIDDEN)
      .json({ message: "ADMIN_SETUP_KEY is not configured on server" });
  }

  if (!setupKey || setupKey !== expectedKey) {
    return res.status(httpStatus.UNAUTHORIZED).json({ message: "Invalid setup key" });
  }

  const name = req.body.name ? String(req.body.name).trim() : "";
  const username = normalizeUsername(req.body.username);
  const email = normalizeEmail(req.body.email);
  const password = req.body.password ? String(req.body.password) : "";

  if (!name || !username || !email || !password) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json({ message: "Please provide name, username, email, and password" });
  }

  const minPasswordLength = getMinPasswordLength();
  if (password.length < minPasswordLength) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json({ message: `Password must be at least ${minPasswordLength} characters long` });
  }

  if (password.length > 72) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json({ message: "Password must be at most 72 characters long" });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 12);

    const { rows } = await supabase.select("users", {
      select: "id,email,username",
      or: [
        { column: "email", operator: "eq", value: email },
        { column: "username", operator: "eq", value: username },
      ],
      limit: 1,
    });

    const existing = rows[0] || null;
    if (existing) {
      await supabase.update(
        "users",
        {
          name,
          username,
          email,
          password_hash: hashedPassword,
          role: "admin",
          is_active: true,
        },
        { filters: [{ column: "id", operator: "eq", value: existing.id }], returning: false }
      );
      return res.status(httpStatus.OK).json({ message: "Admin updated successfully" });
    }

    await supabase.insert(
      "users",
      {
        id: supabase.createId(),
        name,
        username,
        email,
        password_hash: hashedPassword,
        role: "admin",
        is_active: true,
      },
      { returning: false }
    );
    return res.status(httpStatus.CREATED).json({ message: "Admin created successfully" });
  } catch (e) {
    if (isUniqueViolation(e)) {
      return res
        .status(httpStatus.CONFLICT)
        .json({ message: "User already exists with this email or username" });
    }

    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json({ message: `Something went wrong: ${e.message}` });
  }
};

const getUserHistory = async (req, res) => {
  try {
    const { rows } = await supabase.select("meetings", {
      select: "id,user_email,meeting_code,date,created_at",
      filters: [{ column: "user_email", operator: "eq", value: req.user.email }],
      orderBy: "date.desc",
      limit: 100,
    });

    const meetings = rows.map((row) => ({
      _id: row.id,
      user_id: row.user_email,
      meetingCode: row.meeting_code,
      date: row.date,
      createdAt: row.created_at,
    }));

    return res.status(httpStatus.OK).json(meetings);
  } catch (e) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json({ message: `Something went wrong: ${e.message}` });
  }
};

const addToHistory = async (req, res) => {
  const meeting_code = req.body.meeting_code ? String(req.body.meeting_code).trim() : "";

  if (!meeting_code) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json({ message: "Meeting code is required" });
  }

  try {
    await supabase.insert(
      "meetings",
      {
        id: supabase.createId(),
        user_email: req.user.email,
        meeting_code: meeting_code,
        date: new Date().toISOString(),
      },
      { returning: false }
    );

    return res
      .status(httpStatus.CREATED)
      .json({ message: "Added code to history successfully" });
  } catch (e) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json({ message: `Something went wrong: ${e.message}` });
  }
};

const logout = async (req, res) => {
  try {
    await supabase.update(
      "users",
      { token: null, token_hash: null, token_expires_at: null },
      { filters: [{ column: "id", operator: "eq", value: req.user._id || req.user.id }], returning: false }
    );

    return res.status(httpStatus.OK).json({ message: "Logout successful" });
  } catch (e) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json({ message: `Something went wrong: ${e.message}` });
  }
};

export {
  authPreflight,
  requestAuthOtp,
  verifyAuthOtp,
  requestPasswordReset,
  resetPassword,
  getMe,
  updateMe,
  login,
  register,
  adminLogin,
  bootstrapAdmin,
  getUserHistory,
  addToHistory,
  logout,
};
