import { IconAlertCircle } from "@tabler/icons-react"

import {
  getActionSchema,
  validateFields,
  type ActionField,
  type FieldValues,
} from "../lib/action-schema"
import type { ActionType, Flash } from "../types"
import { Field, Input, PathInput, Select, Textarea } from "./ui"

const SCHEDULE_PRESETS = [
  { label: "+15m", value: "+15m" },
  { label: "+1h", value: "+1h" },
  { label: "+3h", value: "+3h" },
  { label: "+1d", value: "+1d" },
]

export function ActionFields({
  actionType,
  values,
  setValues,
  showErrors,
  flash,
}: {
  actionType: ActionType
  values: FieldValues
  setValues: (next: FieldValues) => void
  showErrors: boolean
  flash?: Flash
}) {
  const schema = getActionSchema(actionType)
  if (!schema) return null

  const allErrors = validateFields(actionType, values)

  function update(name: string, value: string | boolean) {
    setValues({ ...values, [name]: value })
  }

  // Format errors surface live on fields the user has typed into; "required"
  // errors on empty fields wait until a submit attempt (showErrors) so the form
  // does not look broken before it is filled in.
  function errorFor(name: string): string | undefined {
    const error = allErrors[name]
    if (!error) return undefined
    if (showErrors) return error
    const value = values[name]
    const hasContent = typeof value === "string" && value.trim() !== ""
    return hasContent ? error : undefined
  }

  return (
    <div className="grid gap-3">
      {schema.fields.map((field) => (
        <ActionFieldRow
          key={field.name}
          field={field}
          value={values[field.name]}
          error={errorFor(field.name)}
          onChange={(value) => update(field.name, value)}
          flash={flash}
        />
      ))}
    </div>
  )
}

function ActionFieldRow({
  field,
  value,
  error,
  onChange,
  flash,
}: {
  field: ActionField
  value: string | boolean | undefined
  error?: string
  onChange: (value: string | boolean) => void
  flash?: Flash
}) {
  if (field.kind === "checkbox") {
    return (
      <label className="flex items-center gap-3 rounded-md border border-border bg-muted/20 p-3 text-sm">
        <input
          type="checkbox"
          checked={value === true}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span className="font-medium text-foreground">{field.label}</span>
        {field.help ? (
          <span className="text-xs text-muted-foreground">{field.help}</span>
        ) : null}
      </label>
    )
  }

  const stringValue = typeof value === "string" ? value : ""
  const label = field.required ? `${field.label} *` : field.label

  return (
    <Field label={label}>
      {field.kind === "textarea" ? (
        <Textarea
          value={stringValue}
          maxLength={4000}
          autoComplete="off"
          aria-invalid={Boolean(error)}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder}
        />
      ) : field.kind === "select" ? (
        <Select
          value={stringValue}
          onChange={(event) => onChange(event.target.value)}
        >
          {(field.options || []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      ) : field.kind === "datetime" ? (
        <DateTimeField
          value={stringValue}
          placeholder={field.placeholder}
          error={Boolean(error)}
          onChange={onChange}
        />
      ) : field.browse ? (
        <PathInput
          value={stringValue}
          browse={field.browse}
          flash={flash}
          maxLength={500}
          autoComplete="off"
          aria-invalid={Boolean(error)}
          onChange={onChange}
          placeholder={field.placeholder}
        />
      ) : (
        <Input
          value={stringValue}
          maxLength={500}
          autoComplete="off"
          aria-invalid={Boolean(error)}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder}
        />
      )}
      <FieldFooter help={field.help} error={error} />
    </Field>
  )
}

function DateTimeField({
  value,
  placeholder,
  error,
  onChange,
}: {
  value: string
  placeholder?: string
  error: boolean
  onChange: (value: string) => void
}) {
  // A relative value (+15m) lives in the text box; an absolute value uses the
  // native picker. They share one underlying string the schema serializes.
  const isRelative = /^\+\d+[mhd]$/i.test(value.trim())
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-1.5">
        {SCHEDULE_PRESETS.map((preset) => (
          <button
            key={preset.value}
            type="button"
            className={`rounded-md border px-2 py-1 text-xs transition-colors ${
              value.trim().toLowerCase() === preset.value
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-muted/40"
            }`}
            onClick={() => onChange(preset.value)}
          >
            {preset.label}
          </button>
        ))}
      </div>
      {isRelative ? (
        <Input
          value={value}
          autoComplete="off"
          aria-invalid={error}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder || "+15m"}
        />
      ) : (
        <Input
          type="datetime-local"
          value={value}
          aria-invalid={error}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </div>
  )
}

function FieldFooter({ help, error }: { help?: string; error?: string }) {
  if (error) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-destructive normal-case">
        <IconAlertCircle className="size-3.5 shrink-0" />
        {error}
      </span>
    )
  }
  if (help) {
    return (
      <span className="text-xs text-muted-foreground normal-case">{help}</span>
    )
  }
  return null
}
