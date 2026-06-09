import React, { useContext, useMemo, useState } from "react";
import {
  AppBar,
  Avatar,
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  ListItemIcon,
  Menu,
  MenuItem,
  Toolbar,
  Typography,
} from "@mui/material";
import MenuOutlinedIcon from "@mui/icons-material/MenuOutlined";
import LogoutOutlinedIcon from "@mui/icons-material/LogoutOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import RestoreOutlinedIcon from "@mui/icons-material/RestoreOutlined";
import VideoCallOutlinedIcon from "@mui/icons-material/VideoCallOutlined";
import EventOutlinedIcon from "@mui/icons-material/EventOutlined";
import { useLocation, useNavigate } from "react-router-dom";
import { AuthContext } from "../contexts/AuthContext";

const getInitials = (user) => {
  const base = String(user?.name || user?.username || user?.email || "U").trim();
  if (!base) return "U";
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
};

export default function AppHeader() {
  const navigate = useNavigate();
  const location = useLocation();
  const { userData, handleLogout } = useContext(AuthContext);
  const [navAnchorEl, setNavAnchorEl] = useState(null);
  const [accountAnchorEl, setAccountAnchorEl] = useState(null);

  const navItems = useMemo(() => {
    const base = [{ label: "Home", to: "/home" }, { label: "Join", to: "/join" }];
    if (userData?.role === "host") base.push({ label: "Host", to: "/host" });
    return base;
  }, [userData?.role]);

  const activePath = location.pathname;
  const initials = getInitials(userData);
  const roleLabel = userData?.role === "host" ? "Host" : "User";

  const openNavMenu = (event) => setNavAnchorEl(event.currentTarget);
  const closeNavMenu = () => setNavAnchorEl(null);
  const openAccountMenu = (event) => setAccountAnchorEl(event.currentTarget);
  const closeAccountMenu = () => setAccountAnchorEl(null);

  const navigateAndClose = (to) => {
    closeNavMenu();
    closeAccountMenu();
    navigate(to);
  };

  const onLogout = () => {
    closeNavMenu();
    closeAccountMenu();
    handleLogout();
  };

  return (
    <AppBar
      position="sticky"
      elevation={0}
      sx={{
        background: "var(--z-surface-2)",
        borderBottom: "1px solid var(--z-border)",
        backdropFilter: "blur(14px)",
      }}
    >
      <Toolbar sx={{ gap: 1.2, flexWrap: "wrap", alignItems: "center" }}>
        <Typography
          variant="h6"
          sx={{ fontWeight: 900, letterSpacing: "-0.02em", cursor: "pointer" }}
          onClick={() => navigate("/home")}
        >
          Zomeetix
        </Typography>

        <Box
          sx={{
            display: "flex",
            gap: 0.8,
            flex: 1,
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: { xs: "flex-start", md: "flex-end" },
          }}
        >
          <IconButton
            color="inherit"
            size="small"
            onClick={openNavMenu}
            sx={{ display: { xs: "inline-flex", md: "none" } }}
            aria-label="Open navigation menu"
          >
            <MenuOutlinedIcon fontSize="small" />
          </IconButton>

          <Box sx={{ display: { xs: "none", md: "flex" }, gap: 0.6, alignItems: "center" }}>
            {navItems.map((item) => {
              const isActive = activePath === item.to || (item.to !== "/home" && activePath.startsWith(item.to));
              return (
                <Button
                  key={item.to}
                  size="small"
                  color="inherit"
                  variant={isActive ? "contained" : "text"}
                  onClick={() => navigate(item.to)}
                  sx={{
                    px: 1.4,
                    borderRadius: 999,
                    backgroundColor: isActive ? undefined : "transparent",
                  }}
                >
                  {item.label}
                </Button>
              );
            })}
          </Box>
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", gap: 1.1 }}>
          <Chip
            size="small"
            label={roleLabel}
            sx={{
              borderRadius: 999,
              border: "1px solid rgba(120, 153, 236, 0.28)",
              background: "rgba(12, 24, 54, 0.58)",
              fontWeight: 700,
            }}
          />

          <IconButton
            color="inherit"
            onClick={openAccountMenu}
            size="small"
            aria-label="Open account menu"
            aria-haspopup="true"
            aria-expanded={Boolean(accountAnchorEl) ? "true" : undefined}
          >
            <Avatar
              sx={{
                width: 36,
                height: 36,
                fontSize: "0.9rem",
                fontWeight: 800,
                border: "1px solid var(--z-border)",
                background: "rgba(47, 109, 255, 0.35)",
                color: "var(--z-text)",
              }}
            >
              {initials}
            </Avatar>
          </IconButton>
        </Box>
      </Toolbar>

      <Menu
        anchorEl={navAnchorEl}
        open={Boolean(navAnchorEl)}
        onClose={closeNavMenu}
        PaperProps={{
          sx: {
            mt: 1,
            borderRadius: 2,
            border: "1px solid var(--z-border)",
            background: "rgba(8, 17, 40, 0.96)",
            backdropFilter: "blur(18px)",
          },
        }}
      >
        {navItems.map((item) => (
          <MenuItem key={item.to} onClick={() => navigateAndClose(item.to)}>
            {item.label}
          </MenuItem>
        ))}
      </Menu>

      <Menu
        anchorEl={accountAnchorEl}
        open={Boolean(accountAnchorEl)}
        onClose={closeAccountMenu}
        PaperProps={{
          sx: {
            mt: 1,
            width: 320,
            maxWidth: "92vw",
            borderRadius: 2,
            border: "1px solid var(--z-border)",
            background: "rgba(8, 17, 40, 0.96)",
            backdropFilter: "blur(18px)",
          },
        }}
      >
        <Box sx={{ px: 2, py: 1.6 }}>
          <Box sx={{ display: "flex", gap: 1.2, alignItems: "center" }}>
            <Avatar
              sx={{
                width: 44,
                height: 44,
                fontSize: "1rem",
                fontWeight: 900,
                border: "1px solid rgba(120, 153, 236, 0.28)",
                background: "rgba(47, 109, 255, 0.35)",
              }}
            >
              {initials}
            </Avatar>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontWeight: 900, lineHeight: 1.2 }} noWrap>
                {userData?.name || userData?.username || "User"}
              </Typography>
              <Typography variant="body2" sx={{ color: "text.secondary" }} noWrap>
                {userData?.email || ""}
              </Typography>
            </Box>
          </Box>

          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 1.2 }}>
            <Chip
              size="small"
              label={roleLabel}
              sx={{
                borderRadius: 999,
                border: "1px solid rgba(120, 153, 236, 0.22)",
                background: "rgba(12, 24, 54, 0.58)",
                fontWeight: 800,
              }}
            />
            <Chip
              size="small"
              label="Secure session"
              sx={{
                borderRadius: 999,
                border: "1px solid rgba(120, 153, 236, 0.22)",
                background: "rgba(12, 24, 54, 0.58)",
                fontWeight: 800,
              }}
            />
          </Box>
        </Box>

        <Divider />

        <MenuItem onClick={() => navigateAndClose("/profile")}>
          <ListItemIcon>
            <EditOutlinedIcon fontSize="small" />
          </ListItemIcon>
          Edit profile
        </MenuItem>
        <MenuItem onClick={() => navigateAndClose("/history")}>
          <ListItemIcon>
            <RestoreOutlinedIcon fontSize="small" />
          </ListItemIcon>
          Meeting history
        </MenuItem>

        {userData?.role === "host" ? (
          <>
            <MenuItem onClick={() => navigateAndClose("/host")}>
              <ListItemIcon>
                <VideoCallOutlinedIcon fontSize="small" />
              </ListItemIcon>
              Host dashboard
            </MenuItem>
            <MenuItem onClick={() => navigateAndClose("/host/scheduled")}>
              <ListItemIcon>
                <EventOutlinedIcon fontSize="small" />
              </ListItemIcon>
              Scheduled meetings
            </MenuItem>
          </>
        ) : null}

        <Divider />

        <MenuItem onClick={onLogout}>
          <ListItemIcon>
            <LogoutOutlinedIcon fontSize="small" />
          </ListItemIcon>
          Logout
        </MenuItem>
      </Menu>
    </AppBar>
  );
}
