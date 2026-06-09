import React, { useContext, useState } from "react";
import { Alert, Button, Snackbar, TextField } from "@mui/material";
import { AdminAuthContext } from "../contexts/AdminAuthContext";
import "../App.css";

function AdminLogin() {
  const [name, setName] = useState("Admin");
  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [password, setPassword] = useState("");
  const [setupKey, setSetupKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const { loginAdmin, bootstrapAdminAccount } = useContext(AdminAuthContext);

  const onSubmit = async (event) => {
    event.preventDefault();
    const value = usernameOrEmail.trim();
    if (!value || !password.trim()) {
      setError("Username/Email and password are required.");
      return;
    }

    try {
      setLoading(true);
      await loginAdmin({
        username: value.includes("@") ? "" : value,
        email: value.includes("@") ? value : "",
        password: password.trim(),
      });
    } catch (e) {
      const message = e?.response?.data?.message || e?.message || "Unable to login";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const promoteAndLogin = async () => {
    const value = usernameOrEmail.trim();
    if (!value || !password.trim()) {
      setError("Username/Email and password are required.");
      return;
    }
    if (!setupKey.trim()) {
      setError("Admin setup key is required for first-time bootstrap.");
      return;
    }

    try {
      setLoading(true);
      await bootstrapAdminAccount({
        name: name.trim() || "Admin",
        username: value.includes("@") ? `admin_${Date.now().toString().slice(-4)}` : value,
        email: value.includes("@") ? value : `${value}@zomeetix.local`,
        password: password.trim(),
        setupKey: setupKey.trim(),
      });
      setInfo("Admin role granted. Logging in...");
      await loginAdmin({
        username: value.includes("@") ? "" : value,
        email: value.includes("@") ? value : "",
        password: password.trim(),
      });
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || "Unable to promote account.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="adminLoginPage">
      <div className="adminLoginCard">
        <p className="adminOverline">Zomeetix</p>
        <h1>Admin Console</h1>
        <p className="adminSubtext">Sign in to manage users, meetings and policies.</p>

        <form onSubmit={onSubmit} className="adminLoginForm">
          <TextField
            label="Name (for first admin setup)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            size="small"
          />
          <TextField
            label="Username or Email"
            value={usernameOrEmail}
            onChange={(e) => setUsernameOrEmail(e.target.value)}
            fullWidth
            size="small"
          />
          <TextField
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            fullWidth
            size="small"
          />
          <TextField
            label="Admin setup key (first-time only)"
            type="password"
            value={setupKey}
            onChange={(e) => setSetupKey(e.target.value)}
            fullWidth
            size="small"
            helperText="Used only for the first admin bootstrap. Keep it private."
          />
          <Button type="submit" variant="contained">
            {loading ? "Please wait..." : "Login to Admin"}
          </Button>
          <Button type="button" variant="outlined" onClick={promoteAndLogin} disabled={loading}>
            Promote This Account To Admin
          </Button>
        </form>
      </div>

      <Snackbar
        open={Boolean(error)}
        autoHideDuration={3000}
        onClose={() => setError("")}
      >
        <Alert severity="error" onClose={() => setError("")}>
          {error}
        </Alert>
      </Snackbar>
      <Snackbar open={Boolean(info)} autoHideDuration={2200} onClose={() => setInfo("")}>
        <Alert severity="success" onClose={() => setInfo("")}>
          {info}
        </Alert>
      </Snackbar>
    </div>
  );
}

export default AdminLogin;
