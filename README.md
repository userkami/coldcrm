# Cold CRM — Phase 1

A **$0/month** cold-calling CRM built with Next.js, React, Tailwind CSS, and Google Sheets. Agents work a lead queue one card at a time with click-to-dial links and auto-load-next-lead; managers watch live KPIs, per-agent activity, and control the queue.

**Built from the spec:** `Next.js Cold-Calling CRM Project Plan.pdf` — Phase 1, fully implemented.

---

## Features

### Agent Portal (`/agent`)
- **One lead at a time** — focused, distraction-free interface
- **Click-to-dial** — `tel:` links open the native dialer on mobile
- **Auto-load next lead** — after saving a disposition, the next lead appears instantly
- **Live stats bar** — calls today, interested, open callbacks
- **Disposition form** — outcome dropdown (7 statuses), notes textarea, callback date picker (appears only for "Callback Requested")
- **Skip button** — returns the lead to the queue without logging a call
- **My Call History** — private history of the signed-in agent's saved calls, with Today, Yesterday, Last 7 Days and inclusive custom date ranges, an outcome filter, summary totals, and paginated call details.
- **Filtered CSV export** — downloads every call matching the history filters (not just the visible page), with dates in `CRM_TIME_ZONE` (default `Asia/Karachi`). Each saved attempt is a separate row; skipped leads are excluded. Lead names, company and phone use the current lead details; outcomes, notes and callback dates come from each call's log.

### Manager Dashboard (`/manager`)
- **KPI cards** — total leads, contacted, open, conversion % (interested / contacted)
- **Calls per day chart** — last 7 days with calls/connected/interested breakdown
- **Status breakdown** — visual progress bars for all 7 statuses
- **Agent activity table** — per-agent calls, connected, interested, callbacks, open callbacks
- **Master lead table** — all leads with search, status filter, and inline edit (status/assignedTo/notes)
- **Agent admin** — add/remove agents, reset PINs, deactivate (frees their held leads)
- **CSV export** — leads and call logs with UTF-8 BOM for Excel compatibility

### Lock Engine (Zero Double-Calling Defence)
Four-layer approach to prevent the same lead from being assigned to two agents simultaneously:
1. **Append-only claim ledger** — every claim is a ledger row, no lost updates
2. **Earliest-claim-wins reconciliation** — after a settle delay, only the earliest claim proceeds
3. **Sheet-side lock token** — the winning claim writes `lockToken` + `assignedTo` + `lockTimestamp` to the lead row
4. **Disposition-time token check** — stale claims are rejected with **409** (the agent gets a new lead automatically)

See **"Honest Caveat"** below for the residual risk and Phase 2 path.

---

## Tech Stack

- **Next.js 16.4.2** (App Router, React Server Components, Turbopack)
- **React 19.3.1**
- **Tailwind CSS 4.3.3** (CSS-first with `@theme`)
- **Google Sheets API** (googleapis 187.0.0)
- **Recharts 3.10.1** (manager analytics chart)
- **Node.js 24+** (native TypeScript type-stripping)
- **Vercel** (deployment target, $0 hobby tier)

---

## Quick Start

### 1. Clone and Install

```bash
git clone <repo-url>
cd coldcrm
npm install
```

### 2. Set Up Environment

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
# Required: random secret for session cookies
AUTH_SECRET=your_random_secret_here

# Start with the memory backend (no Google setup needed)
CRM_DATA_BACKEND=memory
MEMORY_DB_PATH=.data/crm.json
```

Generate `AUTH_SECRET`:
```bash
openssl rand -base64 32
```

### 3. Seed Demo Data

```bash
npm run seed
```

This creates:
- **1 manager**: `manager@company.com` / PIN `4821`
- **3 agents**: `agent1@company.com` / `1234`, `agent2@company.com` / `2345`, `agent3@company.com` / `3456`
- **60 realistic leads** with Pakistani names, businesses, and phone numbers
- **46 call log entries** so the manager dashboard has data

### 4. Run the Dev Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and log in.

---

## Testing

```bash
# Run unit tests (queue logic, analytics, concurrency)
npm test

# Type check
npx tsc --noEmit

