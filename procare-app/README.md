# Procare Team app

Employee app for Procare Pest: sign-in, profile, schedule, time off, team management,
and (soon) the technician, sales and operations suites. Data and permissions live in Supabase.

## Settings in Vercel

Project → Settings → Environment Variables:

- `NEXT_PUBLIC_SUPABASE_URL`: the Supabase project URL (ends in .supabase.co)
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: the publishable key (Supabase → Project Settings → API Keys)
- `SUPABASE_SECRET_KEY`: the secret key. Used only on the server, to create logins and reset passcodes.
  Never give it a NEXT_PUBLIC_ name and never commit it to this repo.
- `RESEND_API_KEY`: the Resend API key (resend.com → API Keys) for automatic emails.
  Server only, like the secret key. Without it, the app works but sends no email.
- `EMAIL_FROM`: who emails come from, for example `Procare Team <team@procarepest.com>`.
  The domain must be verified in Resend.
- `EMAIL_REPLY_TO` (optional): where replies to those emails go, for example Ally's address.

## Automatic emails

Sent by `app/api/notify/route.js` right after someone acts in the app. Each has an
on/off switch under Manage team → Email settings (`notification_settings`).

| Switch key | When | Who gets it |
| --- | --- | --- |
| `time_off_request` | Someone outside sales requests time off (subject says PTO if they asked for it) | The HR approver (Ally), or the President |
| `time_off_decision` | A request is approved or denied | The employee |
| `sales_time_off_notice` | A sales rep notifies of time off | Sales managers, or the President if there are none |
| `schedule_issue` | Someone outside sales reports a schedule issue | Their lead or manager, or the President |
| `sales_schedule_change` | A sales rep sends a schedule update | Sales managers, or the President |

`payout_submitted` is for the incentive payouts that aren't built yet; it sends nothing today.
