import React, { useContext, useMemo, useState } from "react";
import { Alert, Button, CircularProgress, Snackbar, TextField } from "@mui/material";
import { useLocation, useNavigate } from "react-router-dom";
import { AuthContext } from "../contexts/AuthContext";

export default function ResetPassword() {
  const navigate = useNavigate();
  const location = useLocation();

  const search = location.search || "";
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const tokenFromLink = String(params.get("token") || "").trim();
  const emailFromLink = String(params.get("email") || "").trim().toLowerCase();

  const { resetPassword } = useContext(AuthContext);

  const [email, setEmail] = useState(emailFromLink);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [openToast, setOpenToast] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isTokenMissing = !tokenFromLink;

  const isSubmitDisabled = useMemo(() => {
    if (isTokenMissing) return true;
    if (!password.trim() || !confirmPassword.trim()) return true;
    if (password !== confirmPassword) return true;
    return false;
  }, [confirmPassword, isTokenMissing, password]);

  const handleSubmit = async () => {
    setError("");
    if (isTokenMissing) {
      setError("Reset link is missing or invalid. Please request a new reset email.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await resetPassword({
        token: tokenFromLink,
        email: String(email || "").trim().toLowerCase(),
        password: password,
      });

      setMessage(result?.message || "Password updated successfully. Please sign in.");
      setOpenToast(true);
      setTimeout(() => navigate("/auth"), 900);
    } catch (err) {
      const msg = err?.response?.data?.message || "Unable to reset password. Please try again.";
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="authPageRoot">
      <div className="authShell">
        <section className="authLeftPanel">
          <div className="authBrandTop">Zomeetix</div>

          <div className="authBenefitCard">
            <h2>Account recovery</h2>
            <ul>
              <li>Reset links expire automatically</li>
              <li>One-time secure reset token</li>
              <li>Sign in again after update</li>
            </ul>
          </div>
        </section>

        <section className="authRightPanel">
          <div className="authFormWrap">
            <h1>Reset your password</h1>
            <p>Create a new password for your account.</p>

            <TextField
              fullWidth
              label="Email Address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              margin="normal"
              disabled={Boolean(emailFromLink)}
            />

            <TextField
              fullWidth
              label="New password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              margin="normal"
            />

            <TextField
              fullWidth
              label="Confirm new password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              margin="normal"
            />

            {isTokenMissing ? (
              <Alert severity="warning" sx={{ mt: 1 }}>
                Reset link is missing or invalid. Please request a new reset link from the sign-in page.
              </Alert>
            ) : null}

            {error ? (
              <Alert severity="error" sx={{ mt: 1 }}>
                {error}
              </Alert>
            ) : null}

            <Button
              fullWidth
              variant="contained"
              className="authPrimaryBtn"
              disabled={isSubmitDisabled || isSubmitting}
              onClick={handleSubmit}
              sx={{ mt: 2 }}
            >
              {isSubmitting ? <CircularProgress size={20} color="inherit" /> : "Update password"}
            </Button>

            <Button variant="text" sx={{ mt: 1 }} onClick={() => navigate("/auth")}>
              Back to sign in
            </Button>
          </div>
        </section>
      </div>

      <Snackbar
        open={openToast}
        autoHideDuration={3500}
        onClose={() => setOpenToast(false)}
        message={message}
      />
    </div>
  );
}

