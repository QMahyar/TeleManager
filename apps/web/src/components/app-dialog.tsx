import * as React from "react"

import { Dialog } from "@workspace/ui/components/dialog"

import type { AppDialogState } from "../types"

export function useAppDialog() {
  const [appDialog, setAppDialog] = React.useState<AppDialogState | null>(null)

  const askDialog = React.useCallback(
    (options: Omit<AppDialogState, "resolve">) =>
      new Promise<string | boolean | null>((resolve) => {
        setAppDialog({ ...options, resolve })
      }),
    []
  )

  const dialogElement = (
    <Dialog
      open={Boolean(appDialog)}
      kicker={appDialog?.kicker}
      title={appDialog?.title || "Confirm"}
      description={appDialog?.description}
      danger={appDialog?.danger}
      confirmLabel={appDialog?.confirmLabel}
      input={appDialog?.input}
      onCancel={() => {
        appDialog?.resolve(null)
        setAppDialog(null)
      }}
      onConfirm={(value) => {
        appDialog?.resolve(appDialog.input ? value || null : true)
        setAppDialog(null)
      }}
    />
  )

  return { askDialog, dialogElement }
}
