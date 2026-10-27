# MDB-DORC Market Place

A Netlify-ready Next.js marketplace starter for MDB-DORC. It includes a responsive storefront, cart, Supabase email/password accounts, vendor applications and product submissions, an administrator review workspace, NGN Paystack checkout routes, pickup locations, commission accounting, and a manual vendor settlement ledger.

The repository is the application source. It is **not deployed** and does not contain your real Supabase or Paystack credentials. Live use requires the external accounts and configuration below.

## Stack

- Next.js App Router + TypeScript
- Netlify for hosting, deploy previews, and server-side execution
- Supabase Postgres, Auth, Row Level Security, and Storage
- Paystack for NGN card/bank checkout

Netlify hosts the app and its server-side routes. Supabase provides persistent data, sessions, and images; Paystack processes payments. This is not a static-only deployment.

## Run locally

1. Install Node.js 20 or later.
2. Copy `.env.example` to `.env.local` and fill in the Supabase and Paystack **test** values.
3. Run `npm install`, then `npm run dev`.
4. Open `http://localhost:3000`.

Without Supabase credentials, the storefront shows its sample catalog and account/checkout actions remain unavailable. The sample catalog is seeded as platform-owned merchandise; replace its sample listings, prices, stock, and product photos before launch.

## Supabase setup

1. Create a Supabase project and configure Authentication → URL Configuration with the local and production URLs.
2. Run the SQL migrations in `supabase/migrations` in order (or apply the folder through the Supabase CLI). They create marketplace tables, access policies, the storage bucket, product categories, and sample listings, then update the seeded product wording to match DORC branding.
3. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and the server-only `SUPABASE_SERVICE_ROLE_KEY` in local development and Netlify. If Supabase has moved your project to publishable/secret keys, use the matching key values with these application variable names.
4. Confirm the private `product-images` bucket and its policies exist. The bucket accepts JPEG, PNG, and WebP images up to 5 MB. The storefront creates short-lived signed URLs only for approved listing images; vendors can access their own submissions.
5. Create the first trusted admin through Supabase Auth, then use the SQL editor to promote that exact user UUID:

   ```sql
   update public.profiles
   set role = 'admin'
   where id = '<trusted-auth-user-uuid>';
   ```

   Never let public signup choose its own role. The signup trigger always creates a customer profile.

### Enable Google sign-in

1. In Google Cloud Console, create or select a project and configure an OAuth consent screen. Create an OAuth client with application type **Web application**.
2. Add your local origin (`http://localhost:3000`) and production site origin as authorized JavaScript origins. Add the callback URL shown in Supabase under Authentication → Sign In / Providers → Google as an authorized redirect URI in Google.
3. Enable Google in Supabase Authentication providers and paste in the Google client ID and client secret.
4. In Supabase Authentication → URL Configuration, set the site URL and allow these callback URLs: `http://localhost:3000/auth/callback` and `https://YOUR_DOMAIN/auth/callback` (plus any Netlify deploy-preview origins you plan to test).
5. Try both account creation and sign-in with Google. OAuth credentials are configured in Supabase and do not belong in the app's public environment variables.

The app exchanges Google's authorization code for a Supabase session at `/auth/callback`. New Google users receive the same customer role as email signups; roles cannot be selected during registration.

The SQL enables Row Level Security and restricts customer, vendor, and administrator data. Review the policies against your operational rules before storing real customer information. Supabase service-role credentials bypass RLS and must stay server-side.

## Paystack setup

1. Create/configure the Paystack merchant account and use test keys first.
2. Set `PAYSTACK_SECRET_KEY` on the server and `PAYSTACK_PUBLIC_KEY` only if you later use it in browser payment UI. This implementation initializes payments from the server.
3. Set `NEXT_PUBLIC_SITE_URL` to the exact local or production origin.
4. Set the Paystack webhook URL to `https://YOUR_DOMAIN/api/paystack/webhook` in the Paystack dashboard.
5. Test successful, failed, duplicate, and delayed notifications. The callback and webhook both verify transactions server-side and check NGN amount and reference before marking an order paid.

The first settlement workflow is manual: Paystack collects to the marketplace merchant account; the admin pays vendors through the agreed external method and records completed settlements in the dashboard. The settlement ledger does **not** send bank transfers. Automated Paystack split settlements are intentionally not activated.

## Netlify deploy

1. Push this folder to a Git repository and import it into Netlify.
2. Let Netlify detect Next.js. The included `netlify.toml` runs `npm run build`; no static export is configured.
3. Add the environment variables above in Netlify site settings, with the secret/service keys scoped to server-side functions as appropriate. Never add secrets to Git or `NEXT_PUBLIC_` variables.
4. Set the production `NEXT_PUBLIC_SITE_URL`, Supabase Auth site URL/redirects, and Paystack webhook URL to the deployed domain.
5. Deploy a preview and exercise account sign-up, admin provisioning, vendor approval, product review, checkout in Paystack test mode, webhook confirmation, both pickup locations, and manual settlement records before switching to live keys.

Netlify documents `next build` and `.next` as typical Next.js SSR/hybrid settings; its framework integration detects and adapts the Next.js build. This project does not use `next export`.

## Implemented flows and current limits

- Customer account creation and sign-in use Supabase Auth with email/password or Google. Customers can see their own orders.
- Vendor applications begin pending. An admin can approve them. Vendors can upload images and submit products; submissions stay pending until an admin approves them.
- Admins can add platform-owned products, review pending vendor products, update order pickup progress, and record manual settlements.
- Catalog entries load from Supabase when configured; a local sample catalog is shown when Supabase is not configured. Seeded sample listings use illustrative product photos hosted by Unsplash. Replace the sample prices, stock, ratings, and photos with verified product information before launch.
- Checkout requires sign-in, supports only E-Block and MSB Site Office, creates a pending order, reserves stock, initializes Paystack, and verifies payment from the server.
- Product editing after approval, customer refunds/disputes, review moderation, pickup-staff workflows, automated payout execution, scheduled expiry of abandoned pending orders, email notifications, and production operations monitoring still need implementation before a broad public launch.
- Sample catalog ratings and promotional labels are presentation data. The database starts sample products with no ratings; build a verified review workflow before displaying real ratings.

## Project layout

- `src/app`: storefront, account, dashboard, checkout callback, and server endpoints
- `src/components`: storefront, account, payment, and role-specific dashboard UI
- `src/lib`: product formatting and Supabase clients
- `supabase/migrations`: schema, access policies, seed catalog, and storage policies
- `.env.example`: required variable names without credentials

# MDB-DORC-Market-Place
MDB-DORC Market Place brings products from the marketplace and approved vendors together in one convenient place. Browse, order online, and choose a pickup point that works for you.
