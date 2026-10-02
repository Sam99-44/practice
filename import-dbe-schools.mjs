import "dotenv/config";
import mongoose from "mongoose";
import * as XLSX from "xlsx";
import fs from "fs";
import path from "path";

const inputPath = process.argv[2] || process.env.DBE_MASTERLIST_FILE || "";

if (!process.env.MONGO_URI) {
  console.error("Missing MONGO_URI.");
  process.exit(1);
}

if (!inputPath) {
  console.error(
    "Provide the DBE National Ordinary Schools XLSX/CSV file path.\n" +
    "Example: node import-dbe-schools.mjs ./National-Ordinary-Schools.xlsx"
  );
  process.exit(1);
}

if (!fs.existsSync(inputPath)) {
  console.error(`File not found: ${inputPath}`);
  process.exit(1);
}

const SchoolDirectorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    normalizedName: { type: String, required: true, trim: true, index: true },
    province: { type: String, default: "", trim: true, index: true },
    district: { type: String, default: "", trim: true, index: true },

    emisNumber: { type: String, default: "", trim: true, index: true },
    status: { type: String, default: "", trim: true },
    sector: { type: String, default: "", trim: true },
    phase: { type: String, default: "", trim: true },
    townCity: { type: String, default: "", trim: true },

    normalizedKey: { type: String, required: true, unique: true, index: true },

    source: {
      type: String,
      enum: ["registration", "oauth", "existing_user", "admin", "official_import"],
      default: "official_import",
      index: true,
    },

    masterlistYear: { type: Number, default: null },
    masterlistQuarter: { type: Number, default: null },
    lastOfficialImportAt: { type: Date, default: null },

    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

const SchoolDirectory =
  mongoose.models.SchoolDirectory ||
  mongoose.model("SchoolDirectory", SchoolDirectorySchema);

