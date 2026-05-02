#!/usr/bin/env node
/**
 * groq-eval.mjs — Groq-powered Job Offer Evaluator for career-ops
 *
 * Free backup evaluator using Groq's free API tier (llama3, mixtral models).
 * Use this when Gemini daily quota is exhausted.
 *
 * Usage:
 *   node groq-eval.mjs "Paste full JD text here"
 *   node groq-eval.mjs --file ./jds/my-job.txt
 *   npm run groq:eval -- "JD text"
 *
 * Requires:
 *   GROQ_API_KEY in .env
 *   Get free key at: https://console.groq.com (no billing needed)
 *
 * Free-tier limits: 30 requests/min, 6000 tokens/min on free plan
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Load .env
try {
  const { config } = await import('dotenv');
  config();
} catch {
  // dotenv optional
}

const ROOT = dirname(fileURLToPath(import.meta.url));

const PATHS = {
  shared: join(ROOT, 'modes', '_shared.md'),
  oferta: join(ROOT, 'modes', 'oferta.md'),
  cv: join(ROOT, 'cv.md'),
  reports: join(ROOT, 'reports'),
};

// ── CLI argument parsing ──────────────────────────────────────────────────────
const args = process.argv.slice(2);

if (args.length === 0 || args[0] === '--help') {
  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║         career-ops — Groq Evaluator (free-tier backup)          ║
╚══════════════════════════════════════════════════════════════════╝

  USAGE
    node groq-eval.mjs "<JD text>"
    node groq-eval.mjs --file ./jds/my-job.txt
    node groq-eval.mjs --model llama3-70b-8192 "<JD text>"

  OPTIONS
    --file <path>    Read JD from file
    --model <name>   Groq model (default: llama3-70b-8192)
    --no-save        Skip saving report
    --help           Show this help

  AVAILABLE FREE MODELS ON GROQ:
    llama3-70b-8192       (best quality, default)
    llama3-8b-8192        (faster, lighter)
    mixtral-8x7b-32768    (large context window)
    gemma2-9b-it          (Google Gemma 2)

  SETUP
    1. Go to https://console.groq.com → create account (free)
    2. Create an API key
    3. Add to .env:  GROQ_API_KEY=your_key_here
    4. Run: npm install

  NOTE: Use this when Gemini quota is exhausted for the day.
`);
  process.exit(0);
}

let jdText = '';
let modelName = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
let saveReport = true;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--file' && args[i + 1]) {
    const filePath = args[++i];
    if (!existsSync(filePath)) {
      console.error(`❌  File not found: ${filePath}`);
      process.exit(1);
    }
    jdText = readFileSync(filePath, 'utf-8').trim();
  } else if (args[i] === '--model' && args[i + 1]) {
    modelName = args[++i];
  } else if (args[i] === '--no-save') {
    saveReport = false;
  } else if (!args[i].startsWith('--')) {
    jdText += (jdText ? '\n' : '') + args[i];
  }
}

if (!jdText) {
  console.error('❌  No Job Description provided. Use --help for usage.');
  process.exit(1);
}

// ── Validate API key ──────────────────────────────────────────────────────────
const apiKey = process.env.GROQ_API_KEY;
if (!apiKey || apiKey === 'your_groq_api_key_here') {
  console.error(`
❌  GROQ_API_KEY not found or not set.

   1. Go to https://console.groq.com → sign up free
   2. Create an API key
   3. Add to .env:   GROQ_API_KEY=your_key_here
`);
  process.exit(1);
}

// ── File helpers ──────────────────────────────────────────────────────────────
function readFile(path, label) {
  if (!existsSync(path)) {
    console.warn(`⚠️   ${label} not found at: ${path}`);
    return `[${label} not found — skipping]`;
  }
  return readFileSync(path, 'utf-8').trim();
}

function nextReportNumber() {
  if (!existsSync(PATHS.reports)) return '001';
  const files = readdirSync(PATHS.reports)
    .filter(f => /^\d{3}-/.test(f))
    .map(f => parseInt(f.slice(0, 3)))
    .filter(n => !isNaN(n));
  if (files.length === 0) return '001';
  return String(Math.max(...files) + 1).padStart(3, '0');
}

// ── Load context ──────────────────────────────────────────────────────────────
console.log('\n📂  Loading context files...');
const sharedContext = readFile(PATHS.shared, 'modes/_shared.md');
const ofertaLogic = readFile(PATHS.oferta, 'modes/oferta.md');
const cvContent = readFile(PATHS.cv, 'cv.md');

// ── Build prompt ──────────────────────────────────────────────────────────────
// const systemPrompt = `You are career-ops, an AI-powered job search assistant.
// You evaluate job offers against the user's CV using a structured scoring system.

// Your evaluation methodology:

// ═══════════════════════════════════════════════════════
// SYSTEM CONTEXT (_shared.md)
// ═══════════════════════════════════════════════════════
// ${sharedContext}

// ═══════════════════════════════════════════════════════
// EVALUATION MODE (oferta.md)
// ═══════════════════════════════════════════════════════
// ${ofertaLogic}

// ═══════════════════════════════════════════════════════
// CANDIDATE RESUME (cv.md)
// ═══════════════════════════════════════════════════════
// ${cvContent}

// ═══════════════════════════════════════════════════════
// RULES
// ═══════════════════════════════════════════════════════
// 1. Generate Blocks A through G in full.
// 2. For salary/comp data: provide estimates based on Indian market knowledge for Hyderabad.
// 3. At the end, output this exact block:

// ---SCORE_SUMMARY---
// COMPANY: <company name or "Unknown">
// ROLE: <role title>
// SCORE: <global score as decimal, e.g. 3.8>
// ARCHETYPE: <detected archetype>
// LEGITIMACY: <High Confidence | Proceed with Caution | Suspicious>
// ---END_SUMMARY---`;
const systemPrompt = `You are an AI job evaluator.

You MUST:
- Give clear answers (no placeholders like [EDIT])
- Always give a match score (A–F or 1–5)
- Respond ONLY in English

DATA:

CV:
${cvContent.slice(0, 1200)}

JOB DESCRIPTION:
${jdText.slice(0, 1200)}

TASK:
1. Give match score
2. List matched skills
3. List missing skills
4. Suggest improvements
5. Final verdict: Apply or Skip
`;
// ── Call Groq API (OpenAI-compatible) ─────────────────────────────────────────
console.log(`🤖  Calling Groq (${modelName})... this may take 20-40 seconds.\n`);

let evaluationText;
try {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: modelName,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `JOB DESCRIPTION TO EVALUATE:\n\n${jdText}` },
      ],
      temperature: 0.4,
      max_tokens: 4096,
    }),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || `HTTP ${response.status}`);
  }

  const data = await response.json();
  evaluationText = data.choices?.[0]?.message?.content;

  if (!evaluationText) throw new Error('Empty response from Groq');

} catch (err) {
  console.error('❌  Groq API error:', err.message);
  if (err.message?.includes('rate')) {
    console.error('    Rate limit hit. Wait 60s and retry, or switch to Gemini: node gemini-eval.mjs "..."');
  }
  if (err.message?.includes('key') || err.message?.includes('auth')) {
    console.error('    Check your GROQ_API_KEY in .env');
  }
  process.exit(1);
}

// ── Display ───────────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(66));
console.log('  CAREER-OPS EVALUATION — powered by Groq (Free)');
console.log('═'.repeat(66) + '\n');
console.log(evaluationText);

// ── Parse summary ─────────────────────────────────────────────────────────────
const summaryMatch = evaluationText.match(
  /---SCORE_SUMMARY---\s*([\s\S]*?)---END_SUMMARY---/
);

let company = 'unknown', role = 'unknown', score = '?', archetype = 'unknown', legitimacy = 'unknown';

if (summaryMatch) {
  const block = summaryMatch[1];
  const extract = (key) => {
    const m = block.match(new RegExp(`${key}:\\s*(.+)`));
    return m ? m[1].trim() : 'unknown';
  };
  company = extract('COMPANY');
  role = extract('ROLE');
  score = extract('SCORE');
  archetype = extract('ARCHETYPE');
  legitimacy = extract('LEGITIMACY');
}

// ── Save report ───────────────────────────────────────────────────────────────
if (saveReport) {
  try {
    if (!existsSync(PATHS.reports)) mkdirSync(PATHS.reports, { recursive: true });
    const num = nextReportNumber();
    const today = new Date().toISOString().split('T')[0];
    const companySlug = company.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const filename = `${num}-${companySlug}-${today}.md`;
    const reportPath = join(PATHS.reports, filename);

    const reportContent = `# Evaluation: ${company} — ${role}

**Date:** ${today}
**Archetype:** ${archetype}
**Score:** ${score}/5
**Legitimacy:** ${legitimacy}
**Tool:** Groq (${modelName})

---

${evaluationText.replace(/---SCORE_SUMMARY---[\s\S]*?---END_SUMMARY---/, '').trim()}
`;
    writeFileSync(reportPath, reportContent, 'utf-8');
    console.log(`\n✅  Report saved: reports/${filename}`);
    console.log(`\n📊  Tracker entry:`);
    console.log(`    | ${num} | ${today} | ${company} | ${role} | ${score} | Evaluated | [report](reports/${filename}) |`);
  } catch (err) {
    console.warn(`⚠️   Could not save report: ${err.message}`);
  }
}

console.log('\n' + '─'.repeat(66));
console.log(`  Score: ${score}/5  |  Archetype: ${archetype}  |  Legitimacy: ${legitimacy}`);
console.log('  Powered by Groq free tier — https://console.groq.com');
console.log('─'.repeat(66) + '\n');
