// Generates the fictional two-model equipment manuals used as this prototype's
// test fixtures: TerraDry D200 + D400 (v1), and a revised D200 (v2) with a
// changed tank-capacity spec, used to test that replacing a document changes
// the answer. Run: node scripts/generate-fixtures.mjs
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { mkdir, writeFile } from "fs/promises";

const OUT_DIR = new URL("../fixtures/", import.meta.url);
await mkdir(OUT_DIR, { recursive: true });

const PAGE_SIZE = [612, 792]; // US Letter
const MARGIN = 56;
const FONT_SIZE_BODY = 11;
const FONT_SIZE_H1 = 16;
const LINE_HEIGHT = 15;

function wrapText(text, font, size, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

async function buildManual(fileName, title, pages) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
  const maxWidth = PAGE_SIZE[0] - MARGIN * 2;

  for (const pageSpec of pages) {
    const page = doc.addPage(PAGE_SIZE);
    let y = PAGE_SIZE[1] - MARGIN;

    page.drawText(title, { x: MARGIN, y, size: 9, font, color: rgb(0.45, 0.45, 0.45) });
    y -= LINE_HEIGHT * 1.5;

    page.drawText(pageSpec.heading, { x: MARGIN, y, size: FONT_SIZE_H1, font: boldFont, color: rgb(0, 0, 0) });
    y -= LINE_HEIGHT * 1.8;

    for (const paragraph of pageSpec.body) {
      const lines = wrapText(paragraph, font, FONT_SIZE_BODY, maxWidth);
      for (const line of lines) {
        page.drawText(line, { x: MARGIN, y, size: FONT_SIZE_BODY, font, color: rgb(0.1, 0.1, 0.1) });
        y -= LINE_HEIGHT;
      }
      y -= LINE_HEIGHT * 0.5;
    }

    page.drawText(`Page ${pageSpec.pageNumber}`, {
      x: PAGE_SIZE[0] - MARGIN - 40,
      y: MARGIN - 20,
      size: 9,
      font,
      color: rgb(0.45, 0.45, 0.45),
    });
  }

  const bytes = await doc.save();
  await writeFile(new URL(fileName, OUT_DIR), bytes);
  console.log(`Wrote ${fileName} (${pages.length} pages)`);
}

// ---------------------------------------------------------------------------
// TerraDry D200 - v1
// ---------------------------------------------------------------------------
const d200TitleV1 = "TerraDry D200 Industrial Dehumidifier - User Manual";
const d200PagesV1 = [
  {
    pageNumber: 1,
    heading: "1. Overview",
    body: [
      "TerraDry D200 Industrial Dehumidifier - User Manual (Model D200, Revision 2026-A).",
      "The TerraDry D200 is a single-phase, floor-standing industrial dehumidifier intended for small to mid-sized enclosed spaces such as workshops, archives, and equipment rooms. It uses a rotary compressor with R-290 refrigerant and a washable pre-filter.",
      "This manual covers setup, operating limits, and safety exceptions for the D200. For the larger three-phase D400 model, see its separate manual.",
    ],
  },
  {
    pageNumber: 2,
    heading: "2. Setup Steps",
    body: [
      "1. Place the unit on a level, hard floor with at least 30 cm of clearance on all sides.",
      "2. Connect the unit to a grounded single-phase 220-240V, 10A outlet. Do not use an extension cord longer than 3 meters.",
      "3. Attach the supplied 12mm condensate drain hose to the rear drain port for continuous drainage, or leave the internal tank installed for manual emptying.",
      "4. Press and hold the POWER button for 2 seconds to power on.",
      "5. Select the target humidity (30 percent to 80 percent RH) using the dial and press START.",
      "The unit will begin dehumidifying within approximately 90 seconds.",
    ],
  },
  {
    pageNumber: 3,
    heading: "3. Specifications and Limits",
    body: [
      "Maximum coverage area: 45 square meters (484 sq ft) at 2.5m ceiling height.",
      "Water removal capacity: up to 20 liters per day at 30C, 80 percent RH.",
      "Internal tank capacity: 10 liters.",
      "Operating temperature range: 5C to 38C.",
      "Operating humidity range: 30 percent to 90 percent RH.",
      "Sound level: 52 dB(A) at 1 meter.",
      "Power consumption: 480W nominal.",
    ],
  },
  {
    pageNumber: 4,
    heading: "4. Exceptions and Safety",
    body: [
      "Low-Temperature Operation Exception: The D200 must not be operated in ambient temperatures below 5C under standard configuration, as this may cause the evaporator coil to frost and the compressor to stall.",
      "Exception: if the optional Low-Temperature Defrost Kit (LTK-1) is installed by a certified technician, the D200 may be operated down to -5C ambient temperature. The LTK-1 kit adds an automatic hot-gas defrost cycle every 45 minutes.",
      "Do not operate the unit outdoors or in direct rain.",
    ],
  },
];

