import React from "react";
import { Navigate } from "react-router-dom";

const withAdminAuth = (Component) => {
  return function ProtectedComponent(props) {
    const token = localStorage.getItem("admin_token");
    const expiresAtRaw = localStorage.getItem("admin_token_expires_at");
    const rawUser = localStorage.getItem("admin_user");
    let role = "";
    try {
      role = rawUser ? JSON.parse(rawUser)?.role : "";
    } catch {
      role = "";
    }

    if (expiresAtRaw) {
      const expiresAt = new Date(expiresAtRaw);
      if (!Number.isNaN(expiresAt.getTime()) && Date.now() > expiresAt.getTime()) {
        localStorage.removeItem("admin_token");
        localStorage.removeItem("admin_token_expires_at");
        localStorage.removeItem("admin_user");
        return <Navigate to="/login" replace />;
      }
    }

    if (!token || role !== "admin") {
      return <Navigate to="/login" replace />;
    }
    return <Component {...props} />;
  };
};

export default withAdminAuth;
