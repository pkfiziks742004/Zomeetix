import React, { useContext, useEffect, useMemo, useState } from "react";
import { Button, Snackbar, TextField } from "@mui/material";
import ShareOutlinedIcon from "@mui/icons-material/ShareOutlined";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../contexts/AuthContext";
import withAuth from "../utils/withAuth";
import "../App.css";
import AppShell from "../components/AppShell";

function HostMeeting() {
  const navigate = useNavigate();
  const [meetingInfo, setMeetingInfo] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [startAt, setStartAt] = useState(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 5);
    return now.toISOString().slice(0, 16);
  });
  const [durationMinutes, setDurationMinutes] = useState("60");
  const { addToUserHistory, createMeetingRoom, userData } = useContext(AuthContext);

  const lastMeetingStorageKey = useMemo(() => {
    const identity = userData?.email || userData?.username || userData?._id || "";
    if (!identity) return "";
    return `zomeetix:last_host_meeting:${identity}`;
  }, [userData?.email, userData?.username, userData?._id]);

  useEffect(() => {
    if (!lastMeetingStorageKey || userData?.role !== "host") return;
    const raw = localStorage.getItem(lastMeetingStorageKey);
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw);
      if (parsed?.meetingId && parsed?.password) {
        setMeetingInfo(parsed);
      }
    } catch {
      // Ignore malformed local cache.
    }
  }, [lastMeetingStorageKey, userData?.role]);

  if (userData?.role !== "host") {
    return (
      <AppShell>
        <div className="meetingFlowCard">
          <p className="meetingModeOverline">Host Access</p>
          <h2>Host account required</h2>
          <p>
            Hosting/scheduling meetings is available only for <strong>Host</strong> accounts.
            Please create a Host account or ask an admin to upgrade your role.
          </p>
          <div className="hostActionsBlock">
            <Button variant="contained" onClick={() => navigate("/home")}>
              Back to Home
            </Button>
          </div>
        </div>
      </AppShell>
    );
  }

  const handleCreateMeeting = async () => {
    try {
      const duration = Number(durationMinutes);
      if (!Number.isFinite(duration) || duration < 1 || duration > 720) {
        setError("Duration must be between 1 and 720 minutes.");
        return;
      }

      const meeting = await createMeetingRoom({
        startAt: startAt ? new Date(startAt).toISOString() : undefined,
        durationMinutes: duration,
      });

      const persistedMeeting = { ...meeting, persistedAt: new Date().toISOString() };
      setMeetingInfo(persistedMeeting);
      if (lastMeetingStorageKey) {
        try {
          localStorage.setItem(lastMeetingStorageKey, JSON.stringify(persistedMeeting));
        } catch {
          // Storage may be full/blocked. UI will still work for this session.
        }
      }

      await addToUserHistory(meeting.meetingId);
      setNotice("Meeting created. Use Share to send invite.");

      const startsAtMs = new Date(meeting.schedule?.startAt || Date.now()).getTime();
      if (Date.now() >= startsAtMs) {
        navigate(`/meeting/${meeting.meetingId}?password=${encodeURIComponent(meeting.password)}`);
      }
    } catch (e) {
      setError(e?.response?.data?.message || "Unable to create meeting");
    }
  };

  const formatSchedule = (isoDate) => {
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

  const getJoinLink = (meeting) => {
    if (!meeting?.meetingId) return "";
    return meeting.joinLink || `${window.location.origin}/meeting/${meeting.meetingId}`;
  };

  const getOneTapLink = (meeting) => {
    if (!meeting?.meetingId) return "";
    const password = meeting?.password ? String(meeting.password) : "";
    const base = `${window.location.origin}/meeting/${meeting.meetingId}`;
    return password ? `${base}?password=${encodeURIComponent(password)}` : base;
  };

  const buildInviteText = (meeting) => {
    const joinLink = getJoinLink(meeting);
    const oneTapLink = getOneTapLink(meeting);
    const starts = formatSchedule(meeting?.schedule?.startAt);
    const ends = formatSchedule(meeting?.schedule?.endAt);
    const duration = meeting?.schedule?.durationMinutes ?? "N/A";

    return [
      "Zomeetix Meeting Invitation",
      "",
      `Meeting ID: ${meeting?.meetingId || ""}`,
      `Password: ${meeting?.password || ""}`,
      `Starts: ${starts}`,
      `Ends: ${ends}`,
      `Duration: ${duration} min`,
      "",
      `Join link: ${joinLink}`,
      `One-tap link: ${oneTapLink}`,
      "",
      "Tip: Share the password separately for better security.",
    ].join("\n");
  };

  const copyToClipboard = async (text) => {
    if (!text) return false;

    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback for older browsers / blocked clipboard API.
      try {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "true");
        textarea.style.position = "fixed";
        textarea.style.top = "-1000px";
        textarea.style.left = "-1000px";
        document.body.appendChild(textarea);
        textarea.select();
        const ok = document.execCommand("copy");
        textarea.remove();
        return ok;
      } catch {
        return false;
      }
    }
  };

  const onCopyLink = async () => {
    const ok = await copyToClipboard(getJoinLink(meetingInfo));
    setNotice(ok ? "Link copied to clipboard." : "Unable to copy link.");
  };

  const onCopyInvite = async () => {
    const ok = await copyToClipboard(buildInviteText(meetingInfo));
    setNotice(ok ? "Invite copied to clipboard." : "Unable to copy invite.");
  };

  const onShareInvite = async () => {
    const oneTapLink = getOneTapLink(meetingInfo);
    const inviteText = buildInviteText(meetingInfo);

    if (navigator.share) {
      try {
        await navigator.share({
          title: "Zomeetix meeting invite",
          text: inviteText,
          url: oneTapLink || undefined,
        });
        setNotice("Share opened.");
        return;
      } catch {
        // If user cancels share, no need to show error.
      }
    }

    const ok = await copyToClipboard(inviteText);
    setNotice(ok ? "Invite copied (share not supported)." : "Unable to share invite.");
  };

  const clearSavedMeeting = () => {
    if (lastMeetingStorageKey) {
      localStorage.removeItem(lastMeetingStorageKey);
    }
    setMeetingInfo(null);
    setNotice("Saved meeting cleared.");
  };

  return (
    <AppShell>
      <div className="meetingFlowCard">
        <p className="meetingModeOverline">Organizer Flow</p>
        <h2>Host a Meeting</h2>
        <p>Create a secure scheduled meeting with start time and duration.</p>

        <div className="hostScheduleGrid">
          <TextField
            label="Start Time"
            type="datetime-local"
            size="small"
            value={startAt}
            onChange={(e) => setStartAt(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="Duration (minutes)"
            type="number"
            size="small"
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(e.target.value)}
            inputProps={{ min: 1, max: 720 }}
          />
        </div>

        <div className="hostActionsBlock">
          <Button variant="contained" onClick={handleCreateMeeting}>
            Create Scheduled Meeting
          </Button>
          <Button variant="outlined" onClick={() => navigate("/host/scheduled")}>
            Manage Scheduled
          </Button>
          <Button variant="text" onClick={() => navigate("/home")}>
            Back
          </Button>
        </div>

        {meetingInfo ? (
          <div className="meetingInfoCard">
            <p className="meetingModeOverline" style={{ marginBottom: 6 }}>
              Share
              {meetingInfo.persistedAt ? (
                <span style={{ marginLeft: 8, fontSize: "0.78rem", color: "var(--z-muted)" }}>
                  Saved
                </span>
              ) : null}
            </p>
            <p>
              Meeting ID: <strong>{meetingInfo.meetingId}</strong>
            </p>
            <p>
              Password: <strong>{meetingInfo.password}</strong>
            </p>
            <p>
              Starts: <strong>{formatSchedule(meetingInfo.schedule?.startAt)}</strong>
            </p>
            <p>
              Ends: <strong>{formatSchedule(meetingInfo.schedule?.endAt)}</strong>
            </p>
            <p>
              Duration: <strong>{meetingInfo.schedule?.durationMinutes || "N/A"} min</strong>
            </p>
            <p style={{ wordBreak: "break-word" }}>
              Join link:{" "}
              <a
                href={getJoinLink(meetingInfo)}
                target="_blank"
                rel="noreferrer"
                style={{ color: "inherit" }}
              >
                {getJoinLink(meetingInfo)}
              </a>
            </p>

            <div className="hostActionsBlock">
              <Button variant="outlined" startIcon={<ContentCopyOutlinedIcon />} onClick={onCopyLink}>
                Copy link
              </Button>
              <Button variant="outlined" startIcon={<ContentCopyOutlinedIcon />} onClick={onCopyInvite}>
                Copy invite
              </Button>
              <Button variant="contained" startIcon={<ShareOutlinedIcon />} onClick={onShareInvite}>
                Share
              </Button>
              <Button variant="text" onClick={clearSavedMeeting}>
                Clear
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <Snackbar
        open={Boolean(error)}
        autoHideDuration={3000}
        onClose={() => setError("")}
        message={error}
      />
      <Snackbar
        open={Boolean(notice)}
        autoHideDuration={2500}
        onClose={() => setNotice("")}
        message={notice}
      />
    </AppShell>
  );
}

export default withAuth(HostMeeting);
