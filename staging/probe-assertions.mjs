// Two HTTP successes are allowed only for the same idempotent final document.
// The staging database checks must independently verify one document/audit row.
export function sameFinalDocument(results, prescriptionId) {
  const successes = results.filter(result => result.status === 200);
  return results.length === 2 && successes.length > 0 &&
    results.every(result => [200, 409].includes(result.status)) &&
    successes.every(result => result.json?.id === prescriptionId &&
      result.json?.status === "signed" && Number.isSafeInteger(result.json?.documentId) &&
      result.json.documentId > 0 && result.json.documentId === successes[0].json.documentId);
}
