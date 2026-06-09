import React, { useCallback, useContext, useEffect, useRef, useState } from "react";
import { Button, Snackbar, TextField } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../contexts/AuthContext";
import withAuth from "../utils/withAuth";
import "../App.css";
import AppShell from "../components/AppShell";

function ScheduledMeetings() {
  const navigate = useNavigate();
  const [meetings, setMeetings] = useState([]);
  const [editMeetingId, setEditMeetingId] = useState("");
  const [editStartAt, setEditStartAt] = useState("");
  const [editDuration, setEditDuration] = useState("60");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const notifiedMeetingsRef = useRef(new Set());

  const { getScheduledHostMeetings, rescheduleHostMeeting, cancelHostMeeting, startHostMeeting, userData } =
    useContext(AuthContext);

  const isHost = userData?.role === "host";

  const loadMeetings = useCallback(async () => {
    try {
      if (!isHost) return;
      const data = await getScheduledHostMeetings();
      setMeetings(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e?.response?.data?.message || "Unable to load scheduled meetings.");
    }
  }, [getScheduledHostMeetings, isHost]);

  useEffect(() => {
    if (!isHost) {
      return undefined;
    }
    let intervalId = null;

    const stopPolling = () => {
      if (!intervalId) return;
      clearInterval(intervalId);
      intervalId = null;
    };

    const startPolling = () => {
      stopPolling();
      loadMeetings();
      intervalId = setInterval(loadMeetings, 30 * 1000);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        stopPolling();
        return;
      }
      if (!intervalId) {
        startPolling();
      }
    };

    startPolling();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isHost, loadMeetings]);

  useEffect(() => {
    if (!isHost) return;
    const now = Date.now();
    meetings.forEach((meeting) => {
      const meetingId = meeting.meetingId;
      const reminderAt = new Date(meeting.schedule?.reminderAt || 0).getTime();
      const startAt = new Date(meeting.schedule?.startAt || 0).getTime();
      if (!meetingId || Number.isNaN(reminderAt) || Number.isNaN(startAt)) return;
      if (now >= reminderAt && now < startAt && !notifiedMeetingsRef.current.has(meetingId)) {
        notifiedMeetingsRef.current.add(meetingId);
        setMessage(`Reminder: Meeting ${meetingId} starts in less than 10 minutes.`);
      }
    });
  }, [isHost, meetings]);

  const formatDateTime = (isoDate) => {
    if (!isoDate) return "N/A";
    const date = new Date(isoDate);
    if (Number.isNaN(date.getTime())) return "N/A";
    return date.toLocaleString([], {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const beginEdit = (meeting) => {
    setEditMeetingId(meeting.meetingId);
    setEditStartAt(new Date(meeting.schedule?.startAt || Date.now()).toISOString().slice(0, 16));
    setEditDuration(String(meeting.schedule?.durationMinutes || 60));
  };

  const handleReschedule = async (meetingId) => {
    try {
      await rescheduleHostMeeting(meetingId, {
        startAt: new Date(editStartAt).toISOString(),
        durationMinutes: Number(editDuration),
      });
      setMessage("Meeting rescheduled.");
      setEditMeetingId("");
      await loadMeetings();
    } catch (e) {
      setError(e?.response?.data?.message || "Unable to reschedule meeting.");
    }
  };

  if (!isHost) {
    return (
      <AppShell>
        <div className="meetingFlowCard meetingFlowCardWideLayout">
          <p className="meetingModeOverline">Host Access</p>
          <h2>Host account required</h2>
          <p>Only Host accounts can manage scheduled meetings.</p>
          <div className="hostActionsBlock">
            <Button variant="contained" onClick={() => navigate("/home")}>
              Back to Home
            </Button>
          </div>
        </div>
      </AppShell>
    );
  }

  const handleCancel = async (meetingId) => {
    const shouldCancel = window.confirm("Cancel this meeting?");
    if (!shouldCancel) return;

    try {
      await cancelHostMeeting(meetingId);
      setMessage("Meeting cancelled.");
      await loadMeetings();
    } catch (e) {
      setError(e?.response?.data?.message || "Unable to cancel meeting.");
    }
  };

  const handleStartNow = async (meeting) => {
    try {
      await startHostMeeting(meeting.meetingId);
      setMessage(`Meeting ${meeting.meetingId} started.`);
      await loadMeetings();
      navigate(`/meeting/${meeting.meetingId}`);
    } catch (e) {
      setError(e?.response?.data?.message || "Unable to start meeting.");
    }
  };

  const handleShareInvite = async (meeting) => {
    const inviteText = `Meeting ID: ${meeting.meetingId}\nJoin Link: ${meeting.joinLink}\nStart: ${formatDateTime(
      meeting.schedule?.startAt
    )}\nNote: Share meeting password separately for security.`;

    try {
      await navigator.clipboard.writeText(inviteText);
      setMessage("Invite copied. Share password separately.");
    } catch (e) {
      setError("Unable to copy invite.");
    }
  };

  return (
    <AppShell>
      <div className="meetingFlowCard meetingFlowCardWideLayout">
        <p className="meetingModeOverline">Host Control</p>
        <h2>Scheduled Meetings</h2>
        <p>Manage upcoming meetings: reschedule or cancel.</p>

        <div className="hostActionsBlock">
          <Button variant="text" onClick={() => navigate("/host")}>
            Back to Host
          </Button>
          <Button variant="outlined" onClick={loadMeetings}>
            Refresh
          </Button>
        </div>

        {meetings.length === 0 ? (
          <p>No scheduled meetings found.</p>
        ) : (
          <div className="recentMeetingList">
            {meetings.map((meeting) => (
              <div key={meeting.meetingId} className="scheduledMeetingCard">
                <div className="recentMeetingMeta">
                  <span>{meeting.meetingId}</span>
                  <small>Starts: {formatDateTime(meeting.schedule?.startAt)}</small>
                  <small>Ends: {formatDateTime(meeting.schedule?.endAt)}</small>
                  <small>Duration: {meeting.schedule?.durationMinutes || "N/A"} min</small>
                  <small>Reminder at: {formatDateTime(meeting.schedule?.reminderAt)}</small>
                  <small>Reminder sent: {meeting.reminderSentAt ? formatDateTime(meeting.reminderSentAt) : "Pending"}</small>
                  <small>Status: {meeting.status}</small>
                </div>

                {editMeetingId === meeting.meetingId ? (
                  <div className="hostScheduleGrid">
                    <TextField
                      type="datetime-local"
                      size="small"
                      value={editStartAt}
                      onChange={(e) => setEditStartAt(e.target.value)}
                      InputLabelProps={{ shrink: true }}
                    />
                    <TextField
                      type="number"
                      size="small"
                      value={editDuration}
                      onChange={(e) => setEditDuration(e.target.value)}
                    />
                    <Button variant="contained" onClick={() => handleReschedule(meeting.meetingId)}>
                      Save
                    </Button>
                    <Button variant="text" onClick={() => setEditMeetingId("")}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <div className="recentMeetingActions">
                    <Button size="small" variant="contained" onClick={() => handleStartNow(meeting)}>
                      Start Now
                    </Button>
                    <Button size="small" variant="outlined" onClick={() => handleShareInvite(meeting)}>
                      Share
                    </Button>
                    <Button size="small" variant="outlined" onClick={() => beginEdit(meeting)}>
                      Reschedule
                    </Button>
                    <Button size="small" color="error" variant="outlined" onClick={() => handleCancel(meeting.meetingId)}>
                      Cancel Meeting
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <Snackbar
        open={Boolean(error)}
        autoHideDuration={3000}
        onClose={() => setError("")}
        message={error}
      />
      <Snackbar
        open={Boolean(message)}
        autoHideDuration={2500}
        onClose={() => setMessage("")}
        message={message}
      />
    </AppShell>
  );
}

export default withAuth(ScheduledMeetings);
