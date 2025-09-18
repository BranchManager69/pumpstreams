#!/usr/bin/env node
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const COMMANDS = [
  {
    name: 'monitor',
    script: 'monitor.mjs',
    description: 'Stream live Pump.fun trades with stats + logging.',
    aliases: ['start'],
  },
  {
    name: 'advanced',
    script: 'advanced.mjs',
    description: 'Advanced trade explorer with filters, stats, and CSV output.',
    aliases: [],
  },
  {
    name: 'live',
    script: 'livestream-cli.mjs',
    description: 'Livestream toolkit (list/info/join/regions).',
    aliases: ['livestream'],
  },
  {
    name: 'poller',
    script: 'live-poller.mjs',
    description: 'Persist live roster snapshots to Supabase.',
    aliases: ['live-poller'],
  },
  {
    name: 'subscribe',
    script: 'livekit-subscriber.mjs',
    description: 'Join a LiveKit room and record session metadata.',
    aliases: ['livekit'],
  },
  {
    name: 'investigate',
    script: 'live-investigator.mjs',
    description: 'Headless recon of pump.fun/live with assets.',
    aliases: ['investigator'],
  },
  {
    name: 'analyze',
    script: 'analytics.mjs',
    description: 'Read Supabase analytics snapshots and trends.',
    aliases: ['analytics'],
  },
  {
    name: 'ws-test',
    script: 'test.mjs',
    description: 'Quick Socket.IO connectivity smoke.',
    aliases: ['smoke'],
  },
];

const commandMap = new Map();
for (const entry of COMMANDS) {
  commandMap.set(entry.name, entry);
  for (const alias of entry.aliases) {
    if (!commandMap.has(alias)) {
      commandMap.set(alias, entry);
    }
  }
}

function showHelp() {
  console.log('PumpStreams CLI');
  console.log('Usage: npm run cli -- <command> [options]\n');
  console.log('Available commands:');
  for (const { name, description, aliases } of COMMANDS) {
    const aliasText = aliases.length ? ` (aliases: ${aliases.join(', ')})` : '';
    console.log(`  ${name.padEnd(12)} ${description}${aliasText}`);
  }
  console.log('\nExamples:');
  console.log('  npm run cli -- monitor');
  console.log('  npm run cli -- live list --limit 5');
  console.log('  npm run cli -- poller --once');
}

async function main() {
  const args = process.argv.slice(2);
  const subcommand = args[0];
  if (!subcommand || subcommand === '--help' || subcommand === '-h') {
    showHelp();
    process.exit(subcommand ? 0 : 1);
  }

  const entry = commandMap.get(subcommand);
  if (!entry) {
    console.error(`Unknown command: ${subcommand}\n`);
    showHelp();
    process.exit(1);
  }

  const scriptPath = path.join(__dirname, entry.script);
  const child = spawn(process.execPath, [scriptPath, ...args.slice(1)], {
    stdio: 'inherit',
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });

  child.on('error', (error) => {
    console.error(`Failed to launch ${entry.name}:`, error.message);
    process.exit(1);
  });
}

main();
