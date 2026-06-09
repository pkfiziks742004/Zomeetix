import React from "react";
import { Box, Container } from "@mui/material";
import AppHeader from "./AppHeader";
import AppFooter from "./AppFooter";

export default function AppShell({ children, center = true, maxWidth = "lg" }) {
  return (
    <Box sx={{ minHeight: "100vh", background: "var(--z-bg)", color: "var(--z-text)", display: "flex", flexDirection: "column" }}>
      <AppHeader />
      <Box
        component="main"
        sx={{
          flex: 1,
          px: { xs: 2, sm: 3 },
          py: { xs: 3, sm: 3.5 },
          display: center ? "grid" : "block",
          placeItems: center ? "center" : undefined,
        }}
      >
        {center ? children : <Container maxWidth={maxWidth}>{children}</Container>}
      </Box>
      <AppFooter />
    </Box>
  );
}
