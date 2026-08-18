require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL        = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SUPABASE_ANON_KEY   = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('[supabase] Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env');
  process.exit(1);
}

// Auth client — used for auth operations (signIn, refreshSession, admin.getUserById, etc.)
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// Data client — used exclusively for database queries (.from().select() etc.)
// Kept separate from the auth client so auth operations (signIn, refreshSession) never
// contaminate this client's session state — data queries always run as service role.
const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// Token-verification client — uses the anon key so auth.getUser(token) calls Supabase's
// /auth/v1/user endpoint, which verifies the JWT signature AND checks live session state
// (revocations, password resets). Kept separate so it never touches service-role clients.
const supabaseAnon = SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
  : null;

module.exports = { supabase, db, supabaseAnon };
