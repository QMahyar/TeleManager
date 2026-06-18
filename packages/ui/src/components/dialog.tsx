import * as React from "react"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

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

function useDialogLifecycle({
  input,
  inputRef,
  onCancel,
  open,
}: {
  input?: DialogProps["input"]
  inputRef: React.RefObject<HTMLInputElement | null>
  onCancel: () => void
  open: boolean
}) {
  React.useEffect(() => {
    if (!open) {
      return undefined
    }

    const task = window.setTimeout(() => {
      if (input) {
        inputRef.current?.focus()
      }
    }, 0)

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCancel()
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.clearTimeout(task)
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [input, inputRef, onCancel, open])
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
        defaultValue={input.value || ""}
        type={input.type || "text"}
        placeholder={input.placeholder}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            onConfirm(inputRef.current?.value.trim())
          }
        }}
        className="h-9 border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
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

  useDialogLifecycle({ input, inputRef, onCancel, open })

  if (!open) {
    return null
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onCancel()
        }
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-dialog-title"
        aria-describedby={description ? "app-dialog-description" : undefined}
        className="w-full max-w-md border border-border bg-card p-5 text-card-foreground shadow-2xl"
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
      </section>
    </div>
  )
}

export { Dialog, type DialogProps }
