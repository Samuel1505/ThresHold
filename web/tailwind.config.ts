import type { Config } from "tailwindcss";

/**
 * Tokens live as CSS custom properties in `app/globals.css` (the source of truth).
 * Tailwind references them so utilities and raw CSS never drift.
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    // deliberately small, opinionated scales — a control surface, not a design toy
    screens: { sm: "640px", md: "900px", lg: "1200px", xl: "1440px" },
    fontFamily: {
      sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      mono: ["var(--font-mono)", "ui-monospace", "monospace"],
    },
    fontSize: {
      "2xs": ["0.6875rem", { lineHeight: "1rem", letterSpacing: "0.02em" }],
      xs: ["0.75rem", { lineHeight: "1.1rem" }],
      sm: ["0.8125rem", { lineHeight: "1.25rem" }],
      base: ["0.875rem", { lineHeight: "1.5rem" }],
      md: ["1rem", { lineHeight: "1.6rem" }],
      lg: ["1.125rem", { lineHeight: "1.6rem", letterSpacing: "-0.01em" }],
      xl: ["1.4rem", { lineHeight: "1.7rem", letterSpacing: "-0.015em" }],
      "2xl": ["1.9rem", { lineHeight: "2.1rem", letterSpacing: "-0.02em" }],
      "3xl": ["2.6rem", { lineHeight: "2.7rem", letterSpacing: "-0.025em" }],
      gauge: ["3.4rem", { lineHeight: "1", letterSpacing: "-0.03em" }],
    },
    extend: {
      colors: {
        bg: "var(--bg)",
        panel: "var(--panel)",
        "panel-2": "var(--panel-2)",
        well: "var(--well)",
        line: "var(--line)",
        "line-strong": "var(--line-strong)",
        fg: "var(--fg)",
        "fg-2": "var(--fg-2)",
        "fg-3": "var(--fg-3)",
        "fg-4": "var(--fg-4)",
        armed: "var(--armed)",
        observing: "var(--observing)",
        executed: "var(--executed)",
        expired: "var(--expired)",
        failed: "var(--failed)",
        bid: "var(--bid)",
        ask: "var(--ask)",
        threshold: "var(--threshold)",
      },
      borderRadius: { sm: "4px", DEFAULT: "6px", md: "6px", lg: "8px", xl: "12px" },
      transitionTimingFunction: {
        out: "var(--ease-out)",
        "in-out": "var(--ease-in-out)",
      },
      transitionDuration: { fast: "120ms", DEFAULT: "180ms", slow: "240ms" },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(2px)" },
          to: { opacity: "1", transform: "none" },
        },
        pulse: { "0%,100%": { opacity: "1" }, "50%": { opacity: "0.4" } },
        shimmer: { to: { transform: "translateX(100%)" } },
      },
      animation: {
        "fade-in": "fade-in 180ms var(--ease-out) both",
        pulse: "pulse 1.6s var(--ease-in-out) infinite",
      },
    },
  },
  plugins: [],
};

export default config;
