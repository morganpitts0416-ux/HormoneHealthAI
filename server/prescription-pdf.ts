import { jsPDF } from "jspdf";

export interface PrescriptionPdfData {
  clinicName: string;
  clinicAddress?: string | null;
  clinicPhone?: string | null;
  patientName: string;
  patientDob: Date | string | null;
  patientAddress?: string | null;
  medicationName: string;
  strength?: string | null;
  dosageForm?: string | null;
  sig: string;
  quantity: string;
  refills: number;
  substitutionAllowed: boolean;
  pharmacyName?: string | null;
  pharmacyAddress?: string | null;
  pharmacyPhone?: string | null;
  pharmacyFax?: string | null;
  dose?: string | null;
  route?: string | null;
  frequency?: string | null;
  daysSupply?: number | null;
    prescriberName: string;
  prescriberTitle?: string | null;
  signatureImage?: string | null;
  prescriberNpi?: string | null;
  prescriberLicense?: string | null;
  prescriberLicenseState?: string | null;
  signedAt: Date;
}

export function generatePrescriptionPdf(data: PrescriptionPdfData): Buffer {
  if (!/^data:image\/(?:png|jpeg);base64,/.test(data.signatureImage ?? "")) {
    throw new Error("A valid saved prescriber signature is required");
  }
  const pdf = new jsPDF({ unit: "pt", format: "letter" });
  pdf.setCreationDate(data.signedAt);

  const LEFT = 50;
  const RIGHT = 562;
  const TOP = 48;
  const BOTTOM = 744;
  const LINE_HEIGHT = 15;

  let y = TOP;

  const newPage = () => {
    pdf.addPage();
    y = TOP;
  };

  const ensureSpace = (height: number) => {
    if (y + height > BOTTOM) newPage();
  };

  const space = (height: number) => {
    ensureSpace(height);
    y += height;
  };

  const line = (
    label: string,
    value?: string | number | null
  ) => {
    if (value === null || value === undefined || value === "") return;

    const content = `${label}: ${value}`;
    const wrapped = pdf.splitTextToSize(content, RIGHT - LEFT);

    for (const textLine of wrapped) {
      ensureSpace(LINE_HEIGHT);
      pdf.text(textLine, LEFT, y);
      y += LINE_HEIGHT;
    }

    space(5);
  };

  const heading = (text: string) => {
    ensureSpace(40);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    pdf.text(text, LEFT, y);
    y += 25;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
  };

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(17);

  const clinicLines = pdf.splitTextToSize(data.clinicName, RIGHT - LEFT);
  for (const clinicLine of clinicLines) {
    ensureSpace(23);
    pdf.text(clinicLine, LEFT, y);
    y += 23;
  }

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);

  line("Address", data.clinicAddress);
  line("Phone", data.clinicPhone);

  space(12);
  ensureSpace(30);
  pdf.line(LEFT, y, RIGHT, y);
  y += 25;

  heading("PRESCRIPTION");

  line("Patient", data.patientName);

  const dob = data.patientDob
    ? new Date(data.patientDob).toLocaleDateString("en-US", {
        timeZone: "UTC",
      })
    : "Not recorded";

  line("DOB", dob);
  line("Patient Address", data.patientAddress);
  line("Date Signed", data.signedAt.toISOString());

  space(15);
  heading("Rx");

  line("Medication", data.medicationName);
  line("Strength", data.strength);
  line("Form", data.dosageForm);
  line("Dose", data.dose);
  line("Route", data.route);
  line("Frequency", data.frequency);
  line("Directions", data.sig);
  line("Quantity", data.quantity);
  line("Refills", data.refills);
  line("Days Supply", data.daysSupply);
  line(
    "Substitution",
    data.substitutionAllowed ? "Allowed" : "Dispense as written"
  );

  space(15);
  line("Pharmacy", data.pharmacyName);
  line("Pharmacy Address", data.pharmacyAddress);
  line("Pharmacy Phone", data.pharmacyPhone);
  line("Pharmacy Fax", data.pharmacyFax);

    // Keep the signature and prescriber details together.
  ensureSpace(210);

  space(20);
  pdf.line(LEFT, y, RIGHT, y);
  y += 25;

  // Render the prescriber's saved signature.
  if (data.signatureImage) {
    try {
      const imageType = data.signatureImage.includes("image/png")
        ? "PNG"
        : "JPEG";

      pdf.addImage(
        data.signatureImage,
        imageType,
        LEFT,
        y,
        110,
        36,
        undefined,
        "FAST"
      );

      y += 45;
    } catch (error) {
      throw new Error("Unable to render prescriber signature");
    }
  }

  pdf.setFont("helvetica", "bold");

  line(
    "Prescriber",
    `${data.prescriberName}${
      data.prescriberTitle ? ", " + data.prescriberTitle : ""
    }`
  );

  pdf.setFont("helvetica", "normal");

  line("NPI", data.prescriberNpi);
  line("License", data.prescriberLicense);
  line("License State", data.prescriberLicenseState);

    space(15);
  ensureSpace(55);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.text("Electronically signed by:", LEFT, y);

  y += 16;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);

  const signerName = [
    data.prescriberName,
    data.prescriberTitle
  ].filter(Boolean).join(", ");

  pdf.text(signerName, LEFT, y);

  y += 16;

  pdf.setFontSize(9);
  pdf.text(
    `Date signed (UTC): ${data.signedAt.toISOString()}`,
    LEFT,
    y
  );

  y += 16;

  pdf.setFontSize(8);
  pdf.text(
    "Electronically authenticated through ClinIQ.",
    LEFT,
    y
  );

  return Buffer.from(pdf.output("arraybuffer"));
}
