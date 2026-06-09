import httpStatus from "http-status";
import supabase from "../db/supabase.js";
import { ensureAdminPolicy } from "../db/adminPolicy.js";

const getClientIp = (req) =>
  String(req.headers["x-forwarded-for"] || req.ip || req.socket?.remoteAddress || "")
    .split(",")[0]
    .trim();

const mapUserRow = (row) => {
  if (!row) return null;
  return {
    _id: row.id,
    name: row.name,
    username: row.username,
    email: row.email,
    role: row.role,
    isActive: row.is_active,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
  };
};

const mapMeetingRoomRowToAdminItem = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    meetingId: row.meeting_id,
    hostEmail: row.host_email,
    hostName: row.created_by_name,
    isActive: row.is_active,
    schedule: {
      startAt: row.scheduled_start_at,
      endAt: row.scheduled_end_at,
      durationMinutes: row.duration_minutes,
    },
    createdAt: row.created_at,
  };
};

const mapAuditLogRow = (row) => {
  if (!row) return null;
  return {
    _id: row.id,
    adminUserId: row.admin_user_id,
    adminEmail: row.admin_email,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    details: row.details,
    ipAddress: row.ip_address,
    createdAt: row.created_at,
  };
};

const logAdminAction = async (req, action, targetType, targetId = "", details = {}) => {
  try {
    await supabase.insert(
      "admin_audit_logs",
      {
        id: supabase.createId(),
        admin_user_id: req.user._id,
        admin_email: req.user.email,
        action,
        target_type: targetType,
        target_id: String(targetId || ""),
        details: details || {},
        ip_address: getClientIp(req),
      },
      { returning: false }
    );
  } catch {
    // avoid blocking primary admin actions on log failure
  }
};

const countRows = async (table, { filters = [], or = [] } = {}) => {
  const { total } = await supabase.select(table, {
    select: "id",
    filters,
    or,
    count: true,
    limit: 0,
  });
  return Number(total || 0);
};

const getAdminOverview = async (_req, res) => {
  try {
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [totalUsers, activeUsers, adminUsers, scheduledMeetings, activeMeetings, recentHistory] =
      await Promise.all([
        countRows("users"),
        countRows("users", { filters: [{ column: "is_active", operator: "eq", value: true }] }),
        countRows("users", { filters: [{ column: "role", operator: "eq", value: "admin" }] }),
        countRows("meeting_rooms", {
          filters: [
            { column: "is_active", operator: "eq", value: true },
            { column: "scheduled_start_at", operator: "gte", value: now.toISOString() },
          ],
        }),
        countRows("meeting_rooms", {
          filters: [
            { column: "is_active", operator: "eq", value: true },
            { column: "scheduled_start_at", operator: "lte", value: now.toISOString() },
            { column: "scheduled_end_at", operator: "gte", value: now.toISOString() },
          ],
        }),
        countRows("meetings", {
          filters: [{ column: "created_at", operator: "gte", value: dayAgo.toISOString() }],
        }),
      ]);

    const policy = await ensureAdminPolicy();
    return res.status(httpStatus.OK).json({
      metrics: {
        totalUsers,
        activeUsers,
        adminUsers,
        scheduledMeetings,
        activeMeetings,
        historyEventsLast24h: recentHistory,
      },
      policy: {
        allowGuestJoin: policy.allow_guest_join !== false,
        enforceWaitingRoom: policy.enforce_waiting_room === true,
        maxMeetingDurationMinutes: Number(policy.max_meeting_duration_minutes || 120),
        requireStrongMeetingPassword: policy.require_strong_meeting_password !== false,
      },
    });
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json({ message: `Unable to load admin overview: ${error.message}` });
  }
};

const listUsers = async (req, res) => {
  try {
    const queryText = String(req.query.q || "").trim();
    const role = String(req.query.role || "").trim();
    const status = String(req.query.status || "").trim();
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(50, Math.max(1, Number(req.query.limit || 10)));

    const filters = [];
    const or = [];

    if (queryText) {
      const pattern = `*${queryText}*`;
      or.push({ column: "name", operator: "ilike", value: pattern });
      or.push({ column: "username", operator: "ilike", value: pattern });
      or.push({ column: "email", operator: "ilike", value: pattern });
    }
    if (["user", "host", "admin"].includes(role)) {
      filters.push({ column: "role", operator: "eq", value: role });
    }
    if (status === "active") {
      filters.push({ column: "is_active", operator: "eq", value: true });
    }
    if (status === "disabled") {
      filters.push({ column: "is_active", operator: "eq", value: false });
    }

    const offset = (page - 1) * limit;
    const { rows, total } = await supabase.select("users", {
      select: "id,name,username,email,role,is_active,last_login_at,created_at",
      filters,
      or,
      orderBy: "created_at.desc",
      limit,
      offset,
      count: true,
    });

    const items = rows.map(mapUserRow).filter(Boolean);
    const totalCount = Number(total || 0);

    return res.status(httpStatus.OK).json({
      items,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.max(1, Math.ceil(totalCount / limit)),
      },
    });
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json({ message: `Unable to list users: ${error.message}` });
  }
};

