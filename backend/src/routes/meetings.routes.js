import { Router } from "express";
import { requireAuth, requireHost } from "../middlewares/auth.middleware.js";
import {
  cancelMeeting,
  createMeetingRoom,
  getMeetingMeta,
  getHostScheduledMeetings,
  rescheduleMeeting,
  startScheduledMeeting,
  validateMeetingJoin,
} from "../controllers/meeting.controller.js";

const router = Router();

router.route("/").post(requireHost, createMeetingRoom);
router.route("/host/scheduled").get(requireHost, getHostScheduledMeetings);
router.route("/:meetingId").get(requireAuth, getMeetingMeta);
router.route("/:meetingId/join").post(requireAuth, validateMeetingJoin);
router.route("/:meetingId/schedule").patch(requireHost, rescheduleMeeting);
router.route("/:meetingId/cancel").patch(requireHost, cancelMeeting);
router.route("/:meetingId/start").patch(requireHost, startScheduledMeeting);

export default router;
