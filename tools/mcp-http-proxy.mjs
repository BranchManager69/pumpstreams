#!/usr/bin/env node
import process from 'node:process';
import { URL } from 'node:url';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

function parseArguments(argv) {
  const args = { headers: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    switch (token) {
      case '--url':
      case '-u':
        args.url = argv[++i];
        break;
      case '--bearer':
        args.bearer = argv[++i];
        break;
      case '--header':
      case '-H':
        args.headers.push(argv[++i]);
        break;
      case '--help':
      case '-h':
        args.help = true;
        break;
      case '--verbose':
      case '-v':
        args.verbose = true;
        break;
      default:
        args.headers ??= [];
        if (token.startsWith('-')) {
          console.error(`Unknown option ${token}\n`);
          args.help = true;
          return args;
        }
        args.url = args.url ?? token;
        break;
    }
  }
  return args;
}

function printHelp() {
  console.log(`Usage: mcp-http-proxy --url <https://server/mcp> [options]\n\n` +
    `Options:\n` +
    `  -u, --url <url>        MCP Streamable HTTP endpoint (required)\n` +
    `  --bearer <token>       Add Authorization: Bearer <token> header\n` +
    `  -H, --header <k:v>     Append arbitrary header (may repeat)\n` +
    `  -v, --verbose          Emit diagnostic logs to stderr\n` +
    `  -h, --help             Show this help message\n`);
}

function parseHeader(header) {
  const idx = header.indexOf(':');
  if (idx === -1) {
    throw new Error(`Invalid header format: ${header}. Expected "Key: Value".`);
  }
  const name = header.slice(0, idx).trim();
  const value = header.slice(idx + 1).trim();
  if (!name || !value) {
    throw new Error(`Invalid header format: ${header}. Expected "Key: Value".`);
  }
  return [name, value];
}

function isInitializeRequest(message) {
  return message && typeof message === 'object' && !Array.isArray(message) && message.method === 'initialize';
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  if (args.help || !args.url) {
    printHelp();
    process.exit(args.help && !args.url ? 1 : 0);
  }

  if (!args.bearer && process.env.TOKEN_AI_MCP_TOKEN) {
    args.bearer = process.env.TOKEN_AI_MCP_TOKEN;
  }

  let target;
  try {
    target = new URL(args.url);
  } catch (error) {
    console.error(`Invalid URL: ${args.url}`);
    process.exit(1);
  }

  const headerEntries = [];
  if (args.bearer) {
    headerEntries.push(['Authorization', `Bearer ${args.bearer}`]);
  }
  for (const header of args.headers) {
    try {
      headerEntries.push(parseHeader(header));
    } catch (error) {
      console.error(error.message);
      process.exit(1);
    }
  }

  const requestInit = headerEntries.length > 0 ? { headers: Object.fromEntries(headerEntries) } : undefined;

  const remote = new StreamableHTTPClientTransport(target, requestInit ? { requestInit } : undefined);
  const local = new StdioServerTransport();

  let shuttingDown = false;

  const verboseLog = (...messages) => {
    if (args.verbose) {
      console.error('[mcp-proxy]', ...messages);
    }
  };

  const shutdown = async (code) => {
    if (shuttingDown) return;
    shuttingDown = true;
    verboseLog('Shutting down.');
    try {
      await Promise.allSettled([remote.close(), local.close()]);
    } finally {
      process.exit(code);
    }
  };

  remote.onmessage = async (message) => {
    try {
      await local.send(message);
    } catch (error) {
      console.error('Failed to forward message from remote:', error);
      await shutdown(1);
    }
  };

  remote.onerror = async (error) => {
    console.error('Remote transport error:', error instanceof Error ? error.message : error);
    await shutdown(1);
  };

  remote.onclose = async () => {
    verboseLog('Remote closed connection.');
    await shutdown(0);
  };

  local.onmessage = async (message) => {
    try {
      if (isInitializeRequest(message)) {
        const protocolVersion = message.params?.protocolVersion;
        if (protocolVersion) {
          remote.setProtocolVersion(protocolVersion);
          verboseLog('Set protocol version', protocolVersion);
        }
      }
      await remote.send(message);
    } catch (error) {
      console.error('Failed to forward message to remote:', error instanceof Error ? error.message : error);
      await shutdown(1);
    }
  };

  local.onerror = async (error) => {
    console.error('Stdio transport error:', error instanceof Error ? error.message : error);
    await shutdown(1);
  };

  local.onclose = async () => {
    verboseLog('Local transport closed.');
    await shutdown(0);
  };

  const signals = ['SIGINT', 'SIGTERM'];
  for (const signal of signals) {
    process.on(signal, () => {
      verboseLog(`Received ${signal}`);
      shutdown(0).catch(() => process.exit(1));
    });
  }

  await remote.start();
  await local.start();
  verboseLog(`Proxy connected. Bridging ${target.href} <-> stdio`);
}

main().catch((error) => {
  console.error('Fatal error starting MCP proxy:', error instanceof Error ? error.message : error);
  process.exit(1);
});
