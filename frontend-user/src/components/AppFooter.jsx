import React from "react";
import { Box, Chip, Container, Typography } from "@mui/material";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import VerifiedUserOutlinedIcon from "@mui/icons-material/VerifiedUserOutlined";

export default function AppFooter() {
  const year = new Date().getFullYear();

  return (
    <Box
      component="footer"
      sx={{
        borderTop: "1px solid rgba(120, 153, 236, 0.18)",
        background: "rgba(7, 18, 42, 0.55)",
        backdropFilter: "blur(14px)",
        mt: "auto",
      }}
    >
      <Container
        maxWidth="xl"
        sx={{
          py: 2.2,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 2,
          flexWrap: "wrap",
        }}
      >
        <Box>
          <Typography sx={{ fontWeight: 900, letterSpacing: "-0.02em" }}>Zomeetix</Typography>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            Secure meeting workspace {"\u2022"} Protected access by default
          </Typography>
        </Box>

        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
          <Chip
            size="small"
            icon={<ShieldOutlinedIcon sx={{ fontSize: "1rem !important" }} />}
            label="TLS"
            sx={{
              borderRadius: 999,
              border: "1px solid rgba(120, 153, 236, 0.22)",
              background: "rgba(12, 24, 54, 0.58)",
              fontWeight: 800,
            }}
          />
          <Chip
            size="small"
            icon={<LockOutlinedIcon sx={{ fontSize: "1rem !important" }} />}
            label="Password"
            sx={{
              borderRadius: 999,
              border: "1px solid rgba(120, 153, 236, 0.22)",
              background: "rgba(12, 24, 54, 0.58)",
              fontWeight: 800,
            }}
          />
          <Chip
            size="small"
            icon={<VerifiedUserOutlinedIcon sx={{ fontSize: "1rem !important" }} />}
            label="Secure session"
            sx={{
              borderRadius: 999,
              border: "1px solid rgba(120, 153, 236, 0.22)",
              background: "rgba(12, 24, 54, 0.58)",
              fontWeight: 800,
            }}
          />
        </Box>

        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          {"\u00A9"} {year} Zomeetix
        </Typography>
      </Container>
    </Box>
  );
}
