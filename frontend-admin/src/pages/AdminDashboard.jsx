import React, { useContext, useEffect, useMemo, useState } from "react";
import { Alert, Button, MenuItem, Select, Snackbar, TextField } from "@mui/material";
import SpaceDashboardOutlinedIcon from "@mui/icons-material/SpaceDashboardOutlined";
import GroupOutlinedIcon from "@mui/icons-material/GroupOutlined";
import VideoCallOutlinedIcon from "@mui/icons-material/VideoCallOutlined";
import PolicyOutlinedIcon from "@mui/icons-material/PolicyOutlined";
import FactCheckOutlinedIcon from "@mui/icons-material/FactCheckOutlined";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import LogoutOutlinedIcon from "@mui/icons-material/LogoutOutlined";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import AdminPanelSettingsOutlinedIcon from "@mui/icons-material/AdminPanelSettingsOutlined";
import SecurityOutlinedIcon from "@mui/icons-material/SecurityOutlined";
import BuildCircleOutlinedIcon from "@mui/icons-material/BuildCircleOutlined";
import withAdminAuth from "../utils/withAdminAuth";
import { AdminAuthContext } from "../contexts/AdminAuthContext";
import "../App.css";

const SECTION_TABS = ["overview", "users", "meetings", "policies", "security", "maintenance", "audit"];
const TAB_ICONS = {
  overview: <SpaceDashboardOutlinedIcon fontSize="small" />,
  users: <GroupOutlinedIcon fontSize="small" />,
  meetings: <VideoCallOutlinedIcon fontSize="small" />,
  policies: <PolicyOutlinedIcon fontSize="small" />,
  security: <SecurityOutlinedIcon fontSize="small" />,
  maintenance: <BuildCircleOutlinedIcon fontSize="small" />,
  audit: <FactCheckOutlinedIcon fontSize="small" />,
};

