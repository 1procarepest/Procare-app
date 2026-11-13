# Procare Team app

Employee app for Procare Pest: sign-in, profile, schedule, time off, team management,
and (soon) the technician, sales and operations suites. Data and permissions live in Supabase.

## Settings in Vercel

Project → Settings → Environment Variables:

- `NEXT_PUBLIC_SUPABASE_URL`: the Supabase project URL (ends in .supabase.co)
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: the publishable key (Supabase → Project Settings → API Keys)
- `SUPABASE_SECRET_KEY`: the secret key. Used only on the server, to create logins and reset passcodes.
  Never give it a NEXT_PUBLIC_ name and never commit it to this repo.
