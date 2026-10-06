#!/usr/bin/env node

const path = require('path');
const { spawnSync } = require('child_process');

const script = path.join(__dirname, 'seed_country_static_admin_data.js');
const result = spawnSync(process.execPath, [script, ...process.argv.slice(2)], {
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
