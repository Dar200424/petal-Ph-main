# Petal-PH — Supabase Setup Guide

This guide takes you from zero to a working Petal-PH site backed by Supabase
(accounts, products, orders, messages and couriers stored in the cloud, so data
persists across devices). No coding experience is needed — just follow the steps
in order.

---

## Step 1 — Create a free Supabase project

1. Go to [supabase.com](https://supabase.com) and click **Start your project** → sign in with GitHub.
2. Click **New project**.
   - Organization: your personal one (default).
   - Name: anything, e.g. `petal-ph`.
   - Database Password: type a strong password and save it somewhere safe.
   - Region: pick the one closest to you.
3. Click **Create new project** and wait ~1–2 minutes for it to finish setting up.

## Step 2 — Create the database tables

1. In your project, open the **SQL Editor** (left sidebar).
2. Open the file `supabase/schema.sql` from this project in any text editor
   (Notepad is fine) and copy its **entire contents**.
3. Paste it into the SQL Editor and click **Run**.
   - It is safe to run more than once — it only creates what is missing.
4. You should see "Success. No rows returned." The tables (`profiles`,
   `products`, `couriers`, `orders`, `messages`), security policies, and seed
   products/couriers are now created.

## Step 3 — Turn off email confirmation (demo mode)

1. Left sidebar → **Authentication** → **Providers** → **Email**.
2. Turn **Confirm email** OFF and save.

## Step 4 — Connect the site to your project

1. Left sidebar → **Project Settings** (gear) → **API**.
2. Copy the **Project URL** and the **anon / publishable key**.
3. Open `js/config.js` in this project and replace the two lines with your values:

   ```js
   const SUPABASE_URL = 'https://YOUR-PROJECT-ref.supabase.co';
   const SUPABASE_ANON_KEY = 'YOUR-anon-or-publishable-key';
   ```

   Never paste the `service_role` key here — it must stay secret and is never
   needed by the website.

## Step 5 — Create the admin account

1. Run the site locally (just open `index.html` in a browser) or on your deployed URL.
2. Go to **Login → Sign Up** and register with the email you want to use as admin
   (for example your own email).
3. Back in Supabase → **SQL Editor**, run:

   ```sql
   update public.profiles set role = 'admin' where email = 'YOUR_ADMIN_EMAIL';
   ```

4. Log out and log back in with that account — you now have the admin pages
   (product management, orders, customers, delivery, messages, reports).

## Step 6 — Deploy on Vercel (optional, for a public URL)

1. Push this project to a GitHub repository.
2. Go to [vercel.com](https://vercel.com) → sign in → **Add New → Project**.
3. Import your repository (framework preset: **Other**, no build command needed).
4. Click **Deploy** and wait for it to finish.
5. After it works, go back to Supabase → **Authentication → URL Configuration**
   and add your Vercel URL (e.g. `https://your-site.vercel.app`) under
   **Site URL** and **Redirect URLs**.

---

## Where things live

| File | Purpose |
|---|---|
| `js/config.js` | Your project URL + anon key (the only secrets the browser sees) |
| `supabase/schema.sql` | Database tables, security, order functions, seed data |
| `js/app.js` | All Supabase queries (products, orders, messages, auth) |
| `admin.html`, `dashboard.html`, `login.html`, `messages.html`, `index.html` | Pages |

## FAQ

- **"Invalid login credentials"** — double-check the email/password; the admin
  account must first be promoted with the SQL in Step 5.
- **"relation ... does not exist" or 404s** — re-run `supabase/schema.sql` in the
  SQL Editor (Step 2).
- **Site says Supabase is not configured** — `js/config.js` still has the
  placeholder text; paste your real URL and key (Step 4).
- **Messages/orders not syncing between devices** — make sure you are logged in
  and that Step 2 was completed; all data is stored in Supabase, not the browser.