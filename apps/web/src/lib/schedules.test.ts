import { describe, expect, it } from "vitest"

import {
  buildRecurrence,
  recurrencePresets,
  validateRecurrence,
} from "./schedules"

describe("recurrencePresets", () => {
  it("every preset builds a form that passes validation", () => {
    for (const preset of recurrencePresets) {
      expect(validateRecurrence(preset.build())).toBeNull()
    }
  })

  it("Daily at 9am anchors at a future 9:00 local time, every 1 day", () => {
    const form = recurrencePresets.find((p) => p.id === "daily-9am")!.build()
    expect(form.startMode).toBe("at")
    const at = new Date(form.startAt)
    expect(at.getHours()).toBe(9)
    expect(at.getTime()).toBeGreaterThan(Date.now())
    const rec = buildRecurrence(form)
    expect(rec.interval_value).toBe(1)
    expect(rec.interval_unit).toBe("days")
  })

  it("Every 3 hours maps to a 3-hour interval that runs forever", () => {
    const form = recurrencePresets.find((p) => p.id === "every-3h")!.build()
    const rec = buildRecurrence(form)
    expect(rec.interval_value).toBe(3)
    expect(rec.interval_unit).toBe("hours")
    expect(rec.end_mode).toBe("forever")
  })
})
