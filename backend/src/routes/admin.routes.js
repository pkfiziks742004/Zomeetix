import { Router } from "express";
import { requireAdmin } from "../middlewares/auth.middleware.js";
import {
  bulkCancelActiveMeetings,
  cancelMeetingAsAdmin,
  getAdminOverview,
  getAdminPolicies,
  getSecuritySummary,
  listAuditLogs,
  listMeetings,
  listUsers,
  revokeUserSession,
  updateAdminPolicies,
  updateUserRole,
  updateUserStatus,
} from "../controllers/admin.controller.js";

const router = Router();

router.route("/overview").get(requireAdmin, getAdminOverview);
router.route("/users").get(requireAdmin, listUsers);
router.route("/users/:userId/role").patch(requireAdmin, updateUserRole);
router.route("/users/:userId/status").patch(requireAdmin, updateUserStatus);
router.route("/users/:userId/revoke-session").post(requireAdmin, revokeUserSession);
router.route("/meetings").get(requireAdmin, listMeetings);
router.route("/meetings/:meetingId/cancel").patch(requireAdmin, cancelMeetingAsAdmin);
router.route("/meetings/actions/cancel-active").post(requireAdmin, bulkCancelActiveMeetings);
router.route("/policies").get(requireAdmin, getAdminPolicies).patch(requireAdmin, updateAdminPolicies);
router.route("/audit-logs").get(requireAdmin, listAuditLogs);
router.route("/security/summary").get(requireAdmin, getSecuritySummary);

export default router;
