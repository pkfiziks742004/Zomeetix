import express from "express";
import { createServer } from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { connectToSocket } from "./controllers/socketManager.js";
import supabase from "./db/supabase.js";

import cors from "cors";
import userRoutes from "./routes/users.routes.js";
import meetingRoutes from "./routes/meetings.routes.js";
import adminRoutes from "./routes/admin.routes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, "../.env");

if (fs.existsSync(envPath)) {
    const envRaw = fs.readFileSync(envPath, "utf8");
    envRaw.split(/\r?\n/).forEach((line) => {
        const cleaned = line.trim();
        if (!cleaned || cleaned.startsWith("#")) {
            return;
        }
        const eqIndex = cleaned.indexOf("=");
        if (eqIndex === -1) {
            return;
        }
        const key = cleaned.slice(0, eqIndex).trim();
        const value = cleaned.slice(eqIndex + 1).trim();
        if (key && process.env[key] === undefined) {
            process.env[key] = value;
        }
    });
}

const app = express();
const server = createServer(app);
connectToSocket(server);

const defaultOrigins = ["http://localhost:3000", "http://localhost:3001"];
const envOrigins = String(process.env.FRONTEND_ORIGIN || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
const allowedOrigins = [...new Set([...defaultOrigins, ...envOrigins])];

const createRateLimiter = ({ windowMs, limit }) => {
    const requests = new Map();
    return (req, res, next) => {
        const key = req.ip || req.socket.remoteAddress || "unknown";
        const now = Date.now();
        const current = requests.get(key);

        if (!current || now > current.resetAt) {
            requests.set(key, { count: 1, resetAt: now + windowMs });
            return next();
        }

        if (current.count >= limit) {
            return res.status(429).json({ message: "Too many requests. Please try again shortly." });
        }

        current.count += 1;
        requests.set(key, current);
        return next();
    };
};

app.set("port", (process.env.PORT || 8000))
app.disable("x-powered-by");
app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error("CORS not allowed"));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true
}));
app.use(express.json({ limit: "40kb" }));
app.use(express.urlencoded({ limit: "40kb", extended: true }));
app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader(
        "Permissions-Policy",
        "camera=(self), microphone=(self), display-capture=(self), geolocation=()"
    );
    if (process.env.NODE_ENV === "production") {
        res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    next();
});

const authRateLimit = createRateLimiter({ windowMs: 60 * 1000, limit: 80 });
const meetingRateLimit = createRateLimiter({ windowMs: 60 * 1000, limit: 120 });
const adminRateLimit = createRateLimiter({ windowMs: 60 * 1000, limit: 60 });

app.get("/api/v1/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
});

app.use("/api/v1/users", authRateLimit, userRoutes);
app.use("/api/v1/meetings", meetingRateLimit, meetingRoutes);
app.use("/api/v1/admin", adminRateLimit, adminRoutes);

const runReminderSweep = async () => {
    const now = new Date();
    try {
        await supabase.update(
            "meeting_rooms",
            { is_active: false },
            {
                filters: [
                    { column: "is_active", operator: "eq", value: true },
                    { column: "scheduled_end_at", operator: "lt", value: now.toISOString() },
                ],
                returning: false,
            }
        );

        const { rows: dueMeetings } = await supabase.select("meeting_rooms", {
            select: "id,meeting_id,scheduled_start_at,host_email",
            filters: [
                { column: "is_active", operator: "eq", value: true },
                { column: "reminder_sent_at", operator: "is", value: null },
                { column: "reminder_at", operator: "lte", value: now.toISOString() },
                { column: "scheduled_start_at", operator: "gt", value: now.toISOString() },
            ],
            orderBy: "reminder_at.asc",
            limit: 100,
        });

        for (const meeting of dueMeetings) {
            await supabase.update(
                "meeting_rooms",
                { reminder_sent_at: now.toISOString() },
                { filters: [{ column: "id", operator: "eq", value: meeting.id }], returning: false }
            );
            console.log(
                `REMINDER: Meeting ${meeting.meeting_id} starts at ${new Date(meeting.scheduled_start_at).toISOString()} for ${meeting.host_email}`
            );
        }
    } catch (error) {
        console.error(`Reminder sweep failed: ${error.message}`);
    }
};

const start = async () => {
    try {
        const port = app.get("port");

        await supabase.select("admin_policies", { select: "singleton_key", limit: 1 });
        console.log("SUPABASE connection ok");
        await new Promise((resolve, reject) => {
            server.once("error", reject);
            server.listen(port, () => {
                server.off("error", reject);
                resolve();
            });
        });

        console.log(`LISTENING ON PORT ${port}`)
        await runReminderSweep();
        setInterval(runReminderSweep, 60 * 1000);
    } catch (error) {
        console.error(`Failed to start server: ${error.message}`);
        process.exit(1);
    }
}



start();
