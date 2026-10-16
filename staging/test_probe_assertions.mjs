import assert from "node:assert/strict";
import test from "node:test";
import { sameFinalDocument } from "./probe-assertions.mjs";

const ok = (documentId = 4) => ({ status: 200, json: { id: 7, status: "signed", documentId } });
test("accepts identical idempotent document replies or an explicit conflict", () => {
  assert(sameFinalDocument([ok(), ok()], 7));
  assert(sameFinalDocument([ok(), { status: 409 }], 7));
});
test("rejects two different final documents, failed calls, missing linkage or wrong rx", () => {
  for (const results of [[ok(), ok(5)], [{ status: 409 }, { status: 409 }],
    [ok(), { status: 503 }], [ok(), { status: 200, json: {} }], [ok(0), ok(0)]]) {
    assert.equal(sameFinalDocument(results, 7), false);
  }
  assert.equal(sameFinalDocument([ok(), ok()], 8), false);
});
