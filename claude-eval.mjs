#!/usr/bin/env node
/**
 * claude-eval.mjs — Anthropic Claude API evaluator for career-ops
 *
 * Uses Anthropic's API directly (not Claude Code CLI).
 * Recommended model: claude-haiku-4-5 (cheapest, fast)
 *
 * Usage:
 *   node claude-eval.mjs "Paste full JD text here"
 *   node claude-eval.mjs --file ./jds/job.txt
 *
 * Requires:
 *   ANTHROPIC_API_KEY in .env
 *   New accounts get ~$5 free credit at https://console.anthropic.com
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

try { const { config } = await import('dotenv'); config(); } catch {}

const ROOT = dirname(fileURLToPath(import.meta.url));

const PATHS = {
  shared:  join(ROOT, 'modes', '_shared.md'),
  oferta:  join(ROOT, 'modes', 'oferta.md'),
  cv:      join(ROOT, 'cv.md'),
  reports: join(ROOT, 'reports'),
};

const args = process.argv.slice(2);
if (args.length === 0 || args[0] === '--help') {
  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║           career-ops — Claude (Anthropic) Evaluator             ║
╚══════════════════════════════════════════════════════════════════╝

  USAGE
    node claude-eval.mjs "<JD text>"
    node claude-eval.mjs --file ./jds/job.txt
    node claude-eval.mjs --model claude-haiku-4-5 "<JD text>"

  OPTIONS
    --file <path>    Read JD from file
    --model <name>   Claude model (default: claude-haiku-4-5)
    --no-save        Skip saving report
    --help           Show this help

  MODELS (cheapest to most powerful):
    claude-haiku-4-5       ← cheapest, recommended to save credit
    claude-sonnet-4-6      ← better quality, costs more
    claude-opus-4-6        ← best quality, most expensive

  SETUP
    1. Go to https://console.anthropic.com → sign up
    2. New accounts get ~$5 free credit
    3. Create API key → add to .env: ANTHROPIC_API_KEY=your_key
`);
  process.exit(0);
}

let jdText = '';
let modelName = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';
let saveReport = true;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--file' && args[i + 1]) {
    const fp = args[++i];
    if (!existsSync(fp)) { console.error(`❌  File not found: ${fp}`); process.exit(1); }
    jdText = readFileSync(fp, 'utf-8').trim();
  } else if (args[i] === '--model' && args[i + 1]) {
    modelName = args[++i];
  } else if (args[i] === '--no-save') {
    saveReport = false;
  } else if (!args[i].startsWith('--')) {
    jdText += (jdText ? '\n' : '') + args[i];
  }
}

if (!jdText) { console.error('❌  No JD provided.'); process.exit(1); }

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey || apiKey === 'your_anthropic_api_key_here') {
  console.error(`❌  ANTHROPIC_API_KEY not set in .env\n   Get $5 free credit at: https://console.anthropic.com`);
  process.exit(1);
}

function readFile(path, label) {
  if (!existsSync(path)) { console.warn(`⚠️   ${label} not found`); return `[${label} not found]`; }
  return readFileSync(path, 'utf-8').trim();
}

function nextReportNumber() {
  if (!existsSync(PATHS.reports)) return '001';
  const files = readdirSync(PATHS.reports).filter(f => /^\d{3}-/.test(f))
    .map(f => parseInt(f.slice(0, 3))).filter(n => !isNaN(n));
  return files.length === 0 ? '001' : String(Math.max(...files) + 1).padStart(3, '0');
}

console.log('\n📂  Loading context files...');
const sharedContext = readFile(PATHS.shared, 'modes/_shared.md');
const ofertaLogic   = readFile(PATHS.oferta, 'modes/oferta.md');
const cvContent     = readFile(PATHS.cv,     'cv.md');

const systemPrompt = `You are career-ops, an AI-powered job search assistant.
Evaluate job offers against the candidate's CV.

${sharedContext}

${ofertaLogic}

CANDIDATE CV:
${cvContent}

Rules:
1. Generate all evaluation blocks (A-G) in full.
2. For India/Hyderabad salary data, use Indian market knowledge.
3. End with this exact block:

---SCORE_SUMMARY---
COMPANY: <name>
ROLE: <title>
SCORE: <decimal>
ARCHETYPE: <archetype>
LEGITIMACY: <High Confidence | Proceed with Caution | Suspicious>
---END_SUMMARY---`;

console.log(`🤖  Calling Claude (${modelName})...\n`);

let evaluationText;
try {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: modelName,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: `JOB DESCRIPTION:\n\n${jdText}` }],
    }),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || `HTTP ${response.status}`);
  }

  const data = await response.json();
  evaluationText = data.content?.[0]?.text;
  if (!evaluationText) throw new Error('Empty response');

} catch (err) {
  console.error('❌  Anthropic API error:', err.message);
  if (err.message?.includes('credit') || err.message?.includes('billing')) {
    console.error('    Your $5 credit may be exhausted. Switch to Gemini (free): node gemini-eval.mjs "..."');
  }
  process.exit(1);
}

console.log('\n' + '═'.repeat(66));
console.log('  CAREER-OPS EVALUATION — powered by Claude (Anthropic)');
console.log('═'.repeat(66) + '\n');
console.log(evaluationText);

const summaryMatch = evaluationText.match(/---SCORE_SUMMARY---\s*([\s\S]*?)---END_SUMMARY---/);
let company = 'unknown', role = 'unknown', score = '?', archetype = 'unknown', legitimacy = 'unknown';

if (summaryMatch) {
  const b = summaryMatch[1];
  const x = (k) => { const m = b.match(new RegExp(`${k}:\\s*(.+)`)); return m ? m[1].trim() : 'unknown'; };
  company = x('COMPANY'); role = x('ROLE'); score = x('SCORE'); archetype = x('ARCHETYPE'); legitimacy = x('LEGITIMACY');
}

if (saveReport) {
  try {
    if (!existsSync(PATHS.reports)) mkdirSync(PATHS.reports, { recursive: true });
    const num = nextReportNumber();
    const today = new Date().toISOString().split('T')[0];
    const slug = company.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const filename = `${num}-${slug}-${today}.md`;
    writeFileSync(join(PATHS.reports, filename), `# Evaluation: ${company} — ${role}\n\n**Date:** ${today}\n**Score:** ${score}/5\n**Tool:** Claude (${modelName})\n\n---\n\n${evaluationText.replace(/---SCORE_SUMMARY---[\s\S]*?---END_SUMMARY---/, '').trim()}\n`, 'utf-8');
    console.log(`\n✅  Report saved: reports/${filename}`);
  } catch (err) { console.warn(`⚠️   Could not save: ${err.message}`); }
}

console.log('\n' + '─'.repeat(66));
console.log(`  Score: ${score}/5  |  ${archetype}  |  ${legitimacy}`);
console.log('─'.repeat(66) + '\n');
