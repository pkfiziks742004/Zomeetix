import React, { useContext, useEffect, useMemo, useState } from "react";
import { Button, Snackbar, TextField } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../contexts/AuthContext";
import withAuth from "../utils/withAuth";
import "../App.css";

function HostRecordings() {
  const navigate = useNavigate();
  const query = new URLSearchParams(window.location.search);
  const [meetingId, setMeetingId] = useState(query.get("meetingId") || "");
  const [recordings, setRecordings] = useState([]);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewName, setPreviewName] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const [limit] = useState(8);
  const [pagination, setPagination] = useState({
    page: 1,
    totalPages: 1,
    total: 0,
    hasNext: false,
    hasPrev: false,
  });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const { getMeetingRecordings, deleteMeetingRecording, downloadMeetingRecording } = useContext(AuthContext);

  const canLoad = useMemo(() => Boolean(meetingId.trim()), [meetingId]);

  const formatBytes = (bytes) => {
    const size = Number(bytes || 0);
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDuration = (seconds) => {
    const sec = Number(seconds || 0);
    if (!sec) return "N/A";
    const mins = Math.floor(sec / 60)
      .toString()
      .padStart(2, "0");
    const rem = Math.floor(sec % 60)
      .toString()
      .padStart(2, "0");
    return `${mins}:${rem}`;
  };

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

  const loadRecordings = async (
    nextPage = page,
    nextFilters = { fromDate, toDate }
  ) => {
    if (!canLoad) {
      setError("Please enter meeting ID.");
      return;
    }

    try {
      const data = await getMeetingRecordings(meetingId.trim(), {
        page: nextPage,
        limit,
        from: nextFilters.fromDate || undefined,
        to: nextFilters.toDate || undefined,
      });

      const items = Array.isArray(data) ? data : data?.items || [];
      const pageInfo = data?.pagination || {
        page: 1,
        totalPages: 1,
        total: items.length,
        hasNext: false,
        hasPrev: false,
      };

      setRecordings(items);
      setPagination(pageInfo);
      setPage(pageInfo.page || nextPage);

      if (items.length === 0) {
        setMessage("No recordings found for this meeting.");
      }
    } catch (e) {
      setError(e?.response?.data?.message || "Unable to load recordings.");
      setRecordings([]);
      setPagination({
        page: 1,
        totalPages: 1,
        total: 0,
        hasNext: false,
        hasPrev: false,
      });
    }
  };

  useEffect(() => {
    if (query.get("meetingId")) {
      loadRecordings();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const downloadRecording = async (recording) => {
    try {
      const blob = await downloadMeetingRecording(meetingId.trim(), recording.id);
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = recording.fileName || `${recording.id}.webm`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (e) {
      setError(e?.response?.data?.message || "Unable to download recording.");
    }
  };

  const previewRecording = async (recording) => {
    try {
      const blob = await downloadMeetingRecording(meetingId.trim(), recording.id);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      const blobUrl = URL.createObjectURL(blob);
      setPreviewUrl(blobUrl);
      setPreviewName(recording.fileName || "Recording");
    } catch (e) {
      setError(e?.response?.data?.message || "Unable to preview recording.");
    }
  };

  const handleDeleteRecording = async (recording) => {
    const confirmed = window.confirm(`Delete recording "${recording.fileName}"?`);
    if (!confirmed) {
      return;
    }

    try {
      await deleteMeetingRecording(meetingId.trim(), recording.id);
      setMessage("Recording deleted.");

      const shouldGoPreviousPage = recordings.length === 1 && page > 1;
      const nextPage = shouldGoPreviousPage ? page - 1 : page;
      await loadRecordings(nextPage);
    } catch (e) {
      setError(e?.response?.data?.message || "Unable to delete recording.");
    }
  };

  return (
    <div className="meetingFlowPage">
      <div className="meetingFlowCard meetingFlowCardWideLayout">
        <p className="meetingModeOverline">Host Control</p>
        <h2>Meeting Recordings</h2>
        <p>Load recordings by meeting ID, then preview or download securely.</p>

        <div className="hostScheduleGrid">
          <TextField
            size="small"
            label="Meeting ID"
            value={meetingId}
            onChange={(e) => setMeetingId(e.target.value)}
          />
          <TextField
            size="small"
            type="date"
            label="From Date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            size="small"
            type="date"
            label="To Date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <div className="recentMeetingActions">
            <Button
              variant="contained"
              onClick={() => {
                setPage(1);
                loadRecordings(1, { fromDate, toDate });
              }}
            >
              Load
            </Button>
            <Button
              variant="outlined"
              onClick={() => {
                setFromDate("");
                setToDate("");
                setPage(1);
                loadRecordings(1, { fromDate: "", toDate: "" });
              }}
            >
              Clear Filter
            </Button>
            <Button variant="text" onClick={() => navigate("/host")}>
              Back
            </Button>
          </div>
        </div>

        {previewUrl ? (
          <div className="meetingInfoCard">
            <p>
              Preview: <strong>{previewName}</strong>
            </p>
            <video controls style={{ width: "100%", borderRadius: "10px" }} src={previewUrl} />
          </div>
        ) : null}

        {recordings.length === 0 ? (
          <p>No recordings loaded.</p>
        ) : (
          <div className="recentMeetingList">
            {recordings.map((recording) => (
              <div key={recording.id} className="scheduledMeetingCard">
                <div className="recentMeetingMeta">
                  <span>{recording.fileName}</span>
                  <small>Created: {formatDateTime(recording.createdAt)}</small>
                  <small>Duration: {formatDuration(recording.durationSeconds)}</small>
                  <small>Size: {formatBytes(recording.sizeBytes)}</small>
                </div>
                <div className="recentMeetingActions">
                  <Button size="small" variant="outlined" onClick={() => previewRecording(recording)}>
                    Preview
                  </Button>
                  <Button size="small" variant="contained" onClick={() => downloadRecording(recording)}>
                    Download
                  </Button>
                  <Button size="small" color="error" variant="outlined" onClick={() => handleDeleteRecording(recording)}>
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="recentMeetingActions" style={{ marginTop: "12px", justifyContent: "space-between" }}>
          <small>
            Page {pagination.page} / {pagination.totalPages} | Total: {pagination.total}
          </small>
          <div className="recentMeetingActions">
            <Button
              size="small"
              variant="outlined"
              disabled={!pagination.hasPrev}
              onClick={() => loadRecordings(page - 1)}
            >
              Prev
            </Button>
            <Button
              size="small"
              variant="outlined"
              disabled={!pagination.hasNext}
              onClick={() => loadRecordings(page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
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
    </div>
  );
}

export default withAuth(HostRecordings);
