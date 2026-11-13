# Procare Team app

Employee app for Procare Pest: sign-in, profile, schedule, time off, and (soon) the
technician, sales and operations suites. Data and permissions live in Supabase.

## Settings in Vercel

Project → Settings → Environment Variables:

- `NEXT_PUBLIC_SUPABASE_URL`: the Supabase project URL (ends in .supabase.co)
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: the **publishable** key from Supabase → Project Settings → API Keys

Never put the secret key in Vercel or in this repo.
