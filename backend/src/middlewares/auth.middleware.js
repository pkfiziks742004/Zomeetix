import httpStatus from "http-status";
import crypto from "crypto";
import supabase from "../db/supabase.js";

const hashToken = (token) => crypto.createHash("sha256").update(String(token)).digest("hex");
const getSessionTtlDays = () => {
    const raw = Number(process.env.AUTH_TOKEN_TTL_DAYS || 7);
    if (!Number.isFinite(raw)) return 7;
    return Math.min(90, Math.max(1, Math.floor(raw)));
};

const getTokenFromRequest = (req) => {
    const authHeader = req.headers.authorization || "";
    const tokenFromHeader = authHeader.startsWith("Bearer ")
        ? authHeader.slice(7).trim()
        : null;

    if (tokenFromHeader) {
        return tokenFromHeader;
    }

    if (process.env.NODE_ENV === "production") {
        return null;
    }

    return req.query?.token || req.body?.token || null;
};

const attachUserFromToken = async ({ req, res, requireRole }) => {
    const token = getTokenFromRequest(req);

    if (!token) {
        return res
            .status(httpStatus.UNAUTHORIZED)
            .json({ message: "Authentication token is required" });
    }

    const tokenHash = hashToken(token);
    const { rows } = await supabase.select("users", {
        select:
            "id,name,username,email,role,is_active,token,token_hash,token_expires_at,last_login_at",
        or: [
            { column: "token_hash", operator: "eq", value: tokenHash },
            { column: "token", operator: "eq", value: token },
        ],
        limit: 1,
    });

    const user = rows[0] || null;
    if (!user) {
        return res
            .status(httpStatus.UNAUTHORIZED)
            .json({ message: "Invalid authentication token" });
    }

    if (user.is_active === false) {
        return res
            .status(httpStatus.FORBIDDEN)
            .json({ message: "Account is disabled" });
    }

    if (requireRole && user.role !== requireRole) {
        return res
            .status(httpStatus.FORBIDDEN)
            .json({ message: "Admin access required" });
    }

    const ttlMs = getSessionTtlDays() * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const expiresAt =
        user.token_expires_at ||
        (user.last_login_at
            ? new Date(new Date(user.last_login_at).getTime() + ttlMs)
            : new Date(now + ttlMs));

    if (expiresAt && now > new Date(expiresAt).getTime()) {
        await supabase
            .update(
                "users",
                {
                    token: null,
                    token_hash: null,
                    token_expires_at: null,
                },
                { filters: [{ column: "id", operator: "eq", value: user.id }], returning: false }
            )
            .catch(() => undefined);
        return res
            .status(httpStatus.UNAUTHORIZED)
            .json({ message: "Session expired. Please login again." });
    }

    const shouldMigrateLegacyToken = !user.token_hash && user.token && user.token === token;
    const shouldSetMissingExpiry = user.token_hash && !user.token_expires_at;
    if (shouldMigrateLegacyToken || shouldSetMissingExpiry) {
        await supabase
            .update(
                "users",
                {
                    token: null,
                    token_hash: tokenHash,
                    token_expires_at: expiresAt,
                },
                { filters: [{ column: "id", operator: "eq", value: user.id }], returning: false }
            )
            .catch(() => undefined);
    }

    req.user = {
        _id: user.id,
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
        isActive: user.is_active,
        token: user.token,
        tokenHash: user.token_hash,
        tokenExpiresAt: user.token_expires_at,
        lastLoginAt: user.last_login_at,
    };
    req.authToken = token;
    return null;
};

export const requireAuth = async (req, res, next) => {
    try {
        const errorResponse = await attachUserFromToken({ req, res });
        if (errorResponse) {
            return;
        }
        return next();
    } catch (error) {
        return res
            .status(httpStatus.INTERNAL_SERVER_ERROR)
            .json({ message: `Authentication failed: ${error.message}` });
    }
};

export const requireAdmin = async (req, res, next) => {
    try {
        const errorResponse = await attachUserFromToken({ req, res, requireRole: "admin" });
        if (errorResponse) {
            return;
        }
        return next();
    } catch (error) {
        return res
            .status(httpStatus.INTERNAL_SERVER_ERROR)
            .json({ message: `Authentication failed: ${error.message}` });
    }
};

export const requireHost = async (req, res, next) => {
    try {
        const errorResponse = await attachUserFromToken({ req, res });
        if (errorResponse) {
            return;
        }

        if (req.user?.role !== "host") {
            return res.status(httpStatus.FORBIDDEN).json({ message: "Host access required" });
        }

        return next();
    } catch (error) {
        return res
            .status(httpStatus.INTERNAL_SERVER_ERROR)
            .json({ message: `Authentication failed: ${error.message}` });
    }
};
