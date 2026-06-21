import * as React from "react"

import { Button } from "./button"
import { Modal } from "./modal"
import { cn } from "./utils"

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
    <label className="mt-4 grid gap-2 text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase">
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
        className="h-9 rounded-md border border-input bg-background px-3 text-base text-foreground outline-none transition-colors focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30 sm:text-sm"
      />
    </label>
  )
}

function DialogActions({
  cancelLabel,
  danger,
  input,
  inputRef,
  onCancel,
  onConfirm,
  confirmLabel,
}: {
  cancelLabel: string
  danger: boolean
  input?: DialogProps["input"]
  inputRef: React.RefObject<HTMLInputElement | null>
  onCancel: () => void
  onConfirm: (value?: string) => void
  confirmLabel: string
}) {
  return (
    <div className={cn("mt-5 flex justify-end gap-2", input && "mt-4")}>
      <Button variant="outline" onClick={onCancel}>
        {cancelLabel}
      </Button>
      <Button
        variant={danger ? "destructive" : "default"}
        onClick={() =>
          onConfirm(input ? inputRef.current?.value.trim() : undefined)
        }
      >
        {confirmLabel}
      </Button>
    </div>
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

  return (
    <Modal
      open={open}
      onClose={onCancel}
      className="max-w-md p-5"
      labelledBy="app-dialog-title"
      describedBy={description ? "app-dialog-description" : undefined}
    >
      <p className="text-[0.65rem] font-semibold tracking-[0.28em] text-primary uppercase">
        {kicker}
      </p>
      <h2
        id="app-dialog-title"
        className="mt-2 font-heading text-2xl text-foreground"
      >
        {title}
      </h2>
      {description ? (
        <p
          id="app-dialog-description"
          className="mt-2 text-sm leading-6 text-muted-foreground"
        >
          {description}
        </p>
      ) : null}
      {input ? (
        <DialogInput
          input={input}
          inputRef={inputRef}
          onConfirm={onConfirm}
          title={title}
        />
      ) : null}
      <DialogActions
        cancelLabel={cancelLabel}
        confirmLabel={confirmLabel}
        danger={danger}
        input={input}
        inputRef={inputRef}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />
    </Modal>
  )
}

export { Dialog, type DialogProps }
