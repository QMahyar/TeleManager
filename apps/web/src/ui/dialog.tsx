import * as React from "react"

import { Button } from "./button"
import { ModalShell } from "./modal"

type DialogProps = {
  open: boolean
  kicker?: string
  title: string
  description?: string
  danger?: boolean
  confirmLabel?: string
  cancelLabel?: string
  input?: {
    label: string
    value?: string
    placeholder?: string
    type?: React.HTMLInputTypeAttribute
  }
  onCancel: () => void
  onConfirm: (value?: string) => void
}

function DialogInput({
  input,
  inputRef,
  onConfirm,
  title,
}: {
  input: NonNullable<DialogProps["input"]>
  inputRef: React.RefObject<HTMLInputElement | null>
  onConfirm: (value?: string) => void
  title: string
}) {
  return (
    <label className="type-label grid gap-2 text-muted-foreground">
      {input.label}
      <input
        ref={inputRef}
        key={`${title}-${input.value || ""}`}
        autoFocus
        defaultValue={input.value || ""}
        type={input.type || "text"}
        placeholder={input.placeholder}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            onConfirm(inputRef.current?.value.trim())
          }
        }}
        className="h-9 rounded-md border border-input bg-background px-3 text-base text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring sm:text-sm"
      />
    </label>
  )
}

function Dialog({
  open,
  kicker = "Confirm",
  title,
  description,
  danger = false,
  confirmLabel = "Continue",
  cancelLabel = "Cancel",
  input,
  onCancel,
  onConfirm,
}: DialogProps) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const confirm = () =>
    onConfirm(input ? inputRef.current?.value.trim() : undefined)

  return (
    <ModalShell
      open={open}
      onClose={onCancel}
      kicker={kicker}
      title={title}
      description={description}
      danger={danger}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? "destructive" : "default"} onClick={confirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {input ? (
        <DialogInput
          input={input}
          inputRef={inputRef}
          onConfirm={onConfirm}
          title={title}
        />
      ) : null}
    </ModalShell>
  )
}

export { Dialog, type DialogProps }
