# Auth setup — one-time Supabase dashboard config

Magic-link sign-in (M0) is wired in the app, but two settings live in the
**Supabase dashboard** and must be set by hand. Do this before testing a real login.

## 1. URL configuration (required)

Supabase → **Authentication → URL Configuration**:

- **Site URL:** `http://localhost:3210`
- **Redirect URLs** — add:
  - `http://localhost:3210/auth/callback`
  - Later, the production URL too, e.g. `https://<your-domain>/auth/callback`

The magic-link email sends the user to `/auth/callback?code=…`; if that exact URL
isn't in the allow-list, Supabase refuses the redirect and login fails.

## 2. Email rate limits (know this)

Supabase's **built-in** magic-link email sender is heavily rate-limited (a handful
of emails per hour on the free tier). For real use, configure **custom SMTP**
(Authentication → Emails → SMTP Settings) later. For a few test logins the default
is fine — just don't be surprised if repeated attempts get throttled.

## 3. Who can log in

RLS only lets **active staff** read the app. Two owners are already provisioned
(auth user + `staff` row, role `owner`, active):

- `holemymora@gmail.com` (David)
- `mottyhammer@gmail.com` (Motty Hammer)

A different email can receive a magic link and sign in, but with no `staff` row
they land on **/no-access**. To authorize someone, add a `staff` row for their
auth user id (see `scripts/bootstrap-owners.mjs`).

## What the human still has to do

1. Set Site URL + Redirect URLs (section 1) in the Supabase dashboard.
2. Click a **real** magic-link from an owner inbox to finish an end-to-end login
   (this can't be automated — it needs a live email). After clicking, you should
   land on `/today` and see the seeded demo case.
