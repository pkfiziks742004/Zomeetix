import httpStatus from "http-status";
import bcrypt from "bcrypt";
import crypto from "crypto";
import supabase from "../db/supabase.js";
import { ensureAdminPolicy } from "../db/adminPolicy.js";

const getPrimaryFrontendOrigin = () => {
  const raw = String(process.env.FRONTEND_ORIGIN || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return raw[0] || "http://localhost:3000";
};

const createMeetingId = () => {
  const part = () => crypto.randomBytes(2).toString("hex");
  return `${part()}-${part()}-${part()}`;
};

const createMeetingPassword = () => {
  const raw = crypto.randomBytes(12).toString("base64").replace(/[^a-zA-Z0-9]/g, "");
  const suffix = "!A1";
  return `${raw.slice(0, 9)}${suffix}`;
};
const DEFAULT_DURATION_MINUTES = 60;

const getEffectivePolicy = async () => {
  const policy = await ensureAdminPolicy();
  return {
    allowGuestJoin: policy?.allow_guest_join !== false,
    maxMeetingDurationMinutes: Number(policy?.max_meeting_duration_minutes || 120),
  };
};

const mapMeetingRoomRow = (row) => {
  if (!row) return null;
  return {
    _id: row.id,
    meetingId: row.meeting_id,
    passwordHash: row.password_hash,
    hostUserId: row.host_user_id,
    hostEmail: row.host_email,
    createdByName: row.created_by_name,
    scheduledStartAt: row.scheduled_start_at,
    durationMinutes: row.duration_minutes,
    scheduledEndAt: row.scheduled_end_at,
    reminderAt: row.reminder_at,
    reminderSentAt: row.reminder_sent_at,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

const parseSchedule = (startAtInput, durationInput, maxDurationMinutes = 720) => {
  const now = new Date();
  const durationMinutes = Number(durationInput || DEFAULT_DURATION_MINUTES);
  if (!Number.isFinite(durationMinutes) || durationMinutes < 1 || durationMinutes > maxDurationMinutes) {
    throw new Error(`Duration must be between 1 and ${maxDurationMinutes} minutes`);
  }

  let scheduledStartAt = now;
  if (startAtInput) {
    const parsed = new Date(startAtInput);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error("Invalid meeting start time");
    }
    scheduledStartAt = parsed;
  }

  const scheduledEndAt = new Date(scheduledStartAt.getTime() + durationMinutes * 60 * 1000);
  const reminderAt = new Date(scheduledStartAt.getTime() - 10 * 60 * 1000);
  return { scheduledStartAt, durationMinutes, scheduledEndAt, reminderAt };
};

const getMeetingWindowState = (room) => {
  const now = new Date();
  const start = new Date(room.scheduledStartAt);
  const end = new Date(room.scheduledEndAt);
  if (now < start) {
    return "not_started";
  }
  if (now > end) {
    return "expired";
  }
  return "active";
};

const createMeetingRoom = async (req, res) => {
  try {
    const policy = await getEffectivePolicy();
    const meetingId = createMeetingId();
    const plainPassword = createMeetingPassword();
    const passwordHash = await bcrypt.hash(plainPassword, 10);
    const { scheduledStartAt, durationMinutes, scheduledEndAt, reminderAt } = parseSchedule(
      req.body?.startAt,
      req.body?.durationMinutes,
      Math.min(720, Math.max(15, Number(policy.maxMeetingDurationMinutes || 120)))
    );

    const inserted = await supabase.insert("meeting_rooms", {
      id: supabase.createId(),
      meeting_id: meetingId,
      password_hash: passwordHash,
      host_user_id: req.user._id,
      host_email: req.user.email,
      created_by_name: req.user.name,
      scheduled_start_at: scheduledStartAt.toISOString(),
      duration_minutes: durationMinutes,
      scheduled_end_at: scheduledEndAt.toISOString(),
      reminder_at: reminderAt.toISOString(),
      reminder_sent_at: null,
      is_active: true,
    });

    const room = mapMeetingRoomRow(inserted[0]) || {
      meetingId,
      scheduledStartAt,
      durationMinutes,
      scheduledEndAt,
      reminderAt,
    };

    const frontendOrigin = getPrimaryFrontendOrigin();
    const joinLink = `${frontendOrigin}/meeting/${room.meetingId}`;

    return res.status(httpStatus.CREATED).json({
      meetingId: room.meetingId,
      password: plainPassword,
      joinLink,
      host: {
        name: req.user.name,
        email: req.user.email,
      },
      schedule: {
        startAt: room.scheduledStartAt,
        durationMinutes: room.durationMinutes,
        endAt: room.scheduledEndAt,
        reminderAt: room.reminderAt,
      },
      message: "Meeting created successfully",
    });
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json({ message: `Unable to create meeting: ${error.message}` });
  }
};

const validateMeetingJoin = async (req, res) => {
  const meetingId = req.params.meetingId?.trim();
  const password = req.body.password ? String(req.body.password).trim() : "";

  if (!meetingId || !password) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json({ message: "Meeting ID and password are required" });
  }

  try {
    const { rows } = await supabase.select("meeting_rooms", {
      select:
        "id,meeting_id,password_hash,host_user_id,host_email,created_by_name,scheduled_start_at,duration_minutes,scheduled_end_at,reminder_at,reminder_sent_at,is_active,created_at,updated_at",
      filters: [
        { column: "meeting_id", operator: "eq", value: meetingId },
        { column: "is_active", operator: "eq", value: true },
      ],
      limit: 1,
    });

    const room = mapMeetingRoomRow(rows[0]);
    if (!room) {
      return res.status(httpStatus.NOT_FOUND).json({ message: "Meeting not found" });
    }
    const policy = await getEffectivePolicy();

    const windowState = getMeetingWindowState(room);
    if (windowState === "not_started") {
      return res.status(httpStatus.FORBIDDEN).json({
        message: "Meeting has not started yet",
        status: "not_started",
        startAt: room.scheduledStartAt,
      });
    }
    if (windowState === "expired") {
      await supabase.update(
        "meeting_rooms",
        { is_active: false },
        { filters: [{ column: "id", operator: "eq", value: room._id }], returning: false }
      );
      return res.status(httpStatus.GONE).json({
        message: "Meeting session expired",
        status: "expired",
        endAt: room.scheduledEndAt,
      });
    }

    const passwordMatches = await bcrypt.compare(password, room.passwordHash);
    if (!passwordMatches) {
      return res.status(httpStatus.UNAUTHORIZED).json({ message: "Invalid meeting password" });
    }

    const isHost = String(room.hostUserId) === String(req.user._id);
    if (!policy.allowGuestJoin && !isHost) {
      return res
        .status(httpStatus.FORBIDDEN)
        .json({ message: "Guest join is disabled by admin policy" });
    }
    return res.status(httpStatus.OK).json({
      meetingId: room.meetingId,
      hostEmail: room.hostEmail,
      hostName: room.createdByName,
      role: isHost ? "host" : "guest",
      schedule: {
        startAt: room.scheduledStartAt,
        durationMinutes: room.durationMinutes,
        endAt: room.scheduledEndAt,
        reminderAt: room.reminderAt,
      },
      message: "Meeting access granted",
    });
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json({ message: `Unable to join meeting: ${error.message}` });
  }
};

const getMeetingMeta = async (req, res) => {
  const meetingId = req.params.meetingId?.trim();
  if (!meetingId) {
    return res.status(httpStatus.BAD_REQUEST).json({ message: "Meeting ID is required" });
  }

  try {
    const { rows } = await supabase.select("meeting_rooms", {
      select:
        "id,meeting_id,created_by_name,scheduled_start_at,duration_minutes,scheduled_end_at,reminder_at,is_active,created_at",
      filters: [
        { column: "meeting_id", operator: "eq", value: meetingId },
        { column: "is_active", operator: "eq", value: true },
      ],
      limit: 1,
    });
    const room = mapMeetingRoomRow(rows[0]);
    if (!room) {
      return res.status(httpStatus.NOT_FOUND).json({ message: "Meeting not found" });
    }

    return res.status(httpStatus.OK).json({
      meetingId: room.meetingId,
      hostName: room.createdByName,
      createdAt: room.createdAt,
      schedule: {
        startAt: room.scheduledStartAt,
        durationMinutes: room.durationMinutes,
        endAt: room.scheduledEndAt,
        reminderAt: room.reminderAt,
      },
    });
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json({ message: `Unable to fetch meeting metadata: ${error.message}` });
  }
};

const getHostScheduledMeetings = async (req, res) => {
  try {
    const { rows } = await supabase.select("meeting_rooms", {
      select:
        "id,meeting_id,created_by_name,scheduled_start_at,duration_minutes,scheduled_end_at,reminder_at,reminder_sent_at,is_active,created_at",
      filters: [
        { column: "host_user_id", operator: "eq", value: req.user._id },
        { column: "is_active", operator: "eq", value: true },
      ],
      orderBy: "scheduled_start_at.asc",
      limit: 100,
    });

    const meetings = rows.map(mapMeetingRoomRow).filter(Boolean);

    const data = meetings.map((meeting) => ({
      meetingId: meeting.meetingId,
      hostName: meeting.createdByName,
      joinLink: `${getPrimaryFrontendOrigin()}/meeting/${meeting.meetingId}`,
      schedule: {
        startAt: meeting.scheduledStartAt,
        endAt: meeting.scheduledEndAt,
        durationMinutes: meeting.durationMinutes,
        reminderAt: meeting.reminderAt,
      },
      reminderSentAt: meeting.reminderSentAt,
      status: getMeetingWindowState(meeting),
      createdAt: meeting.createdAt,
    }));

    return res.status(httpStatus.OK).json(data);
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json({ message: `Unable to fetch scheduled meetings: ${error.message}` });
  }
};

const rescheduleMeeting = async (req, res) => {
  const meetingId = req.params.meetingId?.trim();
  if (!meetingId) {
    return res.status(httpStatus.BAD_REQUEST).json({ message: "Meeting ID is required" });
  }

  try {
    const { rows } = await supabase.select("meeting_rooms", {
      select:
        "id,meeting_id,host_user_id,scheduled_start_at,duration_minutes,scheduled_end_at,reminder_at,reminder_sent_at,is_active,created_at,created_by_name",
      filters: [
        { column: "meeting_id", operator: "eq", value: meetingId },
        { column: "host_user_id", operator: "eq", value: req.user._id },
        { column: "is_active", operator: "eq", value: true },
      ],
      limit: 1,
    });

    const meeting = mapMeetingRoomRow(rows[0]);

    if (!meeting) {
      return res.status(httpStatus.NOT_FOUND).json({ message: "Meeting not found" });
    }

    if (new Date() >= new Date(meeting.scheduledStartAt)) {
      return res
        .status(httpStatus.BAD_REQUEST)
        .json({ message: "Only upcoming meetings can be rescheduled" });
    }

    const policy = await getEffectivePolicy();
    const { scheduledStartAt, durationMinutes, scheduledEndAt, reminderAt } = parseSchedule(
      req.body?.startAt,
      req.body?.durationMinutes,
      Math.min(720, Math.max(15, Number(policy.maxMeetingDurationMinutes || 120)))
    );

    await supabase.update(
      "meeting_rooms",
      {
        scheduled_start_at: scheduledStartAt.toISOString(),
        duration_minutes: durationMinutes,
        scheduled_end_at: scheduledEndAt.toISOString(),
        reminder_at: reminderAt.toISOString(),
        reminder_sent_at: null,
      },
      { filters: [{ column: "id", operator: "eq", value: meeting._id }], returning: false }
    );

    meeting.scheduledStartAt = scheduledStartAt;
    meeting.durationMinutes = durationMinutes;
    meeting.scheduledEndAt = scheduledEndAt;
    meeting.reminderAt = reminderAt;
    meeting.reminderSentAt = null;

    return res.status(httpStatus.OK).json({
      meetingId: meeting.meetingId,
      schedule: {
        startAt: meeting.scheduledStartAt,
        endAt: meeting.scheduledEndAt,
        durationMinutes: meeting.durationMinutes,
        reminderAt: meeting.reminderAt,
      },
      message: "Meeting rescheduled successfully",
    });
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json({ message: `Unable to reschedule meeting: ${error.message}` });
  }
};

const cancelMeeting = async (req, res) => {
  const meetingId = req.params.meetingId?.trim();
  if (!meetingId) {
    return res.status(httpStatus.BAD_REQUEST).json({ message: "Meeting ID is required" });
  }

  try {
    const { rows } = await supabase.select("meeting_rooms", {
      select: "id,meeting_id,host_user_id,is_active",
      filters: [
        { column: "meeting_id", operator: "eq", value: meetingId },
        { column: "host_user_id", operator: "eq", value: req.user._id },
        { column: "is_active", operator: "eq", value: true },
      ],
      limit: 1,
    });

    const meeting = mapMeetingRoomRow(rows[0]);

    if (!meeting) {
      return res.status(httpStatus.NOT_FOUND).json({ message: "Meeting not found" });
    }

    await supabase.update(
      "meeting_rooms",
      { is_active: false },
      { filters: [{ column: "id", operator: "eq", value: meeting._id }], returning: false }
    );

    return res.status(httpStatus.OK).json({
      meetingId: meeting.meetingId,
      message: "Meeting cancelled successfully",
    });
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json({ message: `Unable to cancel meeting: ${error.message}` });
  }
};

const startScheduledMeeting = async (req, res) => {
  const meetingId = req.params.meetingId?.trim();
  if (!meetingId) {
    return res.status(httpStatus.BAD_REQUEST).json({ message: "Meeting ID is required" });
  }

  try {
    const { rows } = await supabase.select("meeting_rooms", {
      select: "id,meeting_id,host_user_id,duration_minutes,scheduled_end_at,is_active",
      filters: [
        { column: "meeting_id", operator: "eq", value: meetingId },
        { column: "host_user_id", operator: "eq", value: req.user._id },
        { column: "is_active", operator: "eq", value: true },
      ],
      limit: 1,
    });

    const meeting = mapMeetingRoomRow(rows[0]);

    if (!meeting) {
      return res.status(httpStatus.NOT_FOUND).json({ message: "Meeting not found" });
    }

    const now = new Date();
    if (now > new Date(meeting.scheduledEndAt)) {
      await supabase.update(
        "meeting_rooms",
        { is_active: false },
        { filters: [{ column: "id", operator: "eq", value: meeting._id }], returning: false }
      );
      return res.status(httpStatus.GONE).json({ message: "Meeting session expired" });
    }

    const updatedStart = now;
    const updatedEnd = new Date(now.getTime() + meeting.durationMinutes * 60 * 1000);
    const updatedReminder = new Date(now.getTime() - 10 * 60 * 1000);

    await supabase.update(
      "meeting_rooms",
      {
        scheduled_start_at: updatedStart.toISOString(),
        scheduled_end_at: updatedEnd.toISOString(),
        reminder_at: updatedReminder.toISOString(),
        reminder_sent_at: now.toISOString(),
      },
      { filters: [{ column: "id", operator: "eq", value: meeting._id }], returning: false }
    );

    meeting.scheduledStartAt = updatedStart;
    meeting.scheduledEndAt = updatedEnd;
    meeting.reminderAt = updatedReminder;
    meeting.reminderSentAt = now;

    return res.status(httpStatus.OK).json({
      meetingId: meeting.meetingId,
      schedule: {
        startAt: meeting.scheduledStartAt,
        endAt: meeting.scheduledEndAt,
        durationMinutes: meeting.durationMinutes,
      },
      message: "Meeting started successfully",
    });
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json({ message: `Unable to start meeting: ${error.message}` });
  }
};

export {
  createMeetingRoom,
  validateMeetingJoin,
  getMeetingMeta,
  getHostScheduledMeetings,
  rescheduleMeeting,
  cancelMeeting,
  startScheduledMeeting,
};
