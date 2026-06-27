import * as React from "react"

import { api } from "../lib/api"
import { versionResponseSchema } from "../lib/schemas"

// One-shot fetch of the backend version for the status bar. Stays in lockstep
// with the backend (same source the About screen reads), so no build-time
// constant to keep synced. Renders as undefined until it resolves.
export function useVersion() {
  const [version, setVersion] = React.useState<string | undefined>(undefined)

  React.useEffect(() => {
    let active = true
    api("/api/version", {}, versionResponseSchema)
      .then((info) => {
        if (active) setVersion(info.version)
      })
      .catch(() => {
        // Version is decorative in the status bar; a failed fetch just leaves
        // it blank rather than surfacing an error.
      })
    return () => {
      active = false
    }
  }, [])

  return version
}
