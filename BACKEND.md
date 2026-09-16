# Backend foundation

The source of truth is `supabase/migrations/20260906000100_order_foundation.sql`. It creates products, deduplicated customers, orders, shipping-ready fields, attribution fields, timestamps, indexes, constraints, status enum, and RLS.

Run the migration in Supabase, then copy `.env.example` to `.env.local`. `SUPABASE_SERVICE_ROLE_KEY` is server-only and must never be prefixed with `NEXT_PUBLIC_`.

Required environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. Optional integration configuration: `NEXT_PUBLIC_META_PIXEL_ID`, `META_PIXEL_ID`, and `META_ACCESS_TOKEN`; the Meta access token is server-only. No admin API key is required; admin access uses Supabase Auth plus `admin_users`.

`POST /api/orders` accepts `submissionId` (UUID), `productSlug`, `fullName`, `phone`, `wilaya`, `commune`, `address`, `quantity`, optional `notes`, and optional UTM/fbclid attribution. The database function retrieves the active product price, upserts the customer by normalized phone, calculates the total, and uses `submissionId` as the idempotency key. It returns a `YM-YYYYMMDD-####` order number.

`GET /api/admin/orders` and `PATCH /api/admin/orders` are protected by the authenticated Supabase session and an `admin_users` role. The GET endpoint supports `q`, `status`, `sort`, `page`, and `pageSize` query parameters.

Shipping API delivery is intentionally not implemented without provider credentials. Meta Pixel events are emitted client-side from the configured public Pixel ID, while the server sends a Purchase event to CAPI only after successful order creation. The browser and server Purchase events use the order number as the shared event ID; CAPI credentials remain server-only.

## Admin setup

1. Apply the migration and configure the Supabase project URL, anon key, and service-role key in the server environment.
2. In Supabase Dashboard → Authentication → Users, create the first user with the owner email and a strong password. There is intentionally no `/admin/register` route.
3. In the Supabase SQL editor, assign that Auth user as owner: `insert into public.admin_users (user_id, role) values ('AUTH_USER_UUID', 'owner');`.
4. Open `/admin/login` and sign in. The server verifies the Supabase Auth session and the `admin_users` role before rendering protected pages or serving admin APIs.

Admin roles are `owner`, `admin`, and `operator`. Secrets are never read into client components or displayed in Settings.
