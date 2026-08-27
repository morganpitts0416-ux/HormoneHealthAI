import { beforeEach, describe, expect, test, vi } from "vitest";

const openAIMocks = vi.hoisted(() => ({
  create: vi.fn(),
}));

vi.mock("openai", () => ({
  default: class MockOpenAI {
    chat = {
      completions: {
        create: openAIMocks.create,
      },
    };
  },
}));

import { AIService } from "../../server/ai-service";
import { interpretationResultSchema } from "@shared/schema";

describe("Patient Communication generation status", () => {
  beforeEach(() => {
    openAIMocks.create.mockReset();
    vi.restoreAllMocks();
  });

  test("marks a non-empty model response as generated", async () => {
    openAIMocks.create.mockResolvedValue({
      choices: [{ message: { content: "Your results show a focused treatment plan." } }],
      _request_id: "req_success",
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await AIService.generatePatientSummary({}, [], false);

    expect(result).toEqual({
      text: "Your results show a focused treatment plan.",
      generationStatus: "generated",
    });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  test("marks an empty response as fallback and logs only allowlisted metadata", async () => {
    openAIMocks.create.mockResolvedValue({
      choices: [{ message: { content: "" } }],
      _request_id: "req_empty_123",
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await AIService.generatePatientSummary({}, [], false);

    expect(result.generationStatus).toBe("fallback_due_to_error");
    expect(result.text).toContain("We've reviewed your recent lab results.");
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toBe("[Patient Communication] generation_failure");

    const event = JSON.parse(String(errorSpy.mock.calls[0][1]));
    expect(event).toEqual({
      function: "generatePatientSummary",
      model: "gpt-5-mini",
      failureKind: "empty_response",
      errorClass: null,
      errorCode: null,
      httpStatus: null,
      emptyResponse: true,
      contextLengthError: false,
      requestId: "req_empty_123",
    });
  });

  test("preserves fallback while logging sanitized OpenAI error metadata", async () => {
    const error = Object.assign(
      new Error("maximum context length exceeded for private patient prompt"),
      {
        code: "context_length_exceeded",
        status: 400,
        request_id: "req_context_456",
      },
    );
    openAIMocks.create.mockRejectedValue(error);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await AIService.generatePatientSummary({}, [], false);

    expect(result.generationStatus).toBe("fallback_due_to_error");
    expect(result.text).toContain("We've reviewed your recent lab results.");
    expect(errorSpy).toHaveBeenCalledTimes(1);

    const serializedEvent = String(errorSpy.mock.calls[0][1]);
    expect(serializedEvent).not.toContain(error.message);
    expect(serializedEvent).not.toContain("private patient prompt");

    expect(JSON.parse(serializedEvent)).toEqual({
      function: "generatePatientSummary",
      model: "gpt-5-mini",
      failureKind: "exception",
      errorClass: "Error",
      errorCode: "context_length_exceeded",
      httpStatus: 400,
      emptyResponse: false,
      contextLengthError: true,
      requestId: "req_context_456",
    });
  });

  test("preserves the fallback status in the shared interpretation contract", () => {
    const parsed = interpretationResultSchema.parse({
      redFlags: [],
      interpretations: [],
      aiRecommendations: "Provider-facing recommendations",
      patientSummary: "Fallback text",
      patientSummaryGenerationStatus: "fallback_due_to_error",
      recheckWindow: "8-12 weeks",
      supplements: [],
      soapNote: "SOAP note",
    });

    expect(parsed.patientSummaryGenerationStatus).toBe("fallback_due_to_error");
  });
});