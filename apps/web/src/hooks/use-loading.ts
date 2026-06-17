import * as React from "react"

export function useLoading() {
  const [loading, setLoading] = React.useState(false)

  const run = React.useCallback(async (work: () => Promise<void>) => {
    setLoading(true)
    try {
      await work()
    } finally {
      setLoading(false)
    }
  }, [])

  return { loading, run }
}
