#!/usr/bin/env node
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const readline = require('readline');
const crypto = require('crypto');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function prompt(question, hidden = false) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    if (hidden) {
      process.stdout.write(question);
      let value = '';
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.on('data', chunk => {
        const ch = chunk.toString();
        if (ch === '\n' || ch === '\r' || ch === '\u0004') { process.stdout.write('\n'); process.stdin.pause(); process.stdin.setRawMode(false); rl.close(); resolve(value); }
        else if (ch === '\u007f') value = value.slice(0, -1);
        else value += ch;
      });
    } else {
      rl.question(question, answer => { rl.close(); resolve(answer); });
    }
  });
}

async function main() {
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║     Statera — First-time Setup       ║');
  console.log('╚══════════════════════════════════════╝\n');

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.error('✗ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env\n');
    process.exit(1);
  }

  // Check if admin already exists
  const { data: existing } = await supabase.from('profiles').select('username').eq('username', 'admin').single();
  if (existing) {
    console.log('✓ Admin account already exists. Nothing to do.\n');
    console.log('Run: npm run dev\n');
    process.exit(0);
  }

  console.log('No admin account found. Creating one now.\n');

  let password = process.env.STATERA_ADMIN_PASSWORD;
  if (password) {
    console.log('Using password from STATERA_ADMIN_PASSWORD environment variable.');
  } else {
    password = await prompt('Set admin password (min 6 chars): ', true);
    if (!password || password.length < 6) { console.error('\n✗ Password must be at least 6 characters.\n'); process.exit(1); }
    const confirm = await prompt('Confirm password: ', true);
    if (password !== confirm) { console.error('\n✗ Passwords do not match.\n'); process.exit(1); }
  }

  const email = 'admin@statera.local';
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
  if (authError) { console.error('\n✗ Failed to create auth user:', authError.message, '\n'); process.exit(1); }

  const { error: profileError } = await supabase.from('profiles').insert({
    id: authData.user.id, username: 'admin', role: 'admin',
    bio: '', steam_id: '', public_inventory: false, public_holdings: false
  });
  if (profileError) { console.error('\n✗ Failed to create profile:', profileError.message, '\n'); process.exit(1); }

  console.log('\n✓ Admin account created successfully!');
  console.log('\nYou can now run: npm run dev\n');
  process.exit(0);
}

main().catch(err => { console.error('Setup failed:', err.message); process.exit(1); });