# Build (verifies no prerender errors)
npm run build
```

**Tests:** 29 passing (queue candidate selection, lock expiry, earliest-claim-wins, two-agent race simulation, KPI aggregation, calls-per-day bucketing with timezone correctness).

---

## Google Sheets Backend Setup

The app works with the **memory backend** (file-based JSON) out of the box. To use **Google Sheets** as the production database:

1. **Read the full setup guide:** [`scripts/setup-guide.md`](scripts/setup-guide.md)
2. **Create a Google Cloud service account** and enable the Sheets API
3. **Run the bootstrap script** to create the spreadsheet:
   ```bash
   npm run bootstrap:sheet -- --owner your.email@gmail.com
   ```
4. **Copy the `SHEET_ID`** from the output
5. **Update `.env.local`**:
   ```env
   CRM_DATA_BACKEND=sheets
   GOOGLE_CLIENT_EMAIL=your-service-account@project.iam.gserviceaccount.com
   GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   SHEET_ID=your_sheet_id_here
   ```
6. **Seed the sheet**:
   ```bash
   npm run seed:sheets
   ```
7. **Restart the dev server**

The memory and Sheets backends are **swappable** via the `LeadsRepository` interface — no UI changes needed.

---

## Deployment (Vercel)

**Quick steps:**

1. Push your code to GitHub (`.env.local` is gitignored)
2. Import the repo on [vercel.com](https://vercel.com)
3. Add environment variables in the Vercel project settings:
   - `AUTH_SECRET` (generate with `openssl rand -base64 32`)
   - `CRM_DATA_BACKEND=sheets`
   - `GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `SHEET_ID`
4. Deploy

**Full deployment guide:** [`scripts/vercel-deploy.md`](scripts/vercel-deploy.md)

The app is stateless and scales horizontally. The GitHub Actions workflow runs tests on every push, and Vercel creates preview deployments for pull requests.

---

## Honest Caveat: Google Sheets Locking

The project plan's headline promise — *"Atomic row locking engine guarantees that two agents clicking 'Get Next Lead' simultaneously will never be assigned the exact same phone number"* — **cannot be fully guaranteed by Google Sheets**.

I verified this against the Sheets v4 API reference: there is **no** `If-Match`/ETag, **no** compare-and-swap, **no** transaction primitive, and **no** lock API. Google's own `spreadsheets.batchUpdate` documentation states the sheet *"is not guaranteed to reflect exactly your changes"* and *"your changes may be altered with respect to collaborator changes."* Atomicity exists only *within a single request*.

### What the app does instead

The four-layer defence (claim ledger → earliest-claim-wins → lock token → disposition-time token check) makes a double-claim **detectable and self-correcting** instead of silent, and reduces the window to ~1 second (the `LOCK_SETTLE_MS` delay). In 8 rounds of simultaneous claims by 2 agents in the concurrency test, **zero collisions** occurred — but that's a lucky outcome, not a guarantee.

A lost race is rejected with **409 Conflict** at disposition time, and the agent gets a new lead automatically. The blast radius is contained: one agent's call is never overwritten by another's notes or status.

### Phase 2: Firestore

The **`LeadsRepository` interface** keeps the Sheets implementation swappable for Firestore, which has real atomic compare-and-swap via transactions. Firestore's free tier is also $0/month (50K reads, 20K writes per day) — enough for a small team. The Firestore migration requires zero UI changes.

This is the honest path to the plan's original guarantee. Phase 1 ships with the residual risk documented rather than hidden.

---

## Architecture

```
Browser
  ↓ fetch + httpOnly session cookie
Next.js App Router (src/app/api/*)
  ↓ lib/repo/ ← LeadsRepository interface
  ├── MemoryRepository (file-backed JSON, writeQueue for serialisation)
  └── SheetsRepository (googleapis, 5-second cache, per-request atomic batchUpdate)
  ↓
Google Sheets (4 tabs: Leads | Users | CallLogs | Claims)
```

**Session:** HMAC-signed cookie (`base64url(payload).hmacSHA256(payload, AUTH_SECRET)`), no server-side store.

**Locking:** `lib/queue.ts` (pure logic) + repository methods. `claimNextLead()` → append claim → settle delay → check earliest → write lock → confirm token survived. `logDisposition()` → check token → write + append log → close claim. Lock TTL = 5 min (env-tunable).

**Analytics:** `lib/analytics.ts` (pure aggregation over leads + call logs). Conversion = interested / contacted. Calls-per-day bucketed by local midnight (timezone-correct).

**Auth:** `lib/auth.ts` + `proxy.ts` (Next 16 renamed `middleware.ts` → `proxy.ts`). Each route re-checks the role independently of the proxy (the proxy only does the cheap optimistic redirect).

