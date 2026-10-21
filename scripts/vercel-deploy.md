# Deploying to Vercel

This guide covers deploying the Cold CRM to Vercel's free hobby tier.

---

## Prerequisites

- A [Vercel account](https://vercel.com/signup) (free)
- Your GitHub repository pushed to GitHub
- For Google Sheets backend: service account credentials (see [`setup-guide.md`](setup-guide.md))

---

## Quick Deploy

### Option 1: Deploy from GitHub (Recommended)

1. **Go to Vercel:** https://vercel.com/new

2. **Import your repository:**
   - Click "Add New" → "Project"
   - Select "Import Git Repository"
   - Choose your GitHub account and select the `coldcrm` repository
   - Click "Import"

3. **Configure the project:**
   - Framework Preset: **Next.js** (auto-detected)
   - Root Directory: `./` (leave default)
   - Build Command: `npm run build` (auto-detected)
   - Output Directory: `.next` (auto-detected)

4. **Add environment variables:**
   Click "Environment Variables" and add:

   **Required:**
   ```
   AUTH_SECRET = <paste output of: openssl rand -base64 32>
   CRM_DATA_BACKEND = sheets
   ```

   **For Google Sheets backend:**
   ```
   GOOGLE_CLIENT_EMAIL = your-service-account@project.iam.gserviceaccount.com
   GOOGLE_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   SHEET_ID = your_spreadsheet_id
   ```

   **Optional (defaults are fine):**
   ```
   LOCK_TTL_SECONDS = 300
   LOCK_SETTLE_MS = 1200
   SHEET_CACHE_TTL_MS = 5000
   ```

5. **Deploy:**
   - Click "Deploy"
   - Vercel will build and deploy your app (~2 minutes)
   - You'll get a live URL: `https://coldcrm.vercel.app` (or similar)

### Option 2: Deploy with Vercel CLI

```bash
# Install Vercel CLI globally
npm i -g vercel

# Login to Vercel
vercel login

# Deploy (first time)
cd "D:/Bin Suleman/coldcrm"
vercel

# Follow the prompts:
# - Set up and deploy? Yes
# - Which scope? (select your account)
# - Link to existing project? No
# - Project name? coldcrm
# - Directory? ./
# - Override settings? No

# Add environment variables
vercel env add AUTH_SECRET
vercel env add CRM_DATA_BACKEND
vercel env add GOOGLE_CLIENT_EMAIL
vercel env add GOOGLE_PRIVATE_KEY
vercel env add SHEET_ID

# Deploy to production
vercel --prod
```

---

## Important Notes

### Google Sheets Private Key

When pasting `GOOGLE_PRIVATE_KEY` into Vercel's environment variable field:

- **Keep the literal `\n` sequences** (don't convert them to actual newlines)
- Wrap the entire value in double quotes
- Example:
  ```
  "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n"
  ```

### Memory Backend on Vercel

**Don't use `CRM_DATA_BACKEND=memory` in production on Vercel.** Vercel's filesystem is read-only and ephemeral: every write fails with `EROFS`, and the JSON file resets on each cold start. The app refuses to start with this backend on Vercel and reports the misconfiguration instead of serving a dashboard that can read seed data but never record a call. Use the Sheets backend for persistence, or migrate to Firestore (Phase 2).

### "Could not reach the server." on the Agent Portal

If the agent dashboard shows this message, the request never reached a working backend. Check, in order:

1. **`CRM_DATA_BACKEND` is set to `sheets`** in the Vercel project settings, for all three environments (Production, Preview, Development). Setting it only in Production leaves preview deployments on the memory backend.
2. **`SHEET_ID`, `GOOGLE_CLIENT_EMAIL` and `GOOGLE_PRIVATE_KEY` are set** — a missing one makes the Sheets backend throw on the first read.
3. **The deployment was rebuilt after the variables were added.** Vercel only applies environment variables to a new deployment; redeploy from the Deployments tab.
4. **The function did not time out.** Claiming a lead waits out the settle window and makes several Sheets calls, so the route sets `maxDuration = 30`.

`GET /api/manager/analytics` returning `totalLeads: 60` is the quickest way to confirm the sheet is reachable and the backend is the Sheets one.

### Custom Domain

After deployment:
1. Go to your project settings in Vercel
2. Navigate to "Domains"
3. Add your custom domain (e.g., `crm.yourcompany.com`)
4. Follow Vercel's DNS configuration instructions

---

## Post-Deployment Setup

### 1. Create the Spreadsheet

If you haven't already created the Google Sheet:

```bash
# On your local machine (not Vercel)
npm run bootstrap:sheet -- --owner your.email@gmail.com
```

This creates the spreadsheet, shares it with your service account and your email, and prints the `SHEET_ID`. Add that ID to Vercel's environment variables.

### 2. Seed Demo Data

```bash
# On your local machine with .env.local configured
npm run seed:sheets
```

Or seed the sheet manually via Google Sheets (copy the headers from the bootstrap script output).

### 3. Test the Deployment

1. Visit your Vercel URL: `https://coldcrm.vercel.app`
2. Log in with: `manager@company.com` / `4821`
3. Check the manager dashboard loads with data
4. Open an incognito window and log in as: `agent1@company.com` / `1234`
5. Claim a lead and verify the dial button works

---

## Continuous Deployment

Once connected to GitHub, Vercel automatically:
- **Deploys to production** on every push to `main`
- **Creates preview deployments** for every pull request
- **Runs the build** and fails the deployment if the build fails

The GitHub Actions workflow (`.github/workflows/ci.yml`) runs tests on every push, so you'll catch errors before they reach production.

---

## Monitoring

### View Logs

1. Go to your Vercel project dashboard
2. Click "Deployments"
3. Select a deployment
4. Click "Functions" to see serverless function logs
5. Filter by URL path or time range

### Analytics

Vercel's free tier includes:
- **Web Analytics** (pageviews, top pages, referrers)
- **Speed Insights** (Core Web Vitals)

Enable them in your project settings → "Analytics" tab.

---

## Scaling

The free Vercel hobby tier includes:
- **100 GB bandwidth/month**
- **100 GB-hours compute/month**
- **Unlimited deployments**

For a small team (5-10 agents), this is more than enough. If you exceed these limits, Vercel will prompt you to upgrade to the Pro tier ($20/month).

**Google Sheets quotas:**
- 300 requests/min/project
- 60 requests/min/user (service account)

The app's 5-second cache reduces quota usage. For higher volumes, migrate to Firestore (Phase 2).

---

## Troubleshooting

### "Build failed" on Vercel

Check the build logs in Vercel's deployment dashboard. Common issues:
- Missing `AUTH_SECRET` environment variable
- TypeScript errors (run `npx tsc --noEmit` locally first)
- Missing dependencies (commit `package-lock.json`)

### "Cannot read properties of undefined (reading 'spreadsheets')"

The `GOOGLE_PRIVATE_KEY` isn't being parsed correctly. Make sure:
- It's wrapped in double quotes
- It includes the literal `\n` sequences (not actual line breaks)
- The quotes aren't escaped (`\"` → `"`)

### "Requested entity was not found" (Google Sheets)

The `SHEET_ID` is wrong or the service account doesn't have access. Open the sheet in Google Sheets, click Share, and add the `GOOGLE_CLIENT_EMAIL` with Editor access.

### Deployment is slow

Vercel's free tier uses shared infrastructure. First deployments and cold starts take longer (~10-30 seconds). Subsequent requests are fast.

---

## Rollback

If a deployment breaks production:
1. Go to your Vercel project dashboard
2. Click "Deployments"
3. Find the last working deployment
4. Click "︙" → "Promote to Production"

---

## Environment Variables Management

To update environment variables after deployment:
1. Go to your Vercel project settings
2. Navigate to "Environment Variables"
3. Edit or add variables
4. **Redeploy** to apply changes (Vercel doesn't reload env vars on existing deployments)

Or via CLI:
```bash
vercel env add VARIABLE_NAME
vercel env rm VARIABLE_NAME
vercel env ls
```

---

## Security

- **Never commit `.env.local`** — it's gitignored
- **Use Vercel's environment variables** for secrets (they're encrypted at rest)
- **Rotate `AUTH_SECRET`** if it's ever exposed (regenerate and update on Vercel)
- **Service account JSON key** is equivalent to a password — treat it as a secret

---

## Cost Estimate (Production)

Assuming 5 agents × 40 calls/day × 22 work days/month = **4,400 calls/month**:

| Service | Usage | Cost |
|---|---|---|
| **Vercel** | ~20 GB bandwidth, ~10 GB-hours compute | **$0** (within free tier) |
| **Google Sheets API** | ~13,200 reads, ~8,800 writes | **$0** (under quotas) |
| **Total** | | **$0/month** |

Vercel Pro ($20/month) is only needed if you exceed 100 GB bandwidth or 100 GB-hours compute.

---

Ready to deploy. Once you push the repository to GitHub and follow the steps above, your CRM will be live at your Vercel URL within minutes.
