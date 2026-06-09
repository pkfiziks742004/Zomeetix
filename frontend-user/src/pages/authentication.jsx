import React, { useContext, useMemo, useState } from "react";
import { Alert, Button, CircularProgress, FormControlLabel, Radio, RadioGroup, Snackbar, TextField } from "@mui/material";
import { AuthContext } from "../contexts/AuthContext";
import GoogleIcon from "@mui/icons-material/Google";
import MicrosoftIcon from "@mui/icons-material/Microsoft";
import AppleIcon from "@mui/icons-material/Apple";
import VpnKeyOutlinedIcon from "@mui/icons-material/VpnKeyOutlined";

const AUTH_SCREEN = {
  email: "email",
  otp: "otp",
  login: "login",
  register: "register",
};

export default function Authentication() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [openToast, setOpenToast] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [screen, setScreen] = useState(AUTH_SCREEN.email);
  const [verificationToken, setVerificationToken] = useState("");
  const [otpHint, setOtpHint] = useState("");
  const [accountType, setAccountType] = useState("user");

  const {
    handleRegister,
    handleLogin,
    checkAuthPreflight,
    requestAuthOtp,
    requestPasswordReset,
    verifyAuthOtp,
  } = useContext(AuthContext);

  const isEmailScreen = screen === AUTH_SCREEN.email;
  const isOtpScreen = screen === AUTH_SCREEN.otp;
  const isLoginScreen = screen === AUTH_SCREEN.login;
  const isRegisterScreen = screen === AUTH_SCREEN.register;

  const submitText = useMemo(() => {
    if (isEmailScreen) return "Continue";
    if (isOtpScreen) return "Verify code";
    if (isLoginScreen) return "Sign In";
    return "Create Account";
  }, [isEmailScreen, isOtpScreen, isLoginScreen]);

  const isSubmitDisabled = useMemo(() => {
    if (isEmailScreen) {
      return !email.trim();
    }

    if (isOtpScreen) {
      return otp.trim().length < 6;
    }

    if (isLoginScreen) {
      return !email.trim() || !password.trim();
    }

    return !name.trim() || !username.trim() || !email.trim() || !password.trim();
  }, [email, isEmailScreen, isLoginScreen, isOtpScreen, name, otp, password, username]);

  const handleEmailStep = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    const preflight = await checkAuthPreflight(normalizedEmail);

    if (preflight?.exists) {
      setScreen(AUTH_SCREEN.login);
      setUsername(preflight.usernameHint || "");
      setPassword("");
      setOtp("");
      setOtpHint("");
      setVerificationToken("");
      return;
    }

    const result = await requestAuthOtp(normalizedEmail, "auth");
    setScreen(AUTH_SCREEN.otp);
    setOtp("");
    setVerificationToken("");

    if (result?.devOtp) {
      setOtpHint(`Dev OTP: ${result.devOtp}`);
      setMessage(`OTP generated. Use code: ${result.devOtp}`);
      setOpenToast(true);
    } else {
      setOtpHint("Check your email inbox for verification code.");
      setMessage("Verification code sent to your email.");
      setOpenToast(true);
    }
  };

  const handleOtpStep = async () => {
    const verified = await verifyAuthOtp(email.trim().toLowerCase(), otp.trim(), "auth");
    setVerificationToken(verified.verificationToken || "");

    const preflight = await checkAuthPreflight(email.trim().toLowerCase());
    if (preflight.exists) {
      setScreen(AUTH_SCREEN.login);
      setUsername(preflight.usernameHint || "");
      return;
    }

    if (!username.trim()) {
      setUsername(email.split("@")[0]);
    }
    setScreen(AUTH_SCREEN.register);
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setError("Email is required to send reset link.");
      return;
    }

    setError("");
    setIsSubmitting(true);
    try {
      const result = await requestPasswordReset(email.trim().toLowerCase());
      setMessage(result?.message || "If an account exists, a password reset link has been sent to your email.");
      setOpenToast(true);
    } catch (err) {
      const msg = err?.response?.data?.message || "Unable to send reset link. Please try again.";
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAuthSubmit = async () => {
    setError("");
    setIsSubmitting(true);

    try {
      if (isEmailScreen) {
        await handleEmailStep();
        return;
      }

      if (isOtpScreen) {
        await handleOtpStep();
        return;
      }

      if (isLoginScreen) {
        await handleLogin({ email, password, username, verificationToken });
        return;
      }

      const result = await handleRegister(name, username, email, password, verificationToken, accountType);
      setMessage(result || "Account created. Please sign in.");
      setOpenToast(true);
      setScreen(AUTH_SCREEN.login);
      setPassword("");
    } catch (err) {
      const msg = err?.response?.data?.message || "Unable to continue. Please try again.";

      const normalized = String(msg || "").toLowerCase();
      const isVerificationError =
        normalized.includes("verification expired") ||
        normalized.includes("email verification required") ||
        normalized.includes("otp");

      if (isVerificationError) {
        setScreen(AUTH_SCREEN.otp);
        setVerificationToken("");
        setOtp("");
        setOtpHint("Verification expired. Please resend the code and verify again.");
      }

      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const backToEmail = () => {
    setScreen(AUTH_SCREEN.email);
    setPassword("");
    setOtp("");
    setVerificationToken("");
    setError("");
    setOtpHint("");
    setAccountType("user");
  };

  return (
    <div className="authPageRoot">
      <div className="authShell">
        <section className="authLeftPanel">
          <div className="authBrandTop">Zomeetix</div>

          <div className="authBenefitCard">
            <h2>Secure meeting authentication</h2>
            <ul>
              <li>Email-first protected sign-in flow</li>
              <li>OTP verification for new sign-ups</li>
              <li>Secure session tokens with auto logout</li>
              <li>Guided onboarding after login</li>
            </ul>
          </div>
        </section>

        <section className="authRightPanel">
          <div className="authHeaderLinks">
            <button type="button" onClick={backToEmail}>Email</button>
            <button type="button" onClick={() => setScreen(AUTH_SCREEN.otp)} disabled={!email.trim()}>Verify</button>
            <button type="button" onClick={() => setScreen(AUTH_SCREEN.login)} disabled={!email.trim()}>Login</button>
            <button type="button" onClick={() => setScreen(AUTH_SCREEN.register)} disabled={!verificationToken}>Sign Up</button>
          </div>

          <div className="authFormWrap">
            <h1>
              {isEmailScreen && "Let's Get Started"}
              {isOtpScreen && "Verify your email"}
              {isLoginScreen && "Welcome back"}
              {isRegisterScreen && "Create your account"}
            </h1>
            <p>
              {isEmailScreen && "Enter your email to receive a verification code."}
              {isOtpScreen && "Enter the 6-digit code sent to your email."}
              {isLoginScreen && "Email verified. Enter password to sign in."}
              {isRegisterScreen && "Email verified. Complete account setup."}
            </p>

            <TextField
              fullWidth
              label="Email Address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              margin="normal"
              disabled={!isEmailScreen}
            />

            {isEmailScreen ? (
              <Button
                variant="text"
                onClick={handleForgotPassword}
                disabled={!email.trim() || isSubmitting}
                sx={{ mt: 0.5 }}
              >
                Forgot password? Send reset link
              </Button>
            ) : null}

            {isOtpScreen ? (
              <>
                <TextField
                  fullWidth
                  label="Verification code"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  margin="normal"
                  inputProps={{ maxLength: 6 }}
                />
                {otpHint ? <p className="authHintText">{otpHint}</p> : null}
                <Button
                  variant="text"
                  onClick={handleEmailStep}
                  disabled={isSubmitting}
                  sx={{ mt: 0.5 }}
                >
                  Resend code
                </Button>
              </>
            ) : null}

            {isLoginScreen || isRegisterScreen ? (
              <TextField
                fullWidth
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                margin="normal"
              />
            ) : null}

            {isLoginScreen ? (
              <Button
                variant="text"
                onClick={handleForgotPassword}
                disabled={!email.trim() || isSubmitting}
                sx={{ mt: 0.5 }}
              >
                Forgot password? Email reset link
              </Button>
            ) : null}

            {isRegisterScreen ? (
              <>
                <TextField
                  fullWidth
                  label="Full Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  margin="normal"
                />
                <TextField
                  fullWidth
                  label="Username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  margin="normal"
                />
                <div style={{ marginTop: "10px" }}>
                  <p style={{ margin: "0 0 6px", fontWeight: 600 }}>Account type</p>
                  <RadioGroup
                    row
                    value={accountType}
                    onChange={(e) => setAccountType(e.target.value)}
                  >
                    <FormControlLabel value="user" control={<Radio />} label="User" />
                    <FormControlLabel value="host" control={<Radio />} label="Host" />
                  </RadioGroup>
                </div>
              </>
            ) : null}

            {error ? <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert> : null}

            <Button
              fullWidth
              variant="contained"
              className="authPrimaryBtn"
              disabled={isSubmitDisabled || isSubmitting}
              onClick={handleAuthSubmit}
              sx={{ mt: 2 }}
            >
              {isSubmitting ? <CircularProgress size={20} color="inherit" /> : submitText}
            </Button>

            {!isEmailScreen ? (
              <Button variant="text" sx={{ mt: 1 }} onClick={backToEmail}>
                Use different email
              </Button>
            ) : null}

            <p className="authTermsText">
              By proceeding, you agree to Zomeetix Privacy Statement and Terms of Service.
            </p>

            <div className="authDivider"><span>or continue with</span></div>

            <div className="authSocialGrid">
              <button type="button" className="authSocialBtn authSocialGoogle">
                <GoogleIcon fontSize="small" />
                Google
              </button>
              <button type="button" className="authSocialBtn authSocialMicrosoft">
                <MicrosoftIcon fontSize="small" />
                Microsoft
              </button>
              <button type="button" className="authSocialBtn authSocialApple">
                <AppleIcon fontSize="small" />
                Apple
              </button>
              <button type="button" className="authSocialBtn authSocialSso">
                <VpnKeyOutlinedIcon fontSize="small" />
                SSO
              </button>
            </div>
          </div>
        </section>
      </div>

      <Snackbar
        open={openToast}
        autoHideDuration={4000}
        onClose={() => setOpenToast(false)}
        message={message}
      />
    </div>
  );
}