// ---------------------------------------------------------------------------
// TerraDry D200 - v2 (revised: tank capacity increased, used for the
// replace-the-document test question)
// ---------------------------------------------------------------------------
const d200TitleV2 = "TerraDry D200 Industrial Dehumidifier - User Manual";
const d200PagesV2 = JSON.parse(JSON.stringify(d200PagesV1));
d200PagesV2[0].body[0] = "TerraDry D200 Industrial Dehumidifier - User Manual (Model D200, Revision 2027-B).";
d200PagesV2[2].body[2] = "Internal tank capacity: 13 liters (increased from 10 liters as of the 2027-B hardware revision).";

// ---------------------------------------------------------------------------
// TerraDry D400 - v1
// ---------------------------------------------------------------------------
const d400Title = "TerraDry D400 Industrial Dehumidifier - User Manual";
const d400Pages = [
  {
    pageNumber: 1,
    heading: "1. Overview",
    body: [
      "TerraDry D400 Industrial Dehumidifier - User Manual (Model D400, Revision 2026-A).",
      "The TerraDry D400 is a three-phase, floor-standing industrial dehumidifier designed for larger enclosed spaces such as warehouses, parking garages, and server rooms. It uses a scroll compressor with R-410A refrigerant and includes a built-in condensate pump.",
      "This manual covers setup, operating limits, and safety exceptions for the D400. For the smaller single-phase D200 model, see its separate manual.",
    ],
  },
  {
    pageNumber: 2,
    heading: "2. Setup Steps",
    body: [
      "1. Position the unit on a level, hard floor with at least 60 cm clearance on all sides for airflow.",
      "2. Have a licensed electrician connect the unit to a grounded three-phase 380-415V, 16A supply. A dedicated circuit breaker is required.",
      "3. Connect the built-in condensate pump's 8mm discharge tube to a drain point up to 5 meters vertically; continuous drainage is mandatory (there is no internal tank).",
      "4. Power on via the main isolator switch, then press POWER on the control panel.",
      "5. Set the target humidity (30 percent to 80 percent RH) via the touchscreen and press START.",
      "The unit performs a 3-minute self-test before beginning dehumidification.",
    ],
  },
  {
    pageNumber: 3,
    heading: "3. Specifications and Limits",
    body: [
      "Maximum coverage area: 90 square meters (969 sq ft) at 3m ceiling height.",
      "Water removal capacity: up to 55 liters per day at 30C, 80 percent RH.",
      "Drainage: continuous only via built-in condensate pump (no internal tank).",
      "Operating temperature range: 5C to 40C.",
      "Operating humidity range: 30 percent to 90 percent RH.",
      "Sound level: 58 dB(A) at 1 meter.",
      "Power consumption: 1450W nominal.",
    ],
  },
  {
    pageNumber: 4,
    heading: "4. Exceptions and Safety",
    body: [
      "The D400 has no low-temperature exception mode: it must not be operated below 5C ambient temperature under any configuration, including with third-party defrost accessories, as this will void the warranty and may damage the scroll compressor.",
      "Do not operate the unit outdoors or in direct rain. Do not connect the condensate pump to a shared drain line without a check valve.",
    ],
  },
];

await buildManual("terradry-d200-v1.pdf", d200TitleV1, d200PagesV1);
await buildManual("terradry-d200-v2-revised.pdf", d200TitleV2, d200PagesV2);
await buildManual("terradry-d400-v1.pdf", d400Title, d400Pages);

console.log("Done. Fixtures written to ./fixtures/");
