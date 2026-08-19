import assert from "node:assert/strict";
import test from "node:test";
import {
  buildModeBSolChatCompletionRequest,
  LEGACY_SOAP_PRODUCTION_GENERATOR,
  MODE_B_SOL_MODEL,
  MODE_B_SOL_SOAP_PRODUCTION_GENERATOR,
  resolveProductionSoapGenerator,
} from "../server/soap-production-generator";

test("production SOAP defaults to the unchanged enhanced GPT-4o pipeline", () => {
  assert.equal(resolveProductionSoapGenerator(undefined), LEGACY_SOAP_PRODUCTION_GENERATOR);
  assert.equal(resolveProductionSoapGenerator("unexpected-value"), LEGACY_SOAP_PRODUCTION_GENERATOR);
  assert.equal(resolveProductionSoapGenerator(""), LEGACY_SOAP_PRODUCTION_GENERATOR);
});

test("production SOAP enables Sol only with the explicit trial value", () => {
  assert.equal(
    resolveProductionSoapGenerator(MODE_B_SOL_SOAP_PRODUCTION_GENERATOR),
    MODE_B_SOL_SOAP_PRODUCTION_GENERATOR,
  );
});

test("Mode B Sol uses the hard-coded model and omits temperature", () => {
  const request = buildModeBSolChatCompletionRequest("system rules", "transcript");

  assert.equal(request.model, MODE_B_SOL_MODEL);
  assert.deepEqual(request.messages, [
    { role: "system", content: "system rules" },
    { role: "user", content: "transcript" },
  ]);
  assert.deepEqual(request.response_format, { type: "json_object" });
  assert.equal(Object.hasOwn(request, "temperature"), false);
});