import * as React from "react"

export function useLoading() {
  const [loading, setLoading] = React.useState(false)
  const loadingRef = React.useRef(false)

  const run = React.useCallback(async (work: () => Promise<void>) => {
    if (loadingRef.current) return false
    loadingRef.current = true
    setLoading(true)
    try {
      await work()
      return true
    } finally {
      loadingRef.current = false
      setLoading(false)
    }
  }, [])

  return { loading, run, isBusy: loadingRef }
}