---

## Repository Structure

```
coldcrm/
├── .env.example              # All env vars documented
├── README.md                 # This file
├── proxy.ts                  # Next 16 proxy (role-based redirects)
├── scripts/
│   ├── setup-guide.md        # Google Sheets setup walkthrough
│   ├── bootstrap-sheet.mjs   # Creates spreadsheet + tabs + headers
│   └── seed-leads.mjs        # Seeds demo users + leads + call logs
└── src/
    ├── app/
    │   ├── globals.css       # Tailwind v4 CSS-first + dark theme utilities
    │   ├── layout.tsx, page.tsx (role redirect)
    │   ├── login/page.tsx
    │   ├── agent/page.tsx
    │   ├── manager/page.tsx
    │   └── api/              # Route handlers (auth, agent, manager)
    ├── components/           # React components (lead card, disposition form, KPIs, etc.)
    └── lib/
        ├── types.ts          # Domain types (Lead, User, CallLog, Claim, etc.)
        ├── status.ts         # Status validation and labels
        ├── phone.ts          # Phone sanitisation and tel: link builder
        ├── queue.ts          # Pure claim/selection logic (unit-tested)
        ├── analytics.ts      # Pure KPI aggregation (unit-tested)
        ├── auth.ts, session.ts
        └── repo/
            ├── types.ts      # LeadsRepository interface
            ├── index.ts      # Factory: CRM_DATA_BACKEND=sheets|memory
            ├── sheets.ts     # SheetsRepository
            └── memory.ts     # MemoryRepository
```

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the dev server (Turbopack) |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm test` | Run unit tests (`node --test`) |
| `npm run seed` | Seed memory backend with demo data |
| `npm run seed:sheets` | Seed Google Sheets backend |
| `npm run bootstrap:sheet` | Create a new Google Sheets spreadsheet |

---

## Environment Variables

See [`.env.example`](.env.example) for the full list with descriptions. Key vars:

- **`AUTH_SECRET`** (required) — random secret for session cookies
- **`CRM_DATA_BACKEND`** — `memory` or `sheets`
- **`MEMORY_DB_PATH`** — path to JSON file (default `.data/crm.json`)
- **`CRM_TIME_ZONE`** — IANA business timezone for agent daily totals, history filters, displayed times and exports (default `Asia/Karachi`)
- **`SHEET_ID`** — Google Sheets spreadsheet ID
- **`GOOGLE_CLIENT_EMAIL`** — service account email
- **`GOOGLE_PRIVATE_KEY`** — service account private key (with `\n` sequences)
- **`LOCK_TTL_SECONDS`** — lock expiry (default 300)
- **`LOCK_SETTLE_MS`** — claim settle delay (default 1200)
- **`SHEET_CACHE_TTL_MS`** — Sheets read cache (default 5000)

---

## Next.js 16 Breaking Changes

This app uses **Next.js 16.4.2**, which has breaking changes from Next 15:

- **`cookies()` / `headers()` are async** — must `await cookies()` everywhere (sync access removed)
- **`params` / `searchParams` are Promises** — must `await params` in page components
- **`middleware.ts` renamed to `proxy.ts`** — and only Node runtime is supported (not `edge`)
- **`next lint` removed** — use the ESLint CLI directly
- **Turbopack is the default** for dev *and* build — custom `webpack` configs fail the build
- **Cache Components enabled by default** — pages reading cookies need `export const instant = false`

The app is written for Next 16 — porting it to Next 15 requires reversing these changes.

---

## License

MIT

---

## Credits

Built with [Next.js](https://nextjs.org), [Tailwind CSS](https://tailwindcss.com), [Recharts](https://recharts.org), and the [Google Sheets API](https://developers.google.com/sheets/api).

Spec: `Next.js Cold-Calling CRM Project Plan.pdf` — Phase 1.

---

## Screenshots

### Login
![Login page](public/screenshots/01-login.png)

### Agent Portal
![Agent portal with lead card](public/screenshots/02-agent.png)

### Manager Dashboard
![Manager dashboard with KPIs and chart](public/screenshots/04-manager-kpis.png)

---

**Ready to deploy.** The app is fully functional with the memory backend today, and production-ready with the Sheets backend after following [`scripts/setup-guide.md`](scripts/setup-guide.md).