function AdminDashboard() {
  const [activeTab, setActiveTab] = useState("overview");
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [policies, setPolicies] = useState({
    allowGuestJoin: true,
    enforceWaitingRoom: false,
    maxMeetingDurationMinutes: 120,
    requireStrongMeetingPassword: true,
  });
  const [filters, setFilters] = useState({
    usersQuery: "",
    meetingsQuery: "",
    auditAction: "",
  });
  const [loading, setLoading] = useState(false);
  const [securitySummary, setSecuritySummary] = useState(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const {
    adminUser,
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
  } = useContext(AdminAuthContext);

  const loadAll = async () => {
    try {
      setLoading(true);
      const [
        overviewData,
        usersData,
        meetingsData,
        policiesData,
        logsData,
        securityData,
      ] =
        await Promise.all([
          getAdminOverview(),
          listUsers({ limit: 10 }),
          listMeetings({ limit: 10 }),
          getPolicies(),
          listAuditLogs({ limit: 15 }),
          getSecuritySummary(),
        ]);

      setOverview(overviewData?.metrics || null);
      setUsers(usersData?.items || []);
      setMeetings(meetingsData?.items || []);
      setPolicies((prev) => ({
        ...prev,
        allowGuestJoin: policiesData?.allowGuestJoin ?? prev.allowGuestJoin,
        enforceWaitingRoom: policiesData?.enforceWaitingRoom ?? prev.enforceWaitingRoom,
        maxMeetingDurationMinutes:
          policiesData?.maxMeetingDurationMinutes ?? prev.maxMeetingDurationMinutes,
        requireStrongMeetingPassword:
          policiesData?.requireStrongMeetingPassword ?? prev.requireStrongMeetingPassword,
      }));
      setAuditLogs(logsData?.items || []);
      setSecuritySummary(securityData || null);
    } catch (e) {
      setError(e?.response?.data?.message || "Unable to load admin dashboard.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const metrics = useMemo(
    () => ({
      totalUsers: overview?.totalUsers ?? 0,
      activeUsers: overview?.activeUsers ?? 0,
      adminUsers: overview?.adminUsers ?? 0,
      scheduledMeetings: overview?.scheduledMeetings ?? 0,
      activeMeetings: overview?.activeMeetings ?? 0,
      historyEventsLast24h: overview?.historyEventsLast24h ?? 0,
    }),
    [overview]
  );

  const runUserSearch = async () => {
    try {
      const data = await listUsers({ q: filters.usersQuery.trim(), limit: 20 });
      setUsers(data?.items || []);
    } catch (e) {
      setError(e?.response?.data?.message || "Unable to load users.");
    }
  };

  const runMeetingsSearch = async () => {
    try {
      const data = await listMeetings({ q: filters.meetingsQuery.trim(), limit: 20 });
      setMeetings(data?.items || []);
    } catch (e) {
      setError(e?.response?.data?.message || "Unable to load meetings.");
    }
  };

  const runAuditSearch = async () => {
    try {
      const data = await listAuditLogs({ action: filters.auditAction.trim(), limit: 30 });
      setAuditLogs(data?.items || []);
    } catch (e) {
      setError(e?.response?.data?.message || "Unable to load audit logs.");
    }
  };

  const refreshSecuritySummary = async () => {
    try {
      const data = await getSecuritySummary();
      setSecuritySummary(data || null);
    } catch (e) {
      setError(e?.response?.data?.message || "Unable to refresh security summary.");
    }
  };

  const onRoleChange = async (userId, role) => {
    try {
      await updateUserRole(userId, role);
      setInfo("User role updated.");
      await runUserSearch();
      await runAuditSearch();
    } catch (e) {
      setError(e?.response?.data?.message || "Unable to update role.");
    }
  };

  const onStatusToggle = async (userId, isActive) => {
    try {
      await updateUserStatus(userId, isActive);
      setInfo("User status updated.");
      await runUserSearch();
      await runAuditSearch();
    } catch (e) {
      setError(e?.response?.data?.message || "Unable to update status.");
    }
  };

  const onRevokeSession = async (userId) => {
    try {
      await revokeUserSession(userId);
      setInfo("User session revoked.");
      await runAuditSearch();
    } catch (e) {
      setError(e?.response?.data?.message || "Unable to revoke session.");
    }
  };

  const onCancelMeeting = async (meetingId) => {
    if (!window.confirm(`Cancel meeting ${meetingId}?`)) return;
    try {
      await cancelMeetingByAdmin(meetingId);
      setInfo("Meeting cancelled.");
      await runMeetingsSearch();
      await loadAll();
    } catch (e) {
      setError(e?.response?.data?.message || "Unable to cancel meeting.");
    }
  };

  const onCancelAllActiveMeetings = async () => {
    if (!window.confirm("Cancel ALL active meetings right now?")) return;
    try {
      const result = await cancelAllActiveMeetings();
      setInfo(`Active meetings cancelled: ${result.cancelledCount || 0}`);
      await runMeetingsSearch();
      await loadAll();
    } catch (e) {
      setError(e?.response?.data?.message || "Unable to cancel active meetings.");
    }
  };

  const savePolicies = async () => {
    try {
      await updatePolicies(policies);
      setInfo("Security policies updated.");
      await runAuditSearch();
    } catch (e) {
      setError(e?.response?.data?.message || "Unable to update policies.");
    }
  };

  const formatDate = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "N/A";
    return date.toLocaleString();
  };

  const getMeetingState = (meeting) => {
    const now = Date.now();
    const start = new Date(meeting?.schedule?.startAt || 0).getTime();
    const end = new Date(meeting?.schedule?.endAt || 0).getTime();
    if (!meeting?.isActive) return "inactive";
    if (now < start) return "upcoming";
    if (now >= start && now <= end) return "live";
    return "expired";
  };

  return (
    <div className="adminDashboardPage adminShell">
      <aside className="adminSidebar">
        <div className="adminSidebarBrand">
          <AdminPanelSettingsOutlinedIcon />
          <div>
            <h3>Zomeetix</h3>
            <p>Control Center</p>
          </div>
        </div>

        <nav className="adminSidebarNav">
          {SECTION_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              className={`adminNavBtn ${activeTab === tab ? "adminNavBtnActive" : ""}`}
              onClick={() => setActiveTab(tab)}
            >
              {TAB_ICONS[tab]}
              <span>{tab}</span>
            </button>
          ))}
        </nav>

        <div className="adminSidebarSecurity">
          <ShieldOutlinedIcon fontSize="small" />
          <p>Security Mode: Enforced</p>
          <small>Role-based access, audit log tracking, admin-only API scope.</small>
        </div>
      </aside>

      <main className="adminMain">
        <header className="adminTopbar">
          <div>
            <p className="adminOverline">Enterprise Operations</p>
            <h2>Zomeetix Admin Workspace</h2>
            <small>
              {adminUser?.name || adminUser?.username || adminUser?.email} | Role:{" "}
              {adminUser?.role || "admin"}
            </small>
          </div>
          <div className="adminTopActions">
            <Button variant="outlined" startIcon={<RefreshOutlinedIcon />} onClick={loadAll} disabled={loading}>
              {loading ? "Refreshing..." : "Refresh"}
            </Button>
            <Button variant="outlined" color="error" startIcon={<LogoutOutlinedIcon />} onClick={logoutAdmin}>
              Logout
            </Button>
          </div>
        </header>

        {activeTab === "overview" ? (
          <>
            <section className="adminStatGrid">
              <article className="adminStatCard"><h3>{metrics.totalUsers}</h3><p>Total Users</p></article>
              <article className="adminStatCard"><h3>{metrics.activeUsers}</h3><p>Active Users</p></article>
              <article className="adminStatCard"><h3>{metrics.adminUsers}</h3><p>Admin Users</p></article>
              <article className="adminStatCard"><h3>{metrics.scheduledMeetings}</h3><p>Scheduled Meetings</p></article>
              <article className="adminStatCard"><h3>{metrics.activeMeetings}</h3><p>Active Meetings</p></article>
              <article className="adminStatCard"><h3>{metrics.historyEventsLast24h}</h3><p>History (24h)</p></article>
            </section>

            <section className="adminPanelGrid">
              <div className="adminBox">
                <div className="adminSectionHeader">
                  <h4>Meeting Operations</h4>
                  <Button variant="text" onClick={() => setActiveTab("meetings")}>Open Meetings</Button>
                </div>
                <div className="adminList">
                  {meetings.slice(0, 6).map((meeting) => (
                    <div className="adminListRow" key={meeting.id}>
                      <div>
                        <strong>{meeting.meetingId}</strong>
                        <p>{meeting.hostEmail}</p>
                      </div>
                      <span className={`statusBadge status-${getMeetingState(meeting)}`}>
                        {getMeetingState(meeting)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="adminBox">
                <div className="adminSectionHeader">
                  <h4>Security Posture</h4>
                  <Button variant="text" onClick={() => setActiveTab("policies")}>Edit Policies</Button>
                </div>
                <div className="adminSecurityList">
                  <p>Guest Join: <strong>{policies.allowGuestJoin ? "Allowed" : "Blocked"}</strong></p>
                  <p>Waiting Room: <strong>{policies.enforceWaitingRoom ? "Forced" : "Host Controlled"}</strong></p>
                  <p>Max Duration: <strong>{policies.maxMeetingDurationMinutes} mins</strong></p>
                  <p>Password Policy: <strong>{policies.requireStrongMeetingPassword ? "Strong" : "Basic"}</strong></p>
                </div>
              </div>
            </section>
          </>
        ) : null}

        {activeTab === "users" ? (
          <section className="adminBox">
            <div className="adminSectionHeader">
              <h4>User Management</h4>
              <div className="adminInlineControls">
                <TextField
                  size="small"
                  label="Search users"
                  value={filters.usersQuery}
                  onChange={(e) => setFilters((prev) => ({ ...prev, usersQuery: e.target.value }))}
                />
                <Button variant="contained" onClick={runUserSearch}>Search</Button>
              </div>
            </div>

            <div className="adminTable">
              <div className="adminTableRow adminTableHead">
                <span>Name</span><span>Email</span><span>Role</span><span>Status</span><span>Actions</span>
              </div>
              {users.map((user) => (
                <div className="adminTableRow" key={user._id}>
                  <span>{user.name}</span>
                  <span>{user.email}</span>
                  <span>{user.role}</span>
                  <span>{user.isActive ? "active" : "disabled"}</span>
                  <span className="adminRowActions">
                    <Select
                      size="small"
                      value={user.role}
                      onChange={(e) => onRoleChange(user._id, e.target.value)}
                    >
                      <MenuItem value="user">user</MenuItem>
                      <MenuItem value="host">host</MenuItem>
                      <MenuItem value="admin">admin</MenuItem>
                    </Select>
                  <Button
                    size="small"
                    variant="outlined"
                    color={user.isActive ? "warning" : "success"}
                    onClick={() => onStatusToggle(user._id, !user.isActive)}
                  >
                    {user.isActive ? "Disable" : "Enable"}
                  </Button>
                  <Button size="small" variant="outlined" onClick={() => onRevokeSession(user._id)}>
                    Revoke Session
                  </Button>
                </span>
              </div>
            ))}
            </div>
          </section>
        ) : null}

        {activeTab === "meetings" ? (
          <section className="adminBox">
            <div className="adminSectionHeader">
              <h4>Meeting Governance</h4>
              <div className="adminInlineControls">
                <TextField
                  size="small"
                  label="Search meetings"
                  value={filters.meetingsQuery}
                  onChange={(e) => setFilters((prev) => ({ ...prev, meetingsQuery: e.target.value }))}
                />
                <Button variant="contained" onClick={runMeetingsSearch}>Search</Button>
              </div>
            </div>
            <div className="adminTable">
              <div className="adminTableRow adminTableHead">
                <span>Meeting ID</span><span>Host</span><span>Start</span><span>Status</span><span>Actions</span>
              </div>
              {meetings.map((meeting) => (
                <div className="adminTableRow" key={meeting.id}>
                  <span>{meeting.meetingId}</span>
                  <span>{meeting.hostEmail}</span>
                  <span>{formatDate(meeting?.schedule?.startAt)}</span>
                  <span>{getMeetingState(meeting)}</span>
                  <span className="adminRowActions">
                    <Button size="small" variant="outlined" color="error" onClick={() => onCancelMeeting(meeting.meetingId)}>
                      Cancel
                    </Button>
                  </span>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {activeTab === "policies" ? (
          <section className="adminBox">
            <h4>Security Policies</h4>
            <div className="adminPolicyGrid">
              <label>
                Allow Guest Join
                <Select
                  size="small"
                  value={policies.allowGuestJoin ? "yes" : "no"}
                  onChange={(e) =>
                    setPolicies((prev) => ({ ...prev, allowGuestJoin: e.target.value === "yes" }))
                  }
                >
                  <MenuItem value="yes">Yes</MenuItem>
                  <MenuItem value="no">No</MenuItem>
                </Select>
              </label>
              <label>
                Enforce Waiting Room
                <Select
                  size="small"
                  value={policies.enforceWaitingRoom ? "yes" : "no"}
                  onChange={(e) =>
                    setPolicies((prev) => ({ ...prev, enforceWaitingRoom: e.target.value === "yes" }))
                  }
                >
                  <MenuItem value="yes">Yes</MenuItem>
                  <MenuItem value="no">No</MenuItem>
                </Select>
              </label>
              <label>
                Max Meeting Duration (minutes)
                <TextField
                  size="small"
                  type="number"
                  value={policies.maxMeetingDurationMinutes}
                  onChange={(e) =>
                    setPolicies((prev) => ({
                      ...prev,
                      maxMeetingDurationMinutes: Number(e.target.value || 120),
                    }))
                  }
                />
              </label>
              <label>
                Require Strong Meeting Password
                <Select
                  size="small"
                  value={policies.requireStrongMeetingPassword ? "yes" : "no"}
                  onChange={(e) =>
                    setPolicies((prev) => ({
                      ...prev,
                      requireStrongMeetingPassword: e.target.value === "yes",
                    }))
                  }
                >
                  <MenuItem value="yes">Yes</MenuItem>
                  <MenuItem value="no">No</MenuItem>
                </Select>
              </label>
            </div>
            <div className="adminInlineControls">
              <Button variant="contained" onClick={savePolicies}>Save Policies</Button>
            </div>
          </section>
        ) : null}

        {activeTab === "security" ? (
          <section className="adminBox">
            <div className="adminSectionHeader">
              <h4>Security Center</h4>
              <Button variant="contained" onClick={refreshSecuritySummary}>
                Refresh Security
              </Button>
            </div>
            <div className="adminStatGrid">
              <article className="adminStatCard"><h3>{securitySummary?.disabledUsers ?? 0}</h3><p>Disabled Users</p></article>
              <article className="adminStatCard"><h3>{securitySummary?.staleAdmins ?? 0}</h3><p>Stale Admin Accounts</p></article>
              <article className="adminStatCard"><h3>{securitySummary?.noRecentLoginUsers ?? 0}</h3><p>No Recent Login (7d)</p></article>
              <article className="adminStatCard"><h3>{securitySummary?.activeMeetings ?? 0}</h3><p>Active Meetings</p></article>
            </div>
          </section>
        ) : null}

        {activeTab === "maintenance" ? (
          <section className="adminBox">
            <h4>Maintenance Automation</h4>
            <div className="adminInlineControls">
              <Button variant="outlined" color="error" onClick={onCancelAllActiveMeetings}>
                Emergency: Cancel All Active Meetings
              </Button>
            </div>
          </section>
        ) : null}

        {activeTab === "audit" ? (
          <section className="adminBox">
            <div className="adminSectionHeader">
              <h4>Audit Logs</h4>
              <div className="adminInlineControls">
                <TextField
                  size="small"
                  label="Filter action"
                  value={filters.auditAction}
                  onChange={(e) => setFilters((prev) => ({ ...prev, auditAction: e.target.value }))}
                />
                <Button variant="contained" onClick={runAuditSearch}>Search</Button>
              </div>
            </div>
            <div className="adminTable">
              <div className="adminTableRow adminTableHead">
                <span>Time</span><span>Admin</span><span>Action</span><span>Target</span><span>IP</span>
              </div>
              {auditLogs.map((log) => (
                <div className="adminTableRow" key={log._id}>
                  <span>{formatDate(log.createdAt)}</span>
                  <span>{log.adminEmail}</span>
                  <span>{log.action}</span>
                  <span>{log.targetType}:{log.targetId || "-"}</span>
                  <span>{log.ipAddress || "-"}</span>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </main>

      <Snackbar open={Boolean(error)} autoHideDuration={3500} onClose={() => setError("")}>
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

export default withAdminAuth(AdminDashboard);