const updateUserRole = async (req, res) => {
  const userId = req.params.userId?.trim();
  const role = String(req.body.role || "").trim();
  if (!userId || !["user", "host", "admin"].includes(role)) {
    return res.status(httpStatus.BAD_REQUEST).json({ message: "Valid user ID and role are required" });
  }

  try {
    const { rows } = await supabase.select("users", {
      select: "id,email,role",
      filters: [{ column: "id", operator: "eq", value: userId }],
      limit: 1,
    });
    const user = rows[0] || null;
    if (!user) {
      return res.status(httpStatus.NOT_FOUND).json({ message: "User not found" });
    }
    if (String(user.id) === String(req.user._id) && role !== "admin") {
      return res.status(httpStatus.BAD_REQUEST).json({ message: "You cannot demote your own admin account" });
    }

    await supabase.update(
      "users",
      { role },
      { filters: [{ column: "id", operator: "eq", value: user.id }], returning: false }
    );
    await logAdminAction(req, "user.role.update", "user", user.id, { role });

    return res.status(httpStatus.OK).json({
      id: user.id,
      role,
      message: "User role updated",
    });
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json({ message: `Unable to update role: ${error.message}` });
  }
};

const updateUserStatus = async (req, res) => {
  const userId = req.params.userId?.trim();
  const isActive = req.body.isActive;
  if (!userId || typeof isActive !== "boolean") {
    return res.status(httpStatus.BAD_REQUEST).json({ message: "Valid user ID and isActive are required" });
  }

  try {
    const { rows } = await supabase.select("users", {
      select: "id,email,is_active",
      filters: [{ column: "id", operator: "eq", value: userId }],
      limit: 1,
    });
    const user = rows[0] || null;
    if (!user) {
      return res.status(httpStatus.NOT_FOUND).json({ message: "User not found" });
    }
    if (String(user.id) === String(req.user._id) && isActive === false) {
      return res.status(httpStatus.BAD_REQUEST).json({ message: "You cannot disable your own account" });
    }

    const update = { is_active: isActive };
    if (!isActive) {
      update.token = null;
      update.token_hash = null;
      update.token_expires_at = null;
    }

    await supabase.update("users", update, {
      filters: [{ column: "id", operator: "eq", value: user.id }],
      returning: false,
    });
    await logAdminAction(req, "user.status.update", "user", user.id, { isActive });

    return res.status(httpStatus.OK).json({
      id: user.id,
      isActive,
      message: "User status updated",
    });
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json({ message: `Unable to update status: ${error.message}` });
  }
};

const listMeetings = async (req, res) => {
  try {
    const queryText = String(req.query.q || "").trim();
    const status = String(req.query.status || "").trim();
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(50, Math.max(1, Number(req.query.limit || 10)));
    const now = new Date();

    const filters = [];
    const or = [];

    if (queryText) {
      const pattern = `*${queryText}*`;
      or.push({ column: "meeting_id", operator: "ilike", value: pattern });
      or.push({ column: "host_email", operator: "ilike", value: pattern });
      or.push({ column: "created_by_name", operator: "ilike", value: pattern });
    }

    if (status === "upcoming") {
      filters.push({ column: "is_active", operator: "eq", value: true });
      filters.push({ column: "scheduled_start_at", operator: "gt", value: now.toISOString() });
    } else if (status === "active") {
      filters.push({ column: "is_active", operator: "eq", value: true });
      filters.push({ column: "scheduled_start_at", operator: "lte", value: now.toISOString() });
      filters.push({ column: "scheduled_end_at", operator: "gte", value: now.toISOString() });
    } else if (status === "expired") {
      filters.push({ column: "is_active", operator: "eq", value: false });
    }

    const offset = (page - 1) * limit;
    const { rows, total } = await supabase.select("meeting_rooms", {
      select:
        "id,meeting_id,host_email,created_by_name,is_active,scheduled_start_at,scheduled_end_at,duration_minutes,created_at",
      filters,
      or,
      orderBy: "scheduled_start_at.desc",
      limit,
      offset,
      count: true,
    });

    const items = rows.map(mapMeetingRoomRowToAdminItem).filter(Boolean);
    const totalCount = Number(total || 0);

    return res.status(httpStatus.OK).json({
      items,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.max(1, Math.ceil(totalCount / limit)),
      },
    });
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json({ message: `Unable to list meetings: ${error.message}` });
  }
};

