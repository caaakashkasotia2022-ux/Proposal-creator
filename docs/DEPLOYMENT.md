# Deployment

The app is a standard **Next.js 15** application (Node.js 20+), backed by **PostgreSQL** in production. Choose one of the options below.

## 1. Switch the database to PostgreSQL / Supabase

Local development uses SQLite. For production:

1. Create a PostgreSQL database. Supabase works: *Project → Settings → Database → Connection string (URI)*.
2. In `prisma/schema.prisma`, change:
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```
3. Set `DATABASE_URL`, for example:
   `postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres?schema=public`
   (with Supabase's pooler on port 6543, append `&pgbouncer=true`).
4. Create the schema and the initial data:
   ```bash
   npx prisma db push      # or: npx prisma migrate dev --name init (then migrate deploy in CI)
   npm run db:seed         # creates demo users + settings and imports products from the sheet
   ```
5. Sign in as `admin@idcube.local`, create real user accounts in **Settings → Users & roles**, then **deactivate the demo accounts**. Demo proposals and customers are tagged `[DEMO]`; delete or ignore them.

Search is case-insensitive on both databases.

## 2a. Vercel (simplest)

1. Push the repository to GitHub and import it in Vercel.
2. Add every variable from `.env.example` in *Project → Settings → Environment Variables*. Use the **inline** Google credentials (`GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`).
3. The build command is `npm run build` (it runs `prisma generate`).
4. **The Google Sheet must be configured.** Demo mode writes to a CSV file, which serverless file systems don't allow.

## 2b. Your own server or VM (Windows or Linux)

```bash
git clone <repo> && cd idcube-proposals
npm ci
cp .env.example .env    # fill in all values
npm run build
npm start               # listens on port 3000 (PORT=xxxx to change)
```

Run it under a process manager (PM2, systemd, or NSSM on Windows) behind a reverse proxy that terminates HTTPS (IIS ARR, nginx, Caddy). Session cookies are marked `Secure` in production, so **HTTPS is required**.

## Go-live checklist

- [ ] `AUTH_SECRET` is a fresh random value of 48+ characters, unique to production
- [ ] PostgreSQL configured, with backups enabled
- [ ] Google Sheet connected and synced; `[SAMPLE]` rows replaced with real products
- [ ] SMTP configured and a test email sent
- [ ] Company details, logo, bank details, payment terms and T&C filled in (Settings)
- [ ] Demo users deactivated; real users created with correct roles and permissions
- [ ] HTTPS enabled
- [ ] `npm test` and `node scripts/smoke-test.mjs https://<your-host>` pass (run the smoke test against a staging copy; it creates test proposals)
