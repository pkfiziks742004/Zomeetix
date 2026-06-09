import { Router } from "express";
import {
  addToHistory,
  adminLogin,
  authPreflight,
  bootstrapAdmin,
  getUserHistory,
  getMe,
  login,
  logout,
  requestAuthOtp,
  requestPasswordReset,
  register,
  updateMe,
  resetPassword,
  verifyAuthOtp,
} from "../controllers/user.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";

const router = Router();

router.route("/auth/preflight").post(authPreflight);
router.route("/auth/otp/request").post(requestAuthOtp);
router.route("/auth/otp/verify").post(verifyAuthOtp);
router.route("/password/forgot").post(requestPasswordReset);
router.route("/password/reset").post(resetPassword);
router.route("/login").post(login);
router.route("/admin/login").post(adminLogin);
router.route("/register").post(register);
router.route("/admin/bootstrap").post(bootstrapAdmin);
router.route("/logout").post(requireAuth, logout);
router.route("/me").get(requireAuth, getMe).patch(requireAuth, updateMe);

router.route("/activity").post(requireAuth, addToHistory).get(requireAuth, getUserHistory);

// Backward-compatible routes
router.route("/add_to_activity").post(requireAuth, addToHistory);
router.route("/get_all_activity").get(requireAuth, getUserHistory);

export default router;
