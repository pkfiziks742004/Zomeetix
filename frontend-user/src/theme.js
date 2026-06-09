import { alpha, createTheme } from "@mui/material/styles";

const backgroundGradient =
  "radial-gradient(circle at 12% 14%, rgba(62, 121, 255, 0.24), transparent 30%), radial-gradient(circle at 88% 88%, rgba(27, 176, 160, 0.16), transparent 30%), linear-gradient(155deg, #081028 0%, #07162f 58%, #08304a 100%)";

const paletteTokens = {
  primary: "#2f6dff",
  secondary: "#1ba8d4",
  accent: "#f59d1f",
  danger: "#cf2f4a",
  surface: "rgba(11, 21, 48, 0.9)",
  surfaceAlt: "rgba(8, 17, 40, 0.72)",
  border: "rgba(120, 153, 236, 0.28)",
  text: "#eef5ff",
  muted: "#b6caee",
};

const theme = createTheme({
  palette: {
    mode: "dark",
    primary: { main: paletteTokens.primary },
    secondary: { main: paletteTokens.secondary },
    error: { main: paletteTokens.danger },
    warning: { main: paletteTokens.accent },
    background: {
      default: "#071126",
      paper: paletteTokens.surface,
    },
    text: {
      primary: paletteTokens.text,
      secondary: paletteTokens.muted,
    },
    divider: paletteTokens.border,
  },
  typography: {
    fontFamily:
      '"Segoe UI", -apple-system, BlinkMacSystemFont, "Roboto", "Helvetica Neue", Arial, sans-serif',
  },
  shape: {
    borderRadius: 14,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        ":root": {
          "--z-bg": backgroundGradient,
          "--z-surface": paletteTokens.surface,
          "--z-surface-2": paletteTokens.surfaceAlt,
          "--z-border": paletteTokens.border,
          "--z-text": paletteTokens.text,
          "--z-muted": paletteTokens.muted,
          "--z-primary": paletteTokens.primary,
          "--z-secondary": paletteTokens.secondary,
          "--z-accent": paletteTokens.accent,
          "--z-danger": paletteTokens.danger,
          "--z-radius-lg": "18px",
          "--z-radius-md": "14px",
          "--z-shadow-1": "0 18px 40px rgba(2, 8, 24, 0.32)",
        },
        "html, body, #root": {
          width: "100%",
          minHeight: "100%",
        },
        body: {
          background: "var(--z-bg)",
          backgroundAttachment: "fixed",
          color: "var(--z-text)",
        },
        "*, *::before, *::after": {
          boxSizing: "border-box",
        },
        "::selection": {
          backgroundColor: alpha(paletteTokens.primary, 0.35),
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: "none",
          fontWeight: 700,
          borderRadius: 12,
        },
        containedPrimary: {
          backgroundImage: `linear-gradient(120deg, ${paletteTokens.primary}, ${paletteTokens.secondary})`,
          boxShadow: "0 10px 22px rgba(19, 78, 255, 0.28)",
        },
        outlined: {
          borderColor: alpha(paletteTokens.border, 0.75),
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          backgroundColor: paletteTokens.surface,
          border: `1px solid ${paletteTokens.border}`,
          borderRadius: 16,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          backgroundColor: alpha("#0b1530", 0.35),
          "& .MuiOutlinedInput-notchedOutline": {
            borderColor: alpha(paletteTokens.border, 0.85),
          },
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: alpha(paletteTokens.primary, 0.55),
          },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
            borderColor: alpha(paletteTokens.primary, 0.75),
            boxShadow: `0 0 0 4px ${alpha(paletteTokens.primary, 0.16)}`,
          },
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: "rgba(8, 18, 40, 0.96)",
          border: `1px solid ${alpha(paletteTokens.border, 0.65)}`,
          fontSize: "0.78rem",
        },
      },
    },
  },
});

export default theme;
