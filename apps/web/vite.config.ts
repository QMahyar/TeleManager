import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        // Split heavy, wholly-used vendors into their own long-lived chunks so
        // they cache across app deploys instead of riding in one monolith with
        // the (frequently-changing) app code. Tree-shaking still runs first, so
        // only the icons actually imported land in the icons chunk.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined
          // Match scoped packages first: `@base-ui/react` contains "/react/" and
          // would otherwise be swept into react-vendor by the generic check below.
          if (id.includes("@base-ui")) return "ui-vendor"
          if (id.includes("@tabler")) return "icons-vendor"
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id))
            return "react-vendor"
          return undefined
        },
      },
    },
  },
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8000",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
