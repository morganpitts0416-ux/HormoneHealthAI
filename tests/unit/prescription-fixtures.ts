import { deflateSync } from "node:zlib";
import type { Prescription } from "../../shared/schema";

// A generated 2x2 black PNG; no real patient's or provider's signature.
function pngChunk(type: string, bytes: Buffer) {
  const content = Buffer.concat([Buffer.from(type), bytes]);
  let crc = 0xffffffff;
  for (const byte of content) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  const length = Buffer.alloc(4); length.writeUInt32BE(bytes.length);
  const checksum = Buffer.alloc(4); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, content, checksum]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(2, 0); ihdr.writeUInt32BE(2, 4); ihdr[8] = 8; ihdr[9] = 2;
export const syntheticSignature = "data:image/png;base64," + Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  pngChunk("IHDR", ihdr), pngChunk("IDAT", deflateSync(Buffer.alloc(14))),
  pngChunk("IEND", Buffer.alloc(0)),
]).toString("base64");

export const syntheticPrescription = (): Prescription => ({
  id: 1, clinicId: 10, patientId: 20, medicationName: "Synthetic Medication",
  strength: "10 mg", dosageForm: "tablet", sig: "Take one tablet daily",
  quantity: "30", refills: 1, substitutionAllowed: true,
  isControlledSubstance: false, status: "draft",
  pharmacyName: "Synthetic Pharmacy", pharmacyAddress: "100 Example Street",
  pharmacyPhone: "555-0100", pharmacyFax: "555-0101",
  signedAt: null, signedByUserId: null,
} as Prescription);
