#!/usr/bin/env node
/**
 * eval.mjs — Smart evaluator with automatic API fallback
 *
 * Tries APIs in order: Gemini → Groq → Anthropic → OpenAI
 * Whichever key is set in .env will be tried first (priority order above).
 *
 * Usage:
 *   node eval.mjs "Paste full JD text here"
 *   node eval.mjs --file ./jds/job.txt
 *   node eval.mjs --api gemini "JD text"    ← force a specific API
 *   npm run eval -- "JD text"
 *
 * This is the recommended entry point for evaluations.
 */

import { spawn } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

try { const { config } = await import('dotenv'); config(); } catch {}

const ROOT = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);

if (args.length === 0 || args[0] === '--help') {
  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║            career-ops — Smart Evaluator (auto-fallback)         ║
╚══════════════════════════════════════════════════════════════════╝

  USAGE
    node eval.mjs "<JD text>"
    node eval.mjs --file ./jds/job.txt
    node eval.mjs --api gemini "<JD text>"
    npm run eval -- "<JD text>"

  OPTIONS
    --file <path>    Read JD from file
    --api <name>     Force API: groq | nvidia | gemini | anthropic | openai
    --help           Show this help

  API PRIORITY (auto-detected from .env):
    1. Groq     (free, fast)         → GROQ_API_KEY       ← you have this ✅
    2. NVIDIA   (free, Gemma-4-31b)  → NVIDIA_API_KEY     ← you have this ✅
    3. Gemini   (Google, new key)    → GEMINI_API_KEY
    4. Anthropic (paid)              → ANTHROPIC_API_KEY
    5. OpenAI   (paid)               → OPENAI_API_KEY

  SETUP: Add at least one key to .env file.
`);
  process.exit(0);
}

// Parse --api flag
let forcedApi = null;
const filteredArgs = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--api' && args[i + 1]) {
    forcedApi = args[++i].toLowerCase();
  } else {
    filteredArgs.push(args[i]);
  }
}

// Determine which API to use
function isKeySet(envVar) {
  const val = process.env[envVar];
  return val && !val.startsWith('your_') && val.length > 10;
}

const APIs = [
  { name: 'groq',      script: 'groq-eval.mjs',    envKey: 'GROQ_API_KEY'      }, // free, primary
  { name: 'nvidia',    script: 'nvidia-eval.mjs',   envKey: 'NVIDIA_API_KEY'    }, // free, Gemma-4-31b
  { name: 'gemini',    script: 'gemini-eval.mjs',   envKey: 'GEMINI_API_KEY'    }, // Google Gemini (if you get a new key)
  { name: 'anthropic', script: 'claude-eval.mjs',   envKey: 'ANTHROPIC_API_KEY' },
  { name: 'openai',    script: 'openai-eval.mjs',   envKey: 'OPENAI_API_KEY'    },
];

let selectedApi = null;

if (forcedApi) {
  selectedApi = APIs.find(a => a.name === forcedApi);
  if (!selectedApi) {
    console.error(`❌  Unknown API: ${forcedApi}. Choose from: groq, nvidia, gemini, anthropic, openai`);
    process.exit(1);
  }
} else {
  // Auto-detect: pick first available key
  for (const api of APIs) {
    if (isKeySet(api.envKey)) {
      selectedApi = api;
      break;
    }
  }
}

if (!selectedApi) {
  console.error(`
❌  No API key found in .env

Please add at least one key to your .env file:
  GROQ_API_KEY      → https://console.groq.com         (free — already set ✅)
  NVIDIA_API_KEY    → https://build.nvidia.com           (free Gemma-4-31b — already set ✅)
  GEMINI_API_KEY    → https://aistudio.google.com/apikey (get a fresh Google key)
  ANTHROPIC_API_KEY → https://console.anthropic.com      (paid)
`);
  process.exit(1);
}

const scriptPath = join(ROOT, selectedApi.script);

if (!existsSync(scriptPath)) {
  console.error(`❌  Evaluator script not found: ${scriptPath}`);
  process.exit(1);
}

console.log(`\n🚀  Using: ${selectedApi.name.toUpperCase()} API\n`);

// Run the appropriate evaluator
const child = spawn('node', [scriptPath, ...filteredArgs], {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code) => process.exit(code ?? 0));
