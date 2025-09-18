#!/usr/bin/env node
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const USE_COLOR = output.isTTY;
const CODES = {
  reset: '\u001b[0m',
  bold: '\u001b[1m',
  dim: '\u001b[2m',
  underline: '\u001b[4m',
  fg: {
    cyan: '\u001b[36m',
    magenta: '\u001b[35m',
    green: '\u001b[32m',
    yellow: '\u001b[33m',
    red: '\u001b[31m',
    blue: '\u001b[34m',
    gray: '\u001b[90m',
    white: '\u001b[37m',
  },
  bg: {
    blue: '\u001b[44m',
    cyan: '\u001b[46m',
    yellow: '\u001b[43m',
    red: '\u001b[41m',
    magenta: '\u001b[45m',
  },
};

function style(text, ...codes) {
  if (!USE_COLOR || codes.length === 0) return text;
  return `${codes.join('')}${text}${CODES.reset}`;
}

const COMMANDS = [
  {
    name: 'monitor',
    script: 'monitor.mjs',
    description: 'Stream live Pump.fun trades with stats + logging.',
    aliases: ['start'],
    warnsOnWrite: true,
  },
  {
    name: 'advanced',
    script: 'advanced.mjs',
    description: 'Advanced trade explorer with filters, stats, and CSV output.',
    aliases: [],
    warnsOnWrite: false,
  },
  {
    name: 'live',
    script: 'livestream-cli.mjs',
    description: 'Livestream toolkit (list/info/join/regions).',
    aliases: ['livestream'],
    warnsOnWrite: true,
  },
  {
    name: 'poller',
    script: 'live-poller.mjs',
    description: 'Persist live roster snapshots to Supabase.',
    aliases: ['live-poller'],
    warnsOnWrite: true,
  },
  {
    name: 'subscribe',
    script: 'livekit-subscriber.mjs',
    description: 'Join a LiveKit room and record session metadata.',
    aliases: ['livekit'],
    warnsOnWrite: true,
  },
  {
    name: 'investigate',
    script: 'live-investigator.mjs',
    description: 'Headless recon of pump.fun/live with assets.',
    aliases: ['investigator'],
    warnsOnWrite: false,
  },
  {
    name: 'analyze',
    script: 'analytics.mjs',
    description: 'Read Supabase analytics snapshots and trends.',
    aliases: ['analytics'],
    warnsOnWrite: false,
  },
  {
    name: 'ws-test',
    script: 'test.mjs',
    description: 'Quick Socket.IO connectivity smoke.',
    aliases: ['smoke'],
    warnsOnWrite: false,
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
  console.log(style(' PumpStreams CLI ', CODES.bold, CODES.bg.cyan, CODES.fg.white));
  console.log(`${style('Usage:', CODES.bold, CODES.underline)} npm run cli -- <command> [options]\n`);
  console.log(style('Available commands:', CODES.bold));
  for (const { name, description, aliases } of COMMANDS) {
    const aliasText = aliases.length
      ? style(` (aliases: ${aliases.join(', ')})`, CODES.dim)
      : '';
    console.log(`  ${style(name.padEnd(12), CODES.bold, CODES.fg.green)} ${description}${aliasText}`);
  }
  console.log(`\n${style('Examples:', CODES.bold)}`);
  console.log(`  ${style('npm run cli -- monitor', CODES.fg.blue)}`);
  console.log(`  ${style('npm run cli -- live list --limit 5', CODES.fg.blue)}`);
  console.log(`  ${style('npm run cli -- poller --once', CODES.fg.blue)}`);
  console.log(`\n${style('Tip:', CODES.bold, CODES.fg.yellow)} run ${style('npm run cli', CODES.fg.blue)} with no arguments for the interactive menu.`);
}

function parseArgLine(line) {
  const args = [];
  let current = '';
  let quote = null;
  let escape = false;

  for (const char of line.trim()) {
    if (escape) {
      current += char;
      escape = false;
      continue;
    }

    if (char === '\\') {
      escape = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"' || char === '\'') {
      quote = char;
      continue;
    }

    if (char === ' ') {
      if (current.length) {
        args.push(current);
        current = '';
      }
      continue;
    }

    current += char;
  }

  if (current.length) {
    args.push(current);
  }

  if (quote) {
    console.warn('Unmatched quote detected when parsing arguments; proceeding with best effort.');
  }

  return args;
}

async function promptForCommand() {
  const rl = createInterface({ input, output });
  console.log(style(' PumpStreams CLI ', CODES.bold, CODES.bg.cyan, CODES.fg.white));
  console.log(style('Select a command to run:', CODES.fg.magenta, CODES.bold));
  COMMANDS.forEach((cmd, idx) => {
    const aliasText = cmd.aliases.length
      ? style(` (aliases: ${cmd.aliases.join(', ')})`, CODES.dim)
      : '';
    const warningTag = cmd.warnsOnWrite
      ? ` ${style('writes Supabase', CODES.bg.red, CODES.fg.white, CODES.bold)}`
      : '';
    const indexLabel = style(` ${idx + 1} `, CODES.bold, CODES.bg.blue, CODES.fg.white);
    const nameLabel = style(cmd.name.padEnd(12), CODES.bold, CODES.fg.blue);
    console.log(`  ${indexLabel} ${nameLabel} ${cmd.description}${aliasText}${warningTag}`);
  });
  console.log(`  ${style(' 0 ', CODES.bold, CODES.bg.red, CODES.fg.white)} ${style('Exit', CODES.fg.red, CODES.bold)}`);

  let entry = null;

  while (!entry) {
    const answer = (await rl.question(`${style('›', CODES.fg.yellow)} `)).trim();
    if (!answer) {
      continue;
    }

  if (answer === '0' || /^exit$/i.test(answer)) {
    rl.close();
    return { entry: null, extraArgs: [] };
  }

    const numeric = Number(answer);
    if (Number.isInteger(numeric) && numeric >= 1 && numeric <= COMMANDS.length) {
      entry = COMMANDS[numeric - 1];
      break;
    }

    const byName = commandMap.get(answer);
    if (byName) {
      entry = byName;
      break;
    }

    console.log(style('Unrecognised choice. Enter a number from the list, command name, or 0 to exit.', CODES.fg.yellow));
  }

  if (entry.warnsOnWrite) {
    console.log(style('⚠️  This command writes to Supabase. Run only if you intend to persist data.', CODES.bold, CODES.fg.red));
  }

  const extras = await rl.question(`${style('Additional arguments (press Enter for none):', CODES.fg.magenta, CODES.bold)} `);
  rl.close();
  const extraArgs = parseArgLine(extras);
  return { entry, extraArgs };
}

function launchCommand(entry, args) {
  const scriptPath = path.join(__dirname, entry.script);
  const child = spawn(process.execPath, [scriptPath, ...args], {
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

async function main() {
  const args = process.argv.slice(2);
  const subcommand = args[0];

  if (!subcommand) {
    const { entry, extraArgs } = await promptForCommand();
    if (!entry) {
      process.exit(0);
    }
    launchCommand(entry, extraArgs);
    return;
  }

  if (subcommand === '--help' || subcommand === '-h' || subcommand === 'help') {
    showHelp();
    process.exit(0);
  }

  const entry = commandMap.get(subcommand);
  if (!entry) {
    console.error(`Unknown command: ${subcommand}\n`);
    showHelp();
    process.exit(1);
  }

  launchCommand(entry, args.slice(1));
}

main().catch((error) => {
  console.error('CLI launcher failed:', error.message);
  process.exit(1);
});