const cancelMeetingAsAdmin = async (req, res) => {
  const meetingId = req.params.meetingId?.trim();
  if (!meetingId) {
    return res.status(httpStatus.BAD_REQUEST).json({ message: "Meeting ID is required" });
  }

  try {
    const { rows } = await supabase.select("meeting_rooms", {
      select: "id,meeting_id,host_email,is_active",
      filters: [{ column: "meeting_id", operator: "eq", value: meetingId }],
      limit: 1,
    });
    const meeting = rows[0] || null;
    if (!meeting) {
      return res.status(httpStatus.NOT_FOUND).json({ message: "Meeting not found" });
    }

    await supabase.update(
      "meeting_rooms",
      { is_active: false },
      { filters: [{ column: "id", operator: "eq", value: meeting.id }], returning: false }
    );
    await logAdminAction(req, "meeting.cancel", "meeting", meeting.meeting_id, { hostEmail: meeting.host_email });

    return res.status(httpStatus.OK).json({
      meetingId: meeting.meeting_id,
      message: "Meeting cancelled by admin",
    });
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json({ message: `Unable to cancel meeting: ${error.message}` });
  }
};

const getAdminPolicies = async (_req, res) => {
  try {
    const policy = await ensureAdminPolicy();
    return res.status(httpStatus.OK).json({
      allowGuestJoin: policy.allow_guest_join !== false,
      enforceWaitingRoom: policy.enforce_waiting_room === true,
      maxMeetingDurationMinutes: Number(policy.max_meeting_duration_minutes || 120),
      requireStrongMeetingPassword: policy.require_strong_meeting_password !== false,
    });
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json({ message: `Unable to load policies: ${error.message}` });
  }
};

const updateAdminPolicies = async (req, res) => {
  try {
    const policy = await ensureAdminPolicy();

    const allowGuestJoin = req.body.allowGuestJoin;
    const enforceWaitingRoom = req.body.enforceWaitingRoom;
    const maxMeetingDurationMinutes = Number(req.body.maxMeetingDurationMinutes);
    const requireStrongMeetingPassword = req.body.requireStrongMeetingPassword;

    const update = {};
    if (typeof allowGuestJoin === "boolean") {
      update.allow_guest_join = allowGuestJoin;
    }
    if (typeof enforceWaitingRoom === "boolean") {
      update.enforce_waiting_room = enforceWaitingRoom;
    }
    if (Number.isFinite(maxMeetingDurationMinutes)) {
      if (maxMeetingDurationMinutes < 15 || maxMeetingDurationMinutes > 720) {
        return res.status(httpStatus.BAD_REQUEST).json({
          message: "maxMeetingDurationMinutes must be between 15 and 720",
        });
      }
      update.max_meeting_duration_minutes = maxMeetingDurationMinutes;
    }
    if (typeof requireStrongMeetingPassword === "boolean") {
      update.require_strong_meeting_password = requireStrongMeetingPassword;
    }

    update.updated_by_user_id = req.user._id;
    update.updated_by_email = req.user.email;

    await supabase.update("admin_policies", update, {
      filters: [{ column: "singleton_key", operator: "eq", value: policy.singleton_key || "global" }],
      returning: false,
    });

    const updatedPolicy = await ensureAdminPolicy();
    await logAdminAction(req, "policy.update", "policy", "global", {
      allowGuestJoin: updatedPolicy.allow_guest_join !== false,
      enforceWaitingRoom: updatedPolicy.enforce_waiting_room === true,
      maxMeetingDurationMinutes: Number(updatedPolicy.max_meeting_duration_minutes || 120),
      requireStrongMeetingPassword: updatedPolicy.require_strong_meeting_password !== false,
    });

    return res.status(httpStatus.OK).json({
      message: "Policies updated successfully",
      policy: {
        allowGuestJoin: updatedPolicy.allow_guest_join !== false,
        enforceWaitingRoom: updatedPolicy.enforce_waiting_room === true,
        maxMeetingDurationMinutes: Number(updatedPolicy.max_meeting_duration_minutes || 120),
        requireStrongMeetingPassword: updatedPolicy.require_strong_meeting_password !== false,
      },
    });
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json({ message: `Unable to update policies: ${error.message}` });
  }
};

