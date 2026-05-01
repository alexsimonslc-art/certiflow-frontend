# GalSol — Developer Setup Guide

## Project Structure

```
GalSol/
├── frontend/
│   ├── index.html        ← Landing page
│   ├── login.html        ← Login / onboarding page
│   ├── styles.css        ← Global styles (shared)
│   ├── login.css         ← Login-specific styles
│   └── app.js            ← Frontend JavaScript
│
├── backend/              ← (To be built — Node.js + Express)
│   ├── server.js
│   ├── routes/
│   │   ├── auth.js       ← Google OAuth routes
│   │   ├── mailer.js     ← Gmail send API routes
│   │   ├── certificates.js ← Drive/Slides/PDF generation
│   │   └── sheets.js     ← Google Sheets read/write
│   ├── middleware/
│   │   └── auth.js       ← JWT session middleware
│   └── .env              ← API keys (never commit)
│
└── README.md
```

---

## Answering Your Questions

### Is it possible?
**Yes, absolutely.** GalSol works by using Google OAuth 2.0.
When a user signs in, they authorize your app to act on their behalf using their Gmail,
Drive, Sheets, and Slides. All API calls go through Google's infrastructure.
You are just the middleman — you never store their emails or files.

### Will it cost anything?
**No, for most use cases.**
- Gmail API: Free — 500 emails/day (Gmail), 2,000/day (Google Workspace)
- Drive API: Free within standard quotas
- Slides API: Free
- Sheets API: Free
These are per-user limits. So 100 users × 500 emails = 50,000 emails/day. Zero cost.

### What if 100 users use it simultaneously?
Works fine. Each user operates under their own Google quota.
Your server just coordinates the API calls. A basic $0/month setup handles 100+ users easily.

### Backend Stack (Recommended — All Free Tier)
| Layer       | Tool              | Cost     |
|-------------|-------------------|----------|
| Frontend    | Vercel            | Free     |
| Backend API | Render / Railway  | Free     |
| Database    | Supabase          | Free     |
| Auth        | Google OAuth 2.0  | Free     |
| File Gen    | Google Drive API  | Free     |

---

## Step 1: Google Cloud Console Setup

1. Go to https://console.cloud.google.com
2. Create a new project: "GalSol"
3. Enable these APIs:
   - Gmail API
   - Google Drive API
   - Google Sheets API
   - Google Slides API
   - Google People API (for user profile)
4. Go to "OAuth consent screen" → External → Fill in app name, support email
5. Add scopes:
   - https://www.googleapis.com/auth/gmail.send
   - https://www.googleapis.com/auth/drive
   - https://www.googleapis.com/auth/spreadsheets
   - https://www.googleapis.com/auth/presentations.readonly
   - https://www.googleapis.com/auth/userinfo.profile
   - https://www.googleapis.com/auth/userinfo.email
6. Create OAuth 2.0 credentials → Web Application
   - Authorized redirect URI: https://your-backend.onrender.com/auth/google/callback
7. Copy Client ID and Client Secret → paste into .env

---

## Step 2: Backend Environment Variables

Create a `.env` file in your backend folder:

```
GOOGLE_CLIENT_ID=your_client_id_here
GOOGLE_CLIENT_SECRET=your_client_secret_here
GOOGLE_REDIRECT_URI=https://your-backend.onrender.com/auth/google/callback
JWT_SECRET=your_random_secret_here
SUPABASE_URL=https://xyz.supabase.co
SUPABASE_KEY=your_supabase_anon_key
FRONTEND_URL=https://your-frontend.vercel.app
```

---

## Step 3: Backend — Key Routes to Build

### `GET /auth/google`
Redirects user to Google's OAuth consent screen.

### `GET /auth/google/callback`
Receives the authorization code from Google.
- Exchanges code for access_token and refresh_token
- Fetches user profile (name, email, picture)
- Creates/updates user in Supabase
- Issues a JWT session token
- Redirects to frontend dashboard with token

### `POST /api/certificates/generate`
Body: `{ sheetId, templateId, driveFolderId, nameColumn, emailColumn }`
- Reads participant rows from Google Sheets
- For each row: copies Slides template → replaces {{name}} placeholder → exports as PDF → saves to Drive folder → gets shareable link
- Writes links back to a new column in the Sheet
- Returns progress/result

