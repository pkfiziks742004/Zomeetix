import React, { useContext, useState } from "react";
import { Button, Snackbar, TextField } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../contexts/AuthContext";
import withAuth from "../utils/withAuth";
import "../App.css";
import AppShell from "../components/AppShell";

function JoinMeeting() {
  const navigate = useNavigate();
  const [meetingCode, setMeetingCode] = useState("");
  const [meetingPassword, setMeetingPassword] = useState("");
  const [error, setError] = useState("");
  const { addToUserHistory, validateMeetingAccess } = useContext(AuthContext);

  const handleJoinMeeting = async () => {
    const trimmedCode = meetingCode.trim();
    const trimmedPassword = meetingPassword.trim();

    if (!trimmedCode || !trimmedPassword) {
      setError("Please enter meeting code and password.");
      return;
    }

    try {
      await validateMeetingAccess(trimmedCode, trimmedPassword);
      await addToUserHistory(trimmedCode);
      navigate(`/meeting/${trimmedCode}?password=${encodeURIComponent(trimmedPassword)}`);
    } catch (e) {
      setError(e?.response?.data?.message || "Unable to join meeting right now");
    }
  };

  return (
    <AppShell>
      <div className="meetingFlowCard">
        <p className="meetingModeOverline">Participant Flow</p>
        <h2>Join a Meeting</h2>
        <p>Enter meeting details shared by host.</p>

        <div className="joinControls">
          <TextField
            value={meetingCode}
            onChange={(e) => setMeetingCode(e.target.value)}
            label="Meeting Code"
            variant="outlined"
            fullWidth
          />
          <TextField
            value={meetingPassword}
            onChange={(e) => setMeetingPassword(e.target.value)}
            label="Meeting Password"
            variant="outlined"
            fullWidth
          />
          <Button variant="contained" onClick={handleJoinMeeting}>
            Join Meeting
          </Button>
          <Button variant="text" onClick={() => navigate("/home")}>
            Back
          </Button>
        </div>
      </div>

      <Snackbar
        open={Boolean(error)}
        autoHideDuration={3000}
        onClose={() => setError("")}
        message={error}
      />
    </AppShell>
  );
}

export default withAuth(JoinMeeting);