const listAuditLogs = async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
    const action = String(req.query.action || "").trim();

    const filters = [];
    if (action) {
      filters.push({ column: "action", operator: "ilike", value: `*${action}*` });
    }

    const offset = (page - 1) * limit;
    const { rows, total } = await supabase.select("admin_audit_logs", {
      select:
        "id,admin_user_id,admin_email,action,target_type,target_id,details,ip_address,created_at",
      filters,
      orderBy: "created_at.desc",
      limit,
      offset,
      count: true,
    });

    const items = rows.map(mapAuditLogRow).filter(Boolean);
    const totalCount = Number(total || 0);

    return res.status(httpStatus.OK).json({
      items,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.max(1, Math.ceil(totalCount / limit)),
      },
    });
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json({ message: `Unable to load audit logs: ${error.message}` });
  }
};

const revokeUserSession = async (req, res) => {
  const userId = req.params.userId?.trim();
  if (!userId) {
    return res.status(httpStatus.BAD_REQUEST).json({ message: "User ID is required" });
  }

  try {
    const { rows } = await supabase.select("users", {
      select: "id,email",
      filters: [{ column: "id", operator: "eq", value: userId }],
      limit: 1,
    });
    const user = rows[0] || null;
    if (!user) {
      return res.status(httpStatus.NOT_FOUND).json({ message: "User not found" });
    }

    await supabase.update(
      "users",
      { token: null, token_hash: null, token_expires_at: null },
      { filters: [{ column: "id", operator: "eq", value: user.id }], returning: false }
    );
    await logAdminAction(req, "user.session.revoke", "user", user.id, { email: user.email });

    return res.status(httpStatus.OK).json({
      id: user.id,
      message: "User session revoked",
    });
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json({ message: `Unable to revoke user session: ${error.message}` });
  }
};

const getSecuritySummary = async (_req, res) => {
  try {
    const now = Date.now();
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const nowIso = new Date(now).toISOString();

    const [disabledUsers, staleAdmins, noRecentLoginUsers, activeMeetings] =
      await Promise.all([
        countRows("users", { filters: [{ column: "is_active", operator: "eq", value: false }] }),
        countRows("users", {
          filters: [{ column: "role", operator: "eq", value: "admin" }],
          or: [
            { column: "last_login_at", operator: "is", value: null },
            { column: "last_login_at", operator: "lt", value: thirtyDaysAgo.toISOString() },
          ],
        }),
        countRows("users", {
          filters: [{ column: "is_active", operator: "eq", value: true }],
          or: [
            { column: "last_login_at", operator: "is", value: null },
            { column: "last_login_at", operator: "lt", value: sevenDaysAgo.toISOString() },
          ],
        }),
        countRows("meeting_rooms", {
          filters: [
            { column: "is_active", operator: "eq", value: true },
            { column: "scheduled_start_at", operator: "lte", value: nowIso },
            { column: "scheduled_end_at", operator: "gte", value: nowIso },
          ],
        }),
      ]);

    return res.status(httpStatus.OK).json({
      disabledUsers,
      staleAdmins,
      noRecentLoginUsers,
      activeMeetings,
    });
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json({ message: `Unable to load security summary: ${error.message}` });
  }
};

const bulkCancelActiveMeetings = async (req, res) => {
  const confirm = String(req.body.confirm || "").trim().toLowerCase();
  if (confirm !== "cancel-active-meetings") {
    return res.status(httpStatus.BAD_REQUEST).json({
      message: "Confirmation mismatch. Pass confirm=cancel-active-meetings",
    });
  }

  try {
    const now = new Date().toISOString();
    const cancelledCount = await countRows("meeting_rooms", {
      filters: [
        { column: "is_active", operator: "eq", value: true },
        { column: "scheduled_start_at", operator: "lte", value: now },
        { column: "scheduled_end_at", operator: "gte", value: now },
      ],
    });

    await supabase.update(
      "meeting_rooms",
      { is_active: false },
      {
        filters: [
          { column: "is_active", operator: "eq", value: true },
          { column: "scheduled_start_at", operator: "lte", value: now },
          { column: "scheduled_end_at", operator: "gte", value: now },
        ],
        returning: false,
      }
    );

    await logAdminAction(req, "meeting.bulk.cancel.active", "meeting", "active", {
      modifiedCount: cancelledCount,
    });

    return res.status(httpStatus.OK).json({
      cancelledCount,
      message: "Active meetings cancelled",
    });
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json({ message: `Unable to bulk cancel active meetings: ${error.message}` });
  }
};

export {
  getAdminOverview,
  listUsers,
  updateUserRole,
  updateUserStatus,
  revokeUserSession,
  listMeetings,
  cancelMeetingAsAdmin,
  bulkCancelActiveMeetings,
  getSecuritySummary,
  getAdminPolicies,
  updateAdminPolicies,
  listAuditLogs,
};

