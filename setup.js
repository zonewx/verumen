#!/usr/bin/env node
/**
 * Statera first-time setup script.
 * Run once on each new machine: node setup.js
 * Creates the admin account and data directory structure.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');

const DATA_DIR = process.env.STATERA_DATA_DIR || __dirname;
const USERS_FILE = path.join(DATA_DIR, 'users.json');

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
}

function loadUsers() {
  try {
    if (fs.existsSync(USERS_FILE)) return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch(e) {}
  return [];
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function createUserDir(username, hash, salt) {
  const userDir = path.join(DATA_DIR, 'users', username);
  fs.mkdirSync(userDir, { recursive: true });

  const defaults = {
    'profile.json': { username, bio: '', steamId: '', publicInventory: false, publicHoldings: false, createdAt: new Date().toISOString() },
    'friends.json': { friends: [], incoming: [], outgoing: [] },
    'activity.json': [],
    'transactions.json': [],
    'ticker_cache.json': {},
    'ticker_overrides.json': {},
  };

  Object.entries(defaults).forEach(([filename, content]) => {
    const filePath = path.join(userDir, filename);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
    }
  });

  return userDir;
}

async function prompt(question, hidden = false) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    if (hidden) {
      // Hide password input
      process.stdout.write(question);
      let value = '';
      const stdin = process.openStdin();
      process.stdin.on('data', chunk => {
        const ch = chunk.toString();
        if (ch === '\n' || ch === '\r' || ch === '\u0004') {
          process.stdout.write('\n');
          process.stdin.pause();
          rl.close();
          resolve(value);
        } else if (ch === '\u007f') {
          value = value.slice(0, -1);
        } else {
          value += ch;
        }
      });
      process.stdin.setRawMode(true);
      process.stdin.resume();
    } else {
      rl.question(question, answer => { rl.close(); resolve(answer); });
    }
  });
}

async function main() {
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║     Statera — First-time Setup       ║');
  console.log('╚══════════════════════════════════════╝\n');

  console.log(`Data directory: ${DATA_DIR}\n`);

  // Check if admin already exists
  const users = loadUsers();
  const existingAdmin = users.find(u => u.username === 'admin');

  if (existingAdmin) {
    // Admin exists in users.json — just recreate the directory if missing
    const adminDir = path.join(DATA_DIR, 'users', 'admin');
    if (fs.existsSync(adminDir)) {
      console.log('✓ Admin account already fully set up. Nothing to do.\n');
      process.exit(0);
    }
    console.log('Admin account found in users.json — recreating data directory...');
    createUserDir('admin', existingAdmin.hash, existingAdmin.salt);
    console.log('✓ Admin directory recreated. You can now log in with your existing password.\n');
    process.exit(0);
  }

  // No admin exists — create one fresh
  console.log('No admin account found. Creating one now.\n');

  // Check for password in environment variable first
  let password = process.env.STATERA_ADMIN_PASSWORD;

  if (password) {
    console.log('Using password from STATERA_ADMIN_PASSWORD environment variable.');
  } else {
    // Prompt interactively
    password = await prompt('Set admin password (min 6 chars): ', true);
    if (!password || password.length < 6) {
      console.error('\n✗ Password must be at least 6 characters.\n');
      process.exit(1);
    }
    const confirm = await prompt('Confirm password: ', true);
    if (password !== confirm) {
      console.error('\n✗ Passwords do not match.\n');
      process.exit(1);
    }
  }

  const salt = crypto.randomBytes(32).toString('hex');
  const hash = hashPassword(password, salt);

  const adminUser = {
    username: 'admin',
    hash,
    salt,
    role: 'admin',
    createdAt: new Date().toISOString(),
  };

  users.push(adminUser);
  saveUsers(users);

  createUserDir('admin', hash, salt);

  console.log('\n✓ Admin account created successfully!');
  console.log('✓ Data directory initialized.');
  console.log('\nYou can now run: npm run dev\n');
  process.exit(0);
}

main().catch(err => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});
