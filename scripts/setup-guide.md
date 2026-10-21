# Setup Guide — Google Sheets Backend

This guide walks you through setting up the Google Sheets backend for the Cold CRM. The app works with the **memory backend** (file-based JSON) out of the box for development and testing — this setup is only needed when you want to use Google Sheets as the production database.

---

## Prerequisites

- A Google account
- Node.js 24+ and npm installed
- The Cold CRM codebase

---

## Step 1: Create a Google Cloud Service Account

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select an existing one)
3. Enable the **Google Sheets API**:
   - Go to **APIs & Services** → **Library**
   - Search for "Google Sheets API"
   - Click **Enable**
4. Create a service account:
   - Go to **APIs & Services** → **Credentials**
   - Click **Create Credentials** → **Service Account**
   - Give it a name (e.g., "cold-crm-service-account")
   - Click **Create and Continue**
   - Skip the optional steps (no roles needed for a private sheet you'll explicitly share)
   - Click **Done**
5. Create a JSON key:
   - Find your new service account in the list
   - Click the **︙** menu → **Manage keys**
   - Click **Add Key** → **Create new key**
   - Choose **JSON**
   - Click **Create** — the key file downloads automatically
6. **Keep the JSON key file safe** — it's the only copy. You'll need two values from it:
   - `client_email` (looks like `cold-crm-service-account@project-id.iam.gserviceaccount.com`)
   - `private_key` (a long string starting with `-----BEGIN PRIVATE KEY-----`)

---

## Step 2: Set Up Environment Variables

1. Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```

2. Open `.env.local` and set:
   ```env
   # Required: random secret for session cookies (generate with: openssl rand -base64 32)
   AUTH_SECRET=your_random_secret_here

   # Backend selection
   CRM_DATA_BACKEND=sheets

   # Google Sheets credentials (from the JSON key file)
   GOOGLE_CLIENT_EMAIL=cold-crm-service-account@project-id.iam.gserviceaccount.com
   GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n"

   # Sheet ID (you'll get this in Step 3)
   SHEET_ID=your_spreadsheet_id_here
   ```

   **Important:** The `GOOGLE_PRIVATE_KEY` must keep the literal `\n` sequences. If you're pasting it into a `.env` file, wrap it in double quotes. The app replaces `\\n` with actual newlines at runtime.

---

## Step 3: Create the Spreadsheet

Run the bootstrap script to create the spreadsheet and its tabs:

```bash
npm run bootstrap:sheet -- --owner your.email@gmail.com
```

Replace `your.email@gmail.com` with your Google account email. This script will:
- Create a new spreadsheet
- Add 4 tabs: `Leads`, `Users`, `CallLogs`, `Claims`
- Write the header rows
- Freeze row 1 in each tab
- Share the spreadsheet with your email (as Editor) and the service account (as Writer)
- Print the `SHEET_ID` you need for `.env.local`

**Copy the `SHEET_ID` from the output** and paste it into your `.env.local` file.

---

## Step 4: Seed Demo Data

Run the seed script to populate the sheet with demo users and leads:

```bash
npm run seed:sheets
```

This creates:
- **1 manager**: `manager@company.com` / PIN `4821`
- **3 agents**: `agent1@company.com` / `1234`, `agent2@company.com` / `2345`, `agent3@company.com` / `3456`
- **60 realistic leads** with Pakistani names, businesses, and phone numbers
- **46 call log entries** so the manager analytics have data

---

## Step 5: Run the App

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Log in as a manager or agent using the credentials above.

---

## Troubleshooting

**"Cannot read properties of undefined (reading 'spreadsheets')"**
- The `GOOGLE_PRIVATE_KEY` is not being parsed correctly. Make sure it's wrapped in double quotes in `.env.local` and includes the literal `\n` sequences (not actual line breaks).

**"Requested entity was not found."**
- The `SHEET_ID` is wrong or the service account doesn't have access. Re-run the bootstrap script with `--owner` and copy the correct ID.

**"The caller does not have permission"**
- The sheet exists but wasn't shared with the service account. Open the sheet in Google Sheets, click **Share**, and add the `GOOGLE_CLIENT_EMAIL` with Editor access.

**"Quota exceeded"**
- You hit the Google Sheets API rate limit (300 requests/min/project, 60 req/min/user). Wait a minute and try again. The app caches reads for 5 seconds to reduce quota usage.

---

## Manual Spreadsheet Setup (Alternative to Step 3)

If you prefer to create the spreadsheet manually instead of using the bootstrap script:

1. Create a new Google Sheets spreadsheet
2. Rename the first sheet to `Leads` and add these exact headers in row 1:
   ```
   id | name | phone | status | assignedTo | lockTimestamp | notes | callbackDate | lastCalledBy | lastCalledAt | company | city | source | lockToken
   ```
3. Create a second sheet named `Users` with these headers:
   ```
   email | name | pin | role | active
   ```
4. Create a third sheet named `CallLogs` with these headers:
   ```
   timestamp | leadId | agentEmail | agentName | status | notes | callbackDate
   ```
5. Create a fourth sheet named `Claims` with these headers:
   ```
   claimId | leadId | agentEmail | claimedAt | closedAt | outcome
   ```
6. Freeze row 1 in each sheet (View → Freeze → 1 row)
7. Click **Share** and add the `GOOGLE_CLIENT_EMAIL` from your service account JSON key with **Editor** access
8. Copy the spreadsheet ID from the URL:
   ```
   https://docs.google.com/spreadsheets/d/1a2b3c4d5e6f7g8h9i0/edit
                                           ^^^^^^^^^^^^^^^^^^^^
                                           This is your SHEET_ID
   ```
9. Add the `SHEET_ID` to `.env.local`
10. Run `npm run seed:sheets` to populate it with demo data

---

## Production Deployment (Vercel)

1. Push your code to GitHub (without the `.env.local` file — it's gitignored)
2. Go to [vercel.com](https://vercel.com) and import your repository
3. In the Vercel project settings, add the environment variables:
   - `AUTH_SECRET`
   - `CRM_DATA_BACKEND=sheets`
   - `GOOGLE_CLIENT_EMAIL`
   - `GOOGLE_PRIVATE_KEY` (paste the full key with `\n` sequences)
   - `SHEET_ID`
4. Deploy

The app is stateless and scales horizontally. Each deployment reads from the same Google Sheet.

---

## Security Notes

- The service account JSON key is a **private credential**. Never commit it to git or share it publicly.
- The `AUTH_SECRET` must be a strong random value in production. Generate it with `openssl rand -base64 32`.
- Agent PINs are stored in plaintext in the `Users` sheet (protected by service-account-only access). To hash them, add a hashing library and update `src/lib/auth.ts`.
- The spreadsheet is private to the service account and the `--owner` you specified. Anyone you share it with can read/write all data, including PINs.

---

## Switching Between Memory and Sheets

The app supports both backends without code changes:

**Memory backend** (default, file-based JSON):
```env
CRM_DATA_BACKEND=memory
MEMORY_DB_PATH=.data/crm.json
```

**Sheets backend**:
```env
CRM_DATA_BACKEND=sheets
GOOGLE_CLIENT_EMAIL=...
GOOGLE_PRIVATE_KEY=...
SHEET_ID=...
```

All tests run against the memory backend. The Sheets backend is for production or when you want to inspect/edit data in Google Sheets.

---

## Phase 2: Firestore Migration

The app's `LeadsRepository` interface means the backend is swappable. To eliminate the residual double-claim risk (Google Sheets has no transactions), Phase 2 will add a Firestore implementation with real atomic compare-and-swap. Firestore's free tier is also $0/month up to 50K reads/20K writes per day — more than enough for a small team.

The Firestore migration requires:
1. A new `FirestoreRepository` class implementing `LeadsRepository`
2. Firestore service account credentials (similar setup to Sheets)
3. Zero UI changes — the repository pattern keeps the frontend untouched

This is documented in the plan but not yet implemented.
