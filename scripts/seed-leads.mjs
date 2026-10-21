/**
 * Seed the CRM with demo users and leads.
 *
 * Works against either backend:
 *   node scripts/seed-leads.mjs              # memory backend (.data/crm.json)
 *   npm run seed:sheets                       # the Google Sheet
 *
 * Run scripts/bootstrap-sheet.mjs first if you are targeting Sheets.
 *
 * The Sheets backend imports "server-only", which is a marker package that
 * throws unless the "react-server" export condition is active. Next.js sets
 * that condition for React Server Components; a plain node process does not,
 * so `npm run seed:sheets` passes --conditions=react-server.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

// ---- Environment -----------------------------------------------------------

// The app reads its configuration from .env.local (Next.js loads it
// automatically), but a plain `node scripts/seed-leads.mjs` does not. Load it
// here so `npm run seed:sheets` finds the same SHEET_ID and service-account
// credentials the app uses. Values already present in the environment win, so
// `SHEET_ID=... npm run seed:sheets` still overrides the file.
try {
  process.loadEnvFile(".env.local");
} catch (error) {
  // A missing .env.local is fine — the environment may still supply
  // everything it needs. A malformed one is not, and should be reported
  // rather than swallowed into a confusing "SHEET_ID is required" later.
  if (error?.code !== "ENOENT") throw error;
}

// ---- Config ----------------------------------------------------------------

const USERS = [
  {
    email: "manager@company.com",
    name: "Sana Manager",
    pin: "4821",
    role: "MANAGER",
    active: true,
  },
  {
    email: "agent1@company.com",
    name: "Bilal Ahmed",
    pin: "1234",
    role: "AGENT",
    active: true,
  },
  {
    email: "agent2@company.com",
    name: "Ayesha Khan",
    pin: "2345",
    role: "AGENT",
    active: true,
  },
  {
    email: "agent3@company.com",
    name: "Usman Tariq",
    pin: "3456",
    role: "AGENT",
    active: true,
  },
];

const FIRST_NAMES = [
  "Imran", "Fatima", "Ali", "Zainab", "Hassan", "Maryam", "Bilal", "Hina",
  "Adnan", "Sadia", "Kashif", "Rabia", "Faisal", "Nimra", "Omar", "Sana",
  "Tariq", "Amna", "Junaid", "Areeba", "Shahid", "Iqra", "Naveed", "Sadia",
  "Waqas", "Nazia", "Danish", "Mahnoor", "Salman", "Farah", "Asif", "Bushra",
  "Rizwan", "Uzma", "Yasir", "Hafsa", "Kashif", "Sobia", "Zeeshan", "Anila",
  "Noman", "Mehwish", "Ahsan", "Sana", "Rehan", "Talha", "Kirana", "Faizan",
  "Hina", "Nadeem", "Saima", "Arif", "Rukhsana", "Wajid", "Shazia", "Imran",
  "Nadia", "Shafiq", "Lubna", "Tanveer", "Anwar",
];

const LAST_NAMES = [
  "Raza", "Iqbal", "Hussain", "Malik", "Sheikh", "Butt", "Chaudhry", "Gill",
  "Nawaz", "Qureshi", "Farooq", "Javed", "Aslam", "Majeed", "Sattar", "Yousuf",
  "Hashmi", "Rashid", "Siddiqui", "Abbasi",
];

const COMPANIES = [
  "Al-Madina Traders", "Shaheen Textiles", "Daraz Wholesale", "Noor Foods",
  "Crescent Pharma", "Falcon Logistics", "Bright Future Academy",
  "Sunrise Auto Parts", "Green Valley Farms", "Metro Electronics",
  "Star Bakery", "Cobalt Software", "Peak Construction", "Silk Route Exports",
  "Modern Furniture", "Zam Zam Restaurant", "Nishat Ceramics", "Gulberg Motors",
  "Indus Packaging", "Royal Print Works",
];

const CITIES = [
  "Karachi", "Lahore", "Islamabad", "Rawalpindi", "Faisalabad", "Multan",
  "Peshawar", "Quetta", "Sialkot", "Gujranwala", "Hyderabad", "Sukkur",
  "Abbottabad", "Bahawalpur", "Sargodha", "Mardan",
];

const SOURCES = [
  "Facebook Lead Form", "Website Chat", "Referral", "Exhibition",
  "Cold Call", "Instagram", "Local Chamber", "Google Maps",
];

// Outcomes for a portion of the seeded leads, so the dashboard has
// something to show before anyone dials.
const PAST_OUTCOMES = [
  { status: "Connected - Interested", weight: 3 },
  { status: "Connected - Not Interested", weight: 4 },
  { status: "No Answer", weight: 5 },
  { status: "Callback Requested", weight: 2 },
  { status: "Wrong Number", weight: 1 },
];

const OUTCOME_POOL = PAST_OUTCOMES.flatMap((o) =>
  Array(o.weight).fill(o.status),
);

const LEAD_COUNT = Number(process.env.SEED_LEAD_COUNT ?? 60);

// ---- Helpers ---------------------------------------------------------------

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function randomPhone() {
  // Pakistani mobile numbers in the +9230xxxxxxxxx format.
  const prefix = pick(["300", "301", "302", "303", "304", "305", "306", "307", "308", "309"]);
  const rest = String(Math.floor(Math.random() * 100000000)).padStart(8, "0");
  return `+92${prefix}${rest}`;
}

function isoDaysAgo(days, hour = 10, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function buildLeads() {
  const leads = [];
  const agents = USERS.filter((u) => u.role === "AGENT");

  for (let i = 0; i < LEAD_COUNT; i++) {
    const first = pick(FIRST_NAMES);
    const last = pick(LAST_NAMES);
    const name = `${first} ${last}`;
    const id = `lead_${1001 + i}`;

    // Roughly a third of the seeded leads carry a prior outcome so the
    // manager dashboard has real numbers on first load.
    const hasHistory = Math.random() < 0.35;
    const status = hasHistory ? pick(OUTCOME_POOL) : "New";

    const lead = {
      id,
      name,
      phone: randomPhone(),
      status,
      assignedTo: "",
      lockTimestamp: "",
      notes: hasHistory ? "Seeded sample record." : "",
      callbackDate:
        status === "Callback Requested" ? isoDaysAgo(-3, 11, 0) : "",
      lastCalledBy: hasHistory ? pick(agents).email : "",
      lastCalledAt: hasHistory ? isoDaysAgo(Math.floor(Math.random() * 6), 11) : "",
      company: pick(COMPANIES),
      city: pick(CITIES),
      source: pick(SOURCES),
      lockToken: "",
    };

    leads.push(lead);
  }

  return leads;
}

function buildCallLogs(leads) {
  const logs = [];
  const agents = USERS.filter((u) => u.role === "AGENT");

  for (const lead of leads) {
    if (!lead.lastCalledAt) continue;
    logs.push({
      timestamp: lead.lastCalledAt,
      leadId: lead.id,
      agentEmail: lead.lastCalledBy,
      agentName: agents.find((a) => a.email === lead.lastCalledBy)?.name ?? "Agent",
      status: lead.status,
      notes: lead.notes,
      callbackDate: lead.callbackDate,
    });
  }

  // A few extra calls on the same leads, so "calls today" is larger than
  // the number of distinct leads touched — which is the whole reason the
  // CallLogs tab exists.
  const extra = Math.floor(leads.length * 0.4);
  for (let i = 0; i < extra; i++) {
    const lead = pick(leads);
    const agent = pick(agents);
    logs.push({
      timestamp: isoDaysAgo(Math.floor(Math.random() * 6), 9 + Math.floor(Math.random() * 8)),
      leadId: lead.id,
      agentEmail: agent.email,
      agentName: agent.name,
      status: pick(OUTCOME_POOL),
      notes: "Seeded sample call.",
      callbackDate: "",
    });
  }

  return logs.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

// ---- Backends --------------------------------------------------------------

async function seedMemory() {
  const file =
    process.env.MEMORY_DB_PATH ?? path.join(process.cwd(), ".data", "crm.json");
  const leads = buildLeads();
  const db = {
    leads,
    users: USERS,
    callLogs: buildCallLogs(leads),
    claims: [],
  };

  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(db, null, 2), "utf8");
  console.log(`Seeded ${leads.length} leads and ${USERS.length} users -> ${file}`);
}

async function seedSheets() {
  const spreadsheetId = process.env.SHEET_ID;
  if (!spreadsheetId) {
    throw new Error("SHEET_ID is required. See scripts/setup-guide.md.");
  }

  const { google } = await import("googleapis");
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: (process.env.GOOGLE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
    },
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive",
    ],
  });
  const sheets = google.sheets({ version: "v4", auth });

  const leads = buildLeads();
  const logs = buildCallLogs(leads);

  console.log(`Writing ${leads.length} leads and ${USERS.length} users to the sheet…`);

  // Users: the repository's upsert handles add-or-update per email.
  //
  // The repository is TypeScript with extensionless relative imports, which
  // Node's own resolver rejects. The test runner handles this with a
  // resolver hook (scripts/ts-resolver.mjs); the same hook is loaded here so
  // the seed script and the tests resolve modules identically.
  await import("./ts-resolver.mjs");
  const { SheetsRepository } = await import("../src/lib/repo/sheets.ts");
  const repo = new SheetsRepository(spreadsheetId, 0);
  for (const user of USERS) {
    await repo.upsertUser(user);
  }

  // Leads: a bulk write is far faster than one call per row, and seeding is
  // a one-off where concurrent writers are not a concern.
  const leadRows = leads.map((l) => [
    l.id, l.name, l.phone, l.status, l.assignedTo, l.lockTimestamp, l.notes,
    l.callbackDate, l.lastCalledBy, l.lastCalledAt, l.company, l.city, l.source,
    l.lockToken,
  ]);

  // Clear the data rows only. Row 1 is the header the app reads to map
  // columns, and the repository skips the first row when it lists records —
  // wiping the header would both break every read and make the app treat the
  // first seeded lead as a header, silently losing it.
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: "'Leads'!A2:N",
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "'Leads'!A2",
    valueInputOption: "RAW",
    requestBody: { values: leadRows },
  });

  const logRows = logs.map((l) => [
    l.timestamp, l.leadId, l.agentEmail, l.agentName, l.status, l.notes, l.callbackDate,
  ]);
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: "'CallLogs'!A2:G",
  });
  if (logRows.length > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: "'CallLogs'!A2",
      valueInputOption: "RAW",
      requestBody: { values: logRows },
    });
  }

  // The claims ledger is append-only; clearing it resets the lock history.
  // The header row stays put, same as above.
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: "'Claims'!A2:F",
  });

  console.log("Seed complete.");
}

// ---- Entry point -----------------------------------------------------------

const useSheets = process.argv.includes("--sheets");
try {
  if (useSheets) await seedSheets();
  else await seedMemory();
} catch (error) {
  console.error("Seed failed:", error.message ?? error);
  process.exit(1);
}
