import axios from "axios";
import httpStatus from "http-status";
import { createContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import server, { adminSetupKey } from "../environment";

export const AdminAuthContext = createContext({});

const usersClient = axios.create({
  baseURL: `${server}/api/v1/users`,
});
const adminClient = axios.create({
  baseURL: `${server}/api/v1/admin`,
});

const attachToken = (config) => {
  const token = localStorage.getItem("admin_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
};

usersClient.interceptors.request.use(attachToken);
adminClient.interceptors.request.use(attachToken);

export const AdminAuthProvider = ({ children }) => {
  const navigate = useNavigate();
  const [adminUser, setAdminUser] = useState(() => {
    const raw = localStorage.getItem("admin_user");
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  });

  const loginAdmin = async ({ username, email, password }) => {
    const response = await usersClient.post("/admin/login", { username, email, password });
    if (response.status !== httpStatus.OK) {
      throw new Error("Unable to login");
    }

    if (response?.data?.user?.role !== "admin") {
      throw new Error("Admin access required");
    }

    localStorage.setItem("admin_token", response.data.token);
    if (response.data.expiresAt) {
      localStorage.setItem("admin_token_expires_at", String(response.data.expiresAt));
    } else {
      localStorage.removeItem("admin_token_expires_at");
    }
    localStorage.setItem("admin_user", JSON.stringify(response.data.user));
    setAdminUser(response.data.user);
    navigate("/dashboard");
  };

  const logoutAdmin = async () => {
    try {
      await usersClient.post("/logout");
    } catch {
      // no-op
    }

    localStorage.removeItem("admin_token");
    localStorage.removeItem("admin_token_expires_at");
    localStorage.removeItem("admin_user");
    setAdminUser(null);
    navigate("/login");
  };

  useEffect(() => {
    const handleAuthFailure = (error) => {
      const status = error?.response?.status;
      const message = String(error?.response?.data?.message || "");
      const normalized = message.toLowerCase();

      const isSessionFailure =
        status === 401 &&
        (normalized.includes("authentication token") ||
          normalized.includes("invalid authentication token") ||
          normalized.includes("session expired"));

      const isRoleFailure =
        status === 403 && (normalized.includes("admin access required") || normalized.includes("disabled"));

      if (isSessionFailure || isRoleFailure) {
        localStorage.removeItem("admin_token");
        localStorage.removeItem("admin_token_expires_at");
        localStorage.removeItem("admin_user");
        setAdminUser(null);
        navigate("/login");
      }
      return Promise.reject(error);
    };

    const usersInterceptor = usersClient.interceptors.response.use((response) => response, handleAuthFailure);
    const adminInterceptor = adminClient.interceptors.response.use((response) => response, handleAuthFailure);
    return () => {
      usersClient.interceptors.response.eject(usersInterceptor);
      adminClient.interceptors.response.eject(adminInterceptor);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  const getAdminOverview = async () => {
    const response = await adminClient.get("/overview");
    return response.data;
  };

  const listUsers = async (query = {}) => {
    const response = await adminClient.get("/users", { params: query });
    return response.data;
  };

  const updateUserRole = async (userId, role) => {
    const response = await adminClient.patch(`/users/${userId}/role`, { role });
    return response.data;
  };

  const updateUserStatus = async (userId, isActive) => {
    const response = await adminClient.patch(`/users/${userId}/status`, { isActive });
    return response.data;
  };

  const revokeUserSession = async (userId) => {
    const response = await adminClient.post(`/users/${userId}/revoke-session`);
    return response.data;
  };

  const listMeetings = async (query = {}) => {
    const response = await adminClient.get("/meetings", { params: query });
    return response.data;
  };

  const cancelMeetingByAdmin = async (meetingId) => {
    const response = await adminClient.patch(`/meetings/${meetingId}/cancel`);
    return response.data;
  };

  const cancelAllActiveMeetings = async () => {
    const response = await adminClient.post("/meetings/actions/cancel-active", {
      confirm: "cancel-active-meetings",
    });
    return response.data;
  };

  const getPolicies = async () => {
    const response = await adminClient.get("/policies");
    return response.data;
  };

  const updatePolicies = async (payload) => {
    const response = await adminClient.patch("/policies", payload);
    return response.data;
  };

  const listAuditLogs = async (query = {}) => {
    const response = await adminClient.get("/audit-logs", { params: query });
    return response.data;
  };

  const getSecuritySummary = async () => {
    const response = await adminClient.get("/security/summary");
    return response.data;
  };

  const bootstrapAdminAccount = async ({ name, username, email, password, setupKey }) => {
    const response = await usersClient.post("/admin/bootstrap", {
      name,
      username,
      email,
      password,
      setupKey: String(setupKey || adminSetupKey || "").trim(),
    });
    return response.data;
  };

  const value = {
    adminUser,
    loginAdmin,
    logoutAdmin,
    getAdminOverview,
    listUsers,
    updateUserRole,
    updateUserStatus,
    revokeUserSession,
    listMeetings,
    cancelMeetingByAdmin,
    cancelAllActiveMeetings,
    getPolicies,
    updatePolicies,
    listAuditLogs,
    getSecuritySummary,
    bootstrapAdminAccount,
  };

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
};
