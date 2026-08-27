import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { PatientSummary } from "@/components/patient-summary";

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

describe("Patient Communication fallback warning", () => {
  afterEach(cleanup);

  test("shows the provider warning for fallback text", () => {
    render(
      <PatientSummary
        summary="We've reviewed your recent lab results."
        labValues={{}}
        generationStatus="fallback_due_to_error"
      />,
    );

    expect(
      screen.getByText("AI draft could not be generated. Showing fallback text."),
    ).toBeTruthy();
  });

  test("does not show the warning for a successful AI draft", () => {
    render(
      <PatientSummary
        summary="Your results show a focused treatment plan."
        labValues={{}}
        generationStatus="generated"
      />,
    );

    expect(
      screen.queryByText("AI draft could not be generated. Showing fallback text."),
    ).toBeNull();
  });
});