# Legend AI — Deployment Guide
# Follow these steps in order. Takes about 20 minutes.

---

## STEP 1 — Buy legendai.com

1. Go to **namecheap.com**
2. Search "legendai.com"
3. If available, add to cart and purchase (~$10–15/year)
4. Keep the tab open — you'll need it in Step 4

---

## STEP 2 — Set up Supabase (free)

1. Go to **supabase.com** and create a free account
2. Click **"New Project"**
3. Name it: `legend-ai`
4. Set a strong database password (save it somewhere)
5. Choose the region closest to you
6. Wait ~2 minutes for the project to spin up

**Run the database schema:**
1. In your Supabase project, click **"SQL Editor"** in the left sidebar
2. Click **"New query"**
3. Open the file `supabase/schema.sql` from this repo
4. Copy the entire contents and paste into the SQL editor
5. Click **"Run"** — all tables will be created

**Get your API keys:**
1. Go to **Project Settings → API**
2. Copy:
   - **Project URL** → save this
   - **anon / public key** → save this

**Make yourself admin:**
1. Go to SQL Editor, run this (replace with your email):
```sql
update profiles set plan = 'admin' where email = 'your@email.com';
```

---

## STEP 3 — Deploy to Vercel (free)

1. Go to **vercel.com** and create a free account
2. Click **"Add New Project"**
3. Import your GitHub repo: `dax-code-bro/Untitled-new-game-project`
4. Set the **Root Directory** to: `web`
5. Framework will auto-detect as **Vite**
6. Under **Environment Variables**, add:
   ```
   VITE_SUPABASE_URL = (your Supabase Project URL from Step 2)
   VITE_SUPABASE_ANON_KEY = (your Supabase anon key from Step 2)
   ```
7. Click **Deploy**
8. Vercel gives you a URL like `legend-xyz.vercel.app` — the site is live

---

## STEP 4 — Connect legendai.com to Vercel

**In Vercel:**
1. Go to your project → **Settings → Domains**
2. Click **"Add Domain"**
3. Type: `legendai.com`
4. Vercel will show you DNS records to add — copy them

**In Namecheap:**
1. Go to your Namecheap dashboard
2. Click **"Manage"** next to legendai.com
3. Go to **"Advanced DNS"**
4. Delete the default A records
5. Add the records Vercel gave you:
   - Type: **A Record** → Value: `76.76.21.21`
   - Type: **CNAME** → Host: `www` → Value: `cname.vercel-dns.com`
6. Save

**Wait 5–30 minutes** for DNS to propagate.

---

## STEP 5 — Set up Supabase Auth providers

**For Google sign-in:**
1. Go to console.cloud.google.com
2. Create a new project → enable Google OAuth
3. Copy Client ID and Secret
4. In Supabase → **Authentication → Providers → Google**
5. Paste the credentials, set redirect URL to: `https://legendai.com/chat`

**For GitHub sign-in:**
1. Go to github.com/settings/developers
2. New OAuth App → Homepage: `https://legendai.com`
3. Callback: your Supabase Auth callback URL
4. In Supabase → **Authentication → Providers → GitHub**
5. Paste credentials

**For Apple sign-in:**
1. Requires Apple Developer account ($99/year)
2. Follow Supabase Apple OAuth guide

---

## STEP 6 — You're live

Go to **legendai.com** in your browser.

The Legend logo appears. Create account works. You're in.

To make yourself admin after signing up:
```sql
-- Run in Supabase SQL Editor
update profiles set plan = 'admin' where email = 'daxtynsanches@gmail.com';
```

---

## FUTURE DEPLOYMENTS

Every time you push to the `claude/ultimate-ai-legend-KhpoT` branch,
Vercel automatically rebuilds and deploys. No manual steps needed.

When you're ready to make it the main branch, merge into `main` and
point Vercel to track `main` instead.