### `POST /api/mail/send`
Body: `{ sheetId, nameColumn, emailColumn, linkColumn, subject, htmlTemplate }`
- Reads participant rows (with certificate links)
- For each row: personalizes the HTML template (replaces {{name}}, {{cert_link}})
- Sends via Gmail API using user's OAuth token
- Returns delivery status per recipient

### `GET /api/user/me`
Returns current user's profile from Supabase.

---

## Step 4: Database Schema (Supabase)

```sql
-- Users table
create table users (
  id uuid primary key default gen_random_uuid(),
  google_id text unique not null,
  email text unique not null,
  name text,
  picture text,
  account_type text default 'personal', -- 'personal' | 'organization'
  org_type text,         -- 'university' | 'college' | 'ngo' | etc
  org_name text,
  org_size text,
  created_at timestamptz default now()
);

-- Campaigns table
create table campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  name text not null,
  type text not null,       -- 'mail' | 'certificate' | 'combined'
  sheet_id text,
  template_id text,
  drive_folder_id text,
  status text default 'draft', -- 'draft' | 'processing' | 'completed' | 'failed'
  total_count int default 0,
  sent_count int default 0,
  error_count int default 0,
  created_at timestamptz default now(),
  completed_at timestamptz
);
```

---

## Step 5: Deployment

### Frontend → Vercel (Free)
```bash
npm install -g vercel
cd GalSol/frontend
vercel deploy
```
Set environment variable:
- `VITE_API_URL` = your Render backend URL

### Backend → Render (Free)
1. Push backend code to GitHub
2. Go to https://render.com → New Web Service
3. Connect GitHub repo → Build command: `npm install` → Start: `node server.js`
4. Add all environment variables from .env
5. Free tier: 750 hours/month (enough for 100 users easily)

### Database → Supabase (Free)
1. Go to https://supabase.com → New Project
2. Run the SQL schema above in the SQL editor
3. Copy Project URL and anon key to .env

---

## Frontend → Backend Connection

In `app.js`, replace the placeholder OAuth redirect with:

```javascript
function triggerGoogleOAuth() {
  const type = sessionStorage.getItem('GalSol_account_type') || 'personal';
  window.location.href = `https://your-backend.onrender.com/auth/google?type=${type}`;
}
```

After OAuth callback, backend redirects to:
```
https://your-frontend.vercel.app/dashboard?token=JWT_TOKEN_HERE
```

Frontend stores the JWT:
```javascript
const token = new URLSearchParams(window.location.search).get('token');
if (token) {
  localStorage.setItem('GalSol_token', token);
  window.location.href = '/dashboard';
}
```

---

## Certificate Generation — The Core Logic

```javascript
// Pseudocode for certificate generation
async function generateCertificate(auth, { participantName, templateId, folderId }) {
  // 1. Copy the Slides template
  const copy = await drive.files.copy({
    fileId: templateId,
    requestBody: { name: `Certificate_${participantName}` }
  });

  // 2. Replace {{name}} placeholder in the slide
  await slides.presentations.batchUpdate({
    presentationId: copy.data.id,
    requestBody: {
      requests: [{
        replaceAllText: {
          containsText: { text: '{{name}}' },
          replaceText: participantName
        }
      }]
    }
  });

  // 3. Export as PDF
  const pdf = await drive.files.export({
    fileId: copy.data.id,
    mimeType: 'application/pdf'
  }, { responseType: 'stream' });

  // 4. Upload PDF to the designated folder
  const uploaded = await drive.files.create({
    requestBody: {
      name: `${participantName}_Certificate.pdf`,
      parents: [folderId],
      mimeType: 'application/pdf'
    },
    media: { mimeType: 'application/pdf', body: pdf.data }
  });

  // 5. Make it shareable (anyone with link can view)
  await drive.permissions.create({
    fileId: uploaded.data.id,
    requestBody: { role: 'reader', type: 'anyone' }
  });

  // 6. Get the shareable link
  const file = await drive.files.get({ fileId: uploaded.data.id, fields: 'webViewLink' });
  return file.data.webViewLink;
}
```

---

## Questions / Support

For questions about building GalSol, open an issue or refer to:
- Google OAuth: https://developers.google.com/identity/protocols/oauth2
- Gmail API: https://developers.google.com/gmail/api
- Google Drive API: https://developers.google.com/drive/api
- Supabase Docs: https://supabase.com/docs
- Render Docs: https://render.com/docs
