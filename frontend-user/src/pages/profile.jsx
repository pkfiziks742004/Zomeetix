import React, { useContext, useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, Chip, CircularProgress, Divider, Snackbar, TextField, Typography } from "@mui/material";
import withAuth from "../utils/withAuth";
import { AuthContext } from "../contexts/AuthContext";
import AppShell from "../components/AppShell";

const formatTimestamp = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString([], {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

function ProfilePage() {
  const { getMe, updateMe, userData } = useContext(AuthContext);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const [accountMeta, setAccountMeta] = useState(null);

  const [name, setName] = useState(userData?.name || "");
  const [displayName, setDisplayName] = useState(localStorage.getItem("meeting_display_name") || "");
  const [organization, setOrganization] = useState(localStorage.getItem("org_name") || "");
  const [workRole, setWorkRole] = useState(localStorage.getItem("work_role") || "");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [bio, setBio] = useState("");

  const isHost = accountMeta?.role === "host" || userData?.role === "host";

  const canSave = useMemo(() => {
    if (saving) return false;
    if (name.trim().length < 2) return false;
    if (bio.length > 280) return false;
    return true;
  }, [bio.length, name, saving]);

  const loadProfile = async () => {
    setError("");
    setLoading(true);
    try {
      const data = await getMe();
      const nextUser = data?.user || null;
      const nextProfile = data?.profile || null;

      if (nextUser) {
        setAccountMeta(nextUser);
        setName(nextUser.name || "");
      }

      if (nextProfile) {
        setDisplayName(nextProfile.displayName ?? "");
        setOrganization(nextProfile.organization ?? "");
        setWorkRole(nextProfile.workRole ?? "");
        setPhone(nextProfile.phone ?? "");
        setLocation(nextProfile.location ?? "");
        setBio(nextProfile.bio ?? "");
      }
    } catch (err) {
      setError(err?.response?.data?.message || "Unable to load profile details.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setError("");

    try {
      const result = await updateMe({
        name: name.trim(),
        displayName: displayName.trim(),
        organization: organization.trim(),
        workRole: workRole.trim(),
        phone: phone.trim(),
        location: location.trim(),
        bio: bio.trim(),
      });

      const nextUser = result?.user || null;
      if (nextUser) {
        setAccountMeta(nextUser);
        setName(nextUser.name || "");
      }

      const nextProfile = result?.profile || null;
      if (nextProfile) {
        setDisplayName(nextProfile.displayName ?? "");
        setOrganization(nextProfile.organization ?? "");
        setWorkRole(nextProfile.workRole ?? "");
        setPhone(nextProfile.phone ?? "");
        setLocation(nextProfile.location ?? "");
        setBio(nextProfile.bio ?? "");
      }

      setToast("Profile updated.");
    } catch (err) {
      setError(err?.response?.data?.message || "Unable to update profile. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell>
      <div className="meetingFlowCard meetingFlowCardWideLayout profileCard">
        <p className="meetingModeOverline">Account</p>
        <h2>Your Profile</h2>
        <p>Update the details used for meetings, invites, and dashboard personalization.</p>

        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mt: 1.5, alignItems: "center" }}>
          <Chip size="small" label={isHost ? "Host account" : "User account"} />
          <Chip size="small" label={`Email: ${accountMeta?.email || userData?.email || "—"}`} />
          <Chip size="small" label={`Username: ${accountMeta?.username || userData?.username || "—"}`} />
        </Box>

        {accountMeta ? (
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mt: 1 }}>
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              Created: {formatTimestamp(accountMeta.createdAt)}
            </Typography>
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              Last login: {formatTimestamp(accountMeta.lastLoginAt)}
            </Typography>
          </Box>
        ) : null}

        <Divider sx={{ my: 2 }} />

        {loading ? (
          <Box sx={{ display: "grid", placeItems: "center", py: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <div className="profileGrid">
            <div className="profileSection">
              <h3>Basic</h3>
              <TextField
                fullWidth
                label="Full name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                margin="normal"
                helperText="Shown in your account and admin views."
              />
              <TextField
                fullWidth
                label="Display name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                margin="normal"
                helperText="Used inside meetings and chat."
              />
              <TextField
                fullWidth
                label="Organization"
                value={organization}
                onChange={(event) => setOrganization(event.target.value)}
                margin="normal"
              />
              <TextField
                fullWidth
                label="Role / Title"
                value={workRole}
                onChange={(event) => setWorkRole(event.target.value)}
                margin="normal"
              />
            </div>

            <div className="profileSection">
              <h3>Contact</h3>
              <TextField
                fullWidth
                label="Phone"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                margin="normal"
              />
              <TextField
                fullWidth
                label="Location"
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                margin="normal"
              />
              <TextField
                fullWidth
                label="Bio"
                value={bio}
                onChange={(event) => setBio(event.target.value.slice(0, 280))}
                margin="normal"
                multiline
                minRows={4}
                helperText={`${bio.length}/280`}
              />
            </div>
          </div>
        )}

        {error ? (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        ) : null}

        <div className="profileActions">
          <Button variant="outlined" onClick={loadProfile} disabled={loading || saving}>
            Refresh
          </Button>
          <Button variant="contained" onClick={handleSave} disabled={!canSave}>
            {saving ? "Saving..." : "Save changes"}
          </Button>
        </div>
      </div>

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={2500}
        onClose={() => setToast("")}
        message={toast}
      />
    </AppShell>
  );
}

export default withAuth(ProfilePage);