function clean(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function keyPart(value) {
  return clean(value)
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedColumnName(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function rowValue(row, aliases) {
  const wanted = new Set(aliases.map(normalizedColumnName));

  for (const [key, value] of Object.entries(row || {})) {
    if (wanted.has(normalizedColumnName(key))) {
      return value;
    }
  }

  return "";
}

function normalizeProvince(value) {
  const raw = clean(value);

  const numericMap = {
    "1": "Western Cape",
    "2": "Eastern Cape",
    "3": "Northern Cape",
    "4": "Free State",
    "5": "KwaZulu-Natal",
    "6": "North West",
    "7": "Gauteng",
    "8": "Mpumalanga",
    "9": "Limpopo",
  };

  if (numericMap[raw]) return numericMap[raw];

  const withoutPrefix = raw.replace(/^\d+\s*[.)-]?\s*/, "").trim();
  const canonical = {
    "western cape": "Western Cape",
    "eastern cape": "Eastern Cape",
    "northern cape": "Northern Cape",
    "free state": "Free State",
    "kwazulu natal": "KwaZulu-Natal",
    "kwazulu-natal": "KwaZulu-Natal",
    "kzn": "KwaZulu-Natal",
    "north west": "North West",
    "gauteng": "Gauteng",
    "mpumalanga": "Mpumalanga",
    "limpopo": "Limpopo",
  };

  return canonical[withoutPrefix.toLowerCase()] || withoutPrefix;
}

function buildKey({ emisNumber, name, province, district }) {
  const emis = clean(emisNumber);

  // EMIS number is the best stable official identifier when present.
  if (emis) return `emis:${emis}`;

  // Fallback for any row without an EMIS number.
  return [
    "school",
    keyPart(name),
    keyPart(province),
    keyPart(district),
  ].join("|");
}

function inferYear(row) {
  const value = Number(
    rowValue(row, ["DataYear", "Data Year", "Year"])
  );
  return Number.isInteger(value) ? value : null;
}

function inferQuarter(row) {
  const value = Number(
    rowValue(row, ["Quarter", "DataQuarter", "Data Quarter"])
  );
  return Number.isInteger(value) && value >= 1 && value <= 4 ? value : null;
}

const workbook = XLSX.readFile(path.resolve(inputPath), {
  cellDates: false,
  raw: false,
});

if (!workbook.SheetNames.length) {
  throw new Error("The DBE workbook contains no sheets.");
}

/*
 * DBE national workbooks generally contain one main data sheet.
 * If there are several sheets, combine all sheets that contain school rows.
 */
const rows = [];

for (const sheetName of workbook.SheetNames) {
  const sheet = workbook.Sheets[sheetName];
  const sheetRows = XLSX.utils.sheet_to_json(sheet, {
    defval: "",
    raw: false,
  });

  for (const row of sheetRows) {
    const name = clean(
      rowValue(row, [
        "Institution_Name",
        "Institution Name",
        "Official_Institution_Name",
        "Official Institution Name",
        "School Name",
        "School_Name",
        "Name of School",
      ])
    );

    if (!name) continue;

    rows.push(row);
  }
}

if (!rows.length) {
  throw new Error(
    "No school rows were detected. Check that this is the DBE National Ordinary Schools file."
  );
}

await mongoose.connect(process.env.MONGO_URI);
console.log("MongoDB connected.");

const importStartedAt = new Date();
let processed = 0;
let upserted = 0;
let modified = 0;
let skipped = 0;

const batch = [];
const BATCH_SIZE = 500;

async function flushBatch() {
  if (!batch.length) return;

  const result = await SchoolDirectory.bulkWrite(batch.splice(0), {
    ordered: false,
  });

  upserted += result.upsertedCount || 0;
  modified += result.modifiedCount || 0;
}

for (const row of rows) {
  const name = clean(
    rowValue(row, [
      "Institution_Name",
      "Institution Name",
      "Official_Institution_Name",
      "Official Institution Name",
      "School Name",
      "School_Name",
      "Name of School",
    ])
  );

  const emisNumber = clean(
    rowValue(row, [
      "NatEmis",
      "Nat Emis",
      "National EMIS Number",
      "NationalEMISNumber",
      "EMIS",
      "EMIS Number",
    ])
  );

  const province = normalizeProvince(
    rowValue(row, ["Province"])
  );

  const district = clean(
    rowValue(row, [
      "EIDistrict",
      "EI District",
      "Educational District",
      "Education District",
      "District",
    ])
  );

  if (!name || !province) {
    skipped += 1;
    continue;
  }

  const status = clean(
    rowValue(row, ["DoE_Status", "DoE Status", "Status"])
  );

  const sector = clean(
    rowValue(row, ["Sector"])
  );

  const phase = clean(
    rowValue(row, ["Phase_PED", "Phase PED", "Phase", "School Phase"])
  );

  const townCity = clean(
    rowValue(row, ["Town_City", "Town City", "Town/City", "Town", "City"])
  );

  const normalizedKey = buildKey({
    emisNumber,
    name,
    province,
    district,
  });

  batch.push({
    updateOne: {
      filter: { normalizedKey },
      update: {
        $set: {
          name,
          normalizedName: keyPart(name),
          province,
          district,
          emisNumber,
          status,
          sector,
          phase,
          townCity,
          normalizedKey,
          source: "official_import",
          masterlistYear: inferYear(row),
          masterlistQuarter: inferQuarter(row),
          lastOfficialImportAt: importStartedAt,
          active: !/closed|inactive/i.test(status),
        },
      },
      upsert: true,
    },
  });

  processed += 1;

  if (batch.length >= BATCH_SIZE) {
    await flushBatch();
    process.stdout.write(`\rProcessed ${processed} schools...`);
  }
}

await flushBatch();

/*
 * Mark official schools that were present in an older official import but were
 * not seen in the current file as inactive. User-added schools are untouched.
 */
const staleResult = await SchoolDirectory.updateMany(
  {
    source: "official_import",
    $or: [
      { lastOfficialImportAt: { $lt: importStartedAt } },
      { lastOfficialImportAt: null },
      { lastOfficialImportAt: { $exists: false } },
    ],
  },
  {
    $set: { active: false },
  }
);

console.log("\n");
console.log("DBE school masterlist import complete.");
console.log({
  inputFile: path.resolve(inputPath),
  workbookSheets: workbook.SheetNames,
  rowsDetected: rows.length,
  processed,
  skipped,
  upserted,
  modified,
  staleOfficialSchoolsDeactivated: staleResult.modifiedCount || 0,
});

await mongoose.disconnect();
