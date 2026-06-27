import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

// Separate from vite.config.ts on purpose: tests don't need the Tailwind plugin or
// the production manualChunks splitting, just React (for future component tests) and
// the same "@/" alias the app uses. jsdom is the default env so component tests work
// without per-file opt-in; pure-logic tests ignore it.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
