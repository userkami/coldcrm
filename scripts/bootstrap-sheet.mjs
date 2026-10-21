/**
 * Create the Google Sheet the CRM reads and writes.
 *
 *   node scripts/bootstrap-sheet.mjs --title "Cold CRM Leads" --owner you@company.com
 *
 * Creates a spreadsheet with the four tabs this app expects, writes the
 * header row of each, and shares the file with the service account (and with
 * you, if --owner is given).
 *
 * A spreadsheet created by a service account is owned by that service account
 * and lands in the service account's own Drive storage, so it is invisible
 * until it is shared. That is why this script always shares it.
 */
import process from "node:process";

const TABS = [
  {
    title: "Leads",
    headers: [
      "id", "name", "phone", "status", "assignedTo", "lockTimestamp", "notes",
      "callbackDate", "lastCalledBy", "lastCalledAt", "company", "city",
      "source", "lockToken",
    ],
  },
  { title: "Users", headers: ["email", "name", "pin", "role", "active"] },
  {
    title: "CallLogs",
    headers: [
      "timestamp", "leadId", "agentEmail", "agentName", "status", "notes",
      "callbackDate",
    ],
  },
  {
    title: "Claims",
    headers: [
      "claimId", "leadId", "agentEmail", "claimedAt", "closedAt", "outcome",
    ],
  },
];

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1 || index === process.argv.length - 1) return fallback;
  return process.argv[index + 1];
}

const { google } = await import("googleapis");

function makeAuth() {
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = (process.env.GOOGLE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
  if (!clientEmail || !privateKey) {
    throw new Error(
      "GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY must be set. See scripts/setup-guide.md.",
    );
  }
  const auth = new google.auth.GoogleAuth({
    credentials: { client_email: clientEmail, private_key: privateKey },
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive",
    ],
  });
  return auth;
}

const title = arg("title", "Cold CRM Leads");
const owner = arg("owner", null);
const existingId = arg("spreadsheet-id", null);

const auth = makeAuth();
const sheets = google.sheets({ version: "v4", auth });
const drive = google.drive({ version: "v3", auth });

let spreadsheetId = existingId;

if (!spreadsheetId) {
  console.log(`Creating spreadsheet "${title}"…`);
  const created = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title },
      sheets: [{ properties: { title: TABS[0].title } }],
    },
  });
  spreadsheetId = created.data.spreadsheetId;
  console.log(`Created: ${spreadsheetId}`);

  // Add the remaining tabs.
  const requests = TABS.slice(1).map((tab, index) => ({
    addSheet: { properties: { title: tab.title, index: index + 1 } },
  }));
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests },
  });
  console.log("Tabs created.");
}

// Write the header row of every tab.
for (const tab of TABS) {
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${tab.title}'!A1`,
    valueInputOption: "RAW",
    requestBody: { values: [tab.headers] },
  });
  console.log(`Header written to ${tab.title}`);
}

// Freeze the header row so it stays visible while scrolling.
{
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const requests = [];
  for (const sheet of meta.data.sheets ?? []) {
    const title = sheet.properties?.title;
    if (!TABS.some((t) => t.title === title)) continue;
    requests.push({
      updateSheetProperties: {
        properties: {
          sheetId: sheet.properties.sheetId,
          gridProperties: { frozenRowCount: 1 },
        },
        fields: "gridProperties.frozenRowCount",
      },
    });
  }
  if (requests.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests },
    });
    console.log("Header rows frozen.");
  }
}

// Share with the service account so the app can read and write.
const saEmail = process.env.GOOGLE_CLIENT_EMAIL;
if (saEmail) {
  const existing = await drive.permissions.list({
    fileId: spreadsheetId,
    fields: "permissions(id,emailAddress,role)",
  });
  const already = (existing.data.permissions ?? []).some(
    (p) => p.emailAddress === saEmail,
  );
  if (!already) {
    await drive.permissions.create({
      fileId: spreadsheetId,
      sendNotificationEmail: false,
      requestBody: { type: "user", role: "writer", emailAddress: saEmail },
      fields: "id",
    });
    console.log(`Shared with service account ${saEmail}`);
  } else {
    console.log("Service account already has access.");
  }
}

// Share with a human owner so the sheet is visible in their Drive.
if (owner) {
  const existing = await drive.permissions.list({
    fileId: spreadsheetId,
    fields: "permissions(id,emailAddress,role)",
  });
  const already = (existing.data.permissions ?? []).some(
    (p) => p.emailAddress === owner,
  );
  if (!already) {
    await drive.permissions.create({
      fileId: spreadsheetId,
      sendNotificationEmail: true,
      requestBody: { type: "user", role: "writer", emailAddress: owner },
      fields: "id",
    });
    console.log(`Shared with ${owner}`);
  } else {
    console.log(`${owner} already has access.`);
  }
}

console.log("");
console.log("Done. Add this to your .env.local:");
console.log("");
console.log(`  SHEET_ID=${spreadsheetId}`);
console.log("");
console.log(`Open: https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`);
