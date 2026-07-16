/** @jsxRuntime automatic */
import { afterEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { AppPasswordGate } from "./app-password-gate"

vi.mock("../lib/api", () => ({
  api: vi.fn(),
  toForm: vi.fn((values: Record<string, string | number | Blob>) => {
    const body = new FormData()
    Object.entries(values).forEach(([k, v]) => body.set(k, String(v)))
    return body
  }),
}))

import { api } from "../lib/api"
const mockApi = vi.mocked(api)

afterEach(() => {
  vi.resetAllMocks()
})

function Children() {
  return <span data-testid="children">Protected content</span>
}

describe("AppPasswordGate", () => {
  it("renders children when password is not enabled", async () => {
    mockApi.mockResolvedValueOnce({ password_enabled: false })

    render(
      <AppPasswordGate>
        <Children />
      </AppPasswordGate>,
    )

    await waitFor(() => {
      expect(screen.getByTestId("children")).toBeTruthy()
    })
    expect(screen.getByText("Protected content")).toBeTruthy()
  })

  it("shows login UI when password is enabled", async () => {
    mockApi.mockResolvedValueOnce({ password_enabled: true })

    render(
      <AppPasswordGate>
        <Children />
      </AppPasswordGate>,
    )

    // Wait for loading to finish
    await waitFor(() => {
      expect(screen.queryByText("Checking session…")).toBeNull()
    })

    // Children should NOT be rendered
    expect(screen.queryByTestId("children")).toBeNull()
    // Login form should be present
    expect(screen.getByText("App password")).toBeTruthy()
    expect(screen.getByRole("button", { name: /Unlock/ })).toBeTruthy()
    expect(screen.getByPlaceholderText("Enter app password")).toBeTruthy()
  })

  it("unlocks after successful login", async () => {
    mockApi.mockResolvedValueOnce({ password_enabled: true })

    render(
      <AppPasswordGate>
        <Children />
      </AppPasswordGate>,
    )

    await waitFor(() => {
      expect(screen.queryByText("Checking session…")).toBeNull()
    })

    const user = userEvent.setup()
    const input = screen.getByPlaceholderText("Enter app password")
    await user.type(input, "secret123")

    // Mock login success
    mockApi.mockResolvedValueOnce({})
    await user.click(screen.getByRole("button", { name: /Unlock/ }))

    await waitFor(() => {
      expect(screen.getByTestId("children")).toBeTruthy()
    })
    expect(screen.getByText("Protected content")).toBeTruthy()
    // Login form should be gone
    expect(screen.queryByText("App password")).toBeNull()
  })

  it("shows error on failed login and stays gated", async () => {
    mockApi.mockResolvedValueOnce({ password_enabled: true })

    render(
      <AppPasswordGate>
        <Children />
      </AppPasswordGate>,
    )

    await waitFor(() => {
      expect(screen.queryByText("Checking session…")).toBeNull()
    })

    const user = userEvent.setup()
    const input = screen.getByPlaceholderText("Enter app password")
    await user.type(input, "wrongpassword")

    // Mock login failure
    mockApi.mockRejectedValueOnce(new Error("Incorrect password."))
    await user.click(screen.getByRole("button", { name: /Unlock/ }))

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy()
    })
    expect(screen.getByRole("alert").textContent).toBe("Incorrect password.")
    // Still gated — children not rendered, login form still present
    expect(screen.queryByTestId("children")).toBeNull()
    expect(screen.getByText("App password")).toBeTruthy()
  })
})
