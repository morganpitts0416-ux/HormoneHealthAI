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
      id: "chat_success",
      choices: [{
        finish_reason: "stop",
        message: { content: "Your results show a focused treatment plan.", refusal: null },
      }],
      usage: {
        prompt_tokens: 900,
        completion_tokens: 120,
        completion_tokens_details: { reasoning_tokens: 35 },
      },
      _request_id: "req_success",
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await AIService.generatePatientSummary({}, [], false);

    expect(result).toEqual({
      text: "Your results show a focused treatment plan.",
      generationStatus: "generated",
    });
    const request = openAIMocks.create.mock.calls[0][0];
    expect(request).toMatchObject({
      model: "gpt-5-mini",
      reasoning_effort: "low",
      max_completion_tokens: 4000,
      messages: expect.arrayContaining([
        expect.objectContaining({ role: "system" }),
        expect.objectContaining({ role: "user" }),
      ]),
    });
    expect(request).not.toHaveProperty("response_format");
    expect(request).not.toHaveProperty("tools");
    expect(request).not.toHaveProperty("max_output_tokens");
    const receivedCall = logSpy.mock.calls.find(
      call => call[0] === "[Patient Communication] response_received",
    );
    expect(receivedCall).toBeDefined();
    expect(JSON.parse(String(receivedCall?.[1]))).toEqual({
      model: "gpt-5-mini",
      effectiveReasoningEffort: "low",
      effectiveMaxCompletionTokens: 4000,
      responseStatus: null,
      finishReason: "stop",
      incompleteReason: null,
      promptTokens: 900,
      completionTokens: 120,
      reasoningTokens: 35,
      messageContentType: "string",
      messageContentLength: 43,
      refusalPresent: false,
      responseId: "chat_success",
      requestId: "req_success",
    });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  test("extracts text from Responses-style output_text and message content", async () => {
    openAIMocks.create
      .mockResolvedValueOnce({
        id: "resp_output_text",
        status: "completed",
        output_text: "The response text is available here.",
        output: [{ type: "message", content: [{ type: "output_text" }] }],
      })
      .mockResolvedValueOnce({
        id: "resp_message_content",
        status: "completed",
        output: [{ type: "message", content: [{ type: "output_text", text: "A second response." }] }],
      });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const first = await AIService.generatePatientSummary({}, [], false);
    const second = await AIService.generatePatientSummary({}, [], false);

    expect(first).toMatchObject({
      text: "The response text is available here.",
      generationStatus: "generated",
    });
    expect(second).toMatchObject({
      text: "A second response.",
      generationStatus: "generated",
    });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  test("marks an empty response as fallback and logs only allowlisted metadata", async () => {
    openAIMocks.create.mockResolvedValue({
      id: "chat_empty_123",
      choices: [{ finish_reason: "length", message: { content: "", refusal: null } }],
      usage: {
        prompt_tokens: 2100,
        completion_tokens: 4000,
        completion_tokens_details: { reasoning_tokens: 4000 },
      },
      _request_id: "req_empty_123",
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await AIService.generatePatientSummary({}, [], false);

    expect(result.generationStatus).toBe("fallback_due_to_error");
    expect(result.text).toContain("We've reviewed your recent lab results.");
    const receivedCall = logSpy.mock.calls.find(
      call => call[0] === "[Patient Communication] response_received",
    );
    expect(receivedCall).toBeDefined();
    expect(JSON.parse(String(receivedCall?.[1]))).toEqual({
      model: "gpt-5-mini",
      effectiveReasoningEffort: "low",
      effectiveMaxCompletionTokens: 4000,
      responseStatus: null,
      finishReason: "length",
      incompleteReason: null,
      promptTokens: 2100,
      completionTokens: 4000,
      reasoningTokens: 4000,
      messageContentType: "string",
      messageContentLength: 0,
      refusalPresent: false,
      responseId: "chat_empty_123",
      requestId: "req_empty_123",
    });
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

  test("diagnoses refusal and incomplete response shape without logging its text", async () => {
    openAIMocks.create.mockResolvedValue({
      id: "chat_incomplete",
      status: "incomplete",
      incomplete_details: { reason: "max_output_tokens" },
      choices: [{
        finish_reason: "length",
        message: {
          content: null,
          refusal: "The private refusal text must not be logged.",
        },
      }],
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await AIService.generatePatientSummary({}, [], false);

    expect(result.generationStatus).toBe("fallback_due_to_error");
    const structureCall = logSpy.mock.calls.find(
      call => call[0] === "[Patient Communication] response_received",
    );
    expect(structureCall).toBeDefined();
    const structure = JSON.parse(String(structureCall?.[1]));
    expect(structure).toMatchObject({
      messageContentType: "null",
      messageContentLength: 0,
      finishReason: "length",
      refusalPresent: true,
    });
    expect(String(structureCall?.[1])).not.toContain("private refusal text");
    expect(errorSpy).toHaveBeenCalledTimes(1);
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