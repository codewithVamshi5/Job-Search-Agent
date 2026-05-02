#!/usr/bin/env node
/**
 * nvidia-eval.mjs — NVIDIA NIM (Gemma-4-31b) Job Evaluator
 *
 * Uses NVIDIA's cloud API which runs Google's Gemma model.
 * NVIDIA uses the OpenAI-compatible API format — so this is very similar
 * to the Groq evaluator, just pointing to a different endpoint and model.
 *
 * Model: google/gemma-4-31b-it (31 billion parameters — very capable)
 * Cost:  FREE tier from NVIDIA (https://build.nvidia.com)
 * Docs:  https://docs.api.nvidia.com
 *
 * Usage:
 *   node nvidia-eval.mjs "Paste full JD text here"
 *   node nvidia-eval.mjs --file ./jds/job.txt
 *
 * Requires:
 *   NVIDIA_API_KEY in .env
 *   NVIDIA_MODEL=google/gemma-4-31b-it  (already set in .env)
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

try { const { config } = await import('dotenv'); config(); } catch {}

const ROOT     = dirname(fileURLToPath(import.meta.url));
const REPORTS  = join(ROOT, 'reports');
const CV_PATH  = join(ROOT, 'cv.md');
const SHARED   = join(ROOT, 'modes', '_shared.md');
const OFERTA   = join(ROOT, 'modes', 'oferta.md');

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
if (args.length === 0 || args[0] === '--help') {
  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║     career-ops — NVIDIA NIM Evaluator (Gemma-4-31b FREE)       ║
╚══════════════════════════════════════════════════════════════════╝

  Uses your NVIDIA free API key to evaluate job descriptions.
  Model: google/gemma-4-31b-it (31B params — very capable)

  USAGE
    node nvidia-eval.mjs "Paste full JD text here"
    node nvidia-eval.mjs --file ./jds/job.txt
    node nvidia-eval.mjs --no-save "JD text"

  OPTIONS
    --file <path>    Read JD from a file
    --no-save        Do not save report to reports/ folder
    --help           Show this help

  SETUP (already done for you)
    NVIDIA_API_KEY is already set in .env
    NVIDIA_MODEL=google/gemma-4-31b-it is already set in .env
`);
  process.exit(0);
}

let jdText   = '';
let doSave   = true;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--file' && args[i+1]) {
    const p = args[++i];
    if (!existsSync(p)) { console.error(`❌  File not found: ${p}`); process.exit(1); }
    jdText = readFileSync(p, 'utf-8').trim();
  } else if (args[i] === '--no-save') {
    doSave = false;
  } else if (!args[i].startsWith('--')) {
    jdText += (jdText ? '\n' : '') + args[i];
  }
}

if (!jdText) {
  console.error('❌  No JD text provided. Run with --help for usage.');
  process.exit(1);
}

// ── Validate API key ──────────────────────────────────────────────────────────
const apiKey   = process.env.NVIDIA_API_KEY;
const model    = process.env.NVIDIA_MODEL    || 'google/gemma-4-31b-it';
const baseUrl  = process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1';

if (!apiKey || apiKey.startsWith('your_')) {
  console.error(`
❌  NVIDIA_API_KEY not set.
    1. Get a free key at: https://build.nvidia.com
    2. Add to .env:  NVIDIA_API_KEY=nvapi-xxxx
`);
  process.exit(1);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function readOptional(path, label) {
  if (!existsSync(path)) return `[${label} not found]`;
  return readFileSync(path, 'utf-8').trim();
}

function nextNum() {
  if (!existsSync(REPORTS)) return '001';
  const nums = readdirSync(REPORTS).filter(f => /^\d{3}-/.test(f)).map(f => parseInt(f.slice(0,3))).filter(n => !isNaN(n));
  return nums.length === 0 ? '001' : String(Math.max(...nums) + 1).padStart(3, '0');
}

// ── Build prompt ──────────────────────────────────────────────────────────────
const cv      = readOptional(CV_PATH, 'cv.md');
const shared  = readOptional(SHARED,  'modes/_shared.md');
const oferta  = readOptional(OFERTA,  'modes/oferta.md');

const systemPrompt = `You are career-ops, an expert AI career advisor evaluating internship and job applications for Vamshi Ketireddypally, an AI/ML engineering student from Hyderabad, India.

Evaluate how well the candidate's CV matches the provided job description.

CANDIDATE RESUME:
${cv.slice(0, 2500)}

EVALUATION INSTRUCTIONS:
${shared.slice(0, 500)}
${oferta.slice(0, 500)}

Respond with this EXACT structure:

## MATCH SCORE
Grade: [A/B/C/D/F]
Score: [1-10]/10

## VERDICT
[APPLY / SKIP / MAYBE] — [one clear sentence reason]

## MATCHED SKILLS
- [skill from resume that matches JD]
- [skill from resume that matches JD]
- [skill from resume that matches JD]

## MISSING SKILLS
- [skill the JD wants that is NOT in resume]
- [skill the JD wants that is NOT in resume]

## CV IMPROVEMENTS FOR THIS ROLE
1. [specific text to add/change in cv.md to improve shortlisting chances]
2. [specific text to add/change in cv.md]
3. [specific text to add/change in cv.md]

## INTERVIEW QUESTIONS TO PREPARE
1. [likely interview question for this role]
2. [likely interview question for this role]

## SUMMARY
[3 sentences: overall fit assessment, key strength, main gap]

---SCORE_SUMMARY---
COMPANY: [company name or "Unknown"]
ROLE: [role title]
SCORE: [1-10]
GRADE: [A/B/C/D/F]
VERDICT: [APPLY/SKIP/MAYBE]
ARCHETYPE: [ML/AI | Software Engineering | Data Science | Full Stack | Other]
---END_SUMMARY---`;

// ── Call NVIDIA API (OpenAI-compatible format) ────────────────────────────────
console.log(`\n🤖  Calling NVIDIA NIM API...`);
console.log(`    Model: ${model}`);
console.log(`    Endpoint: ${baseUrl}/chat/completions`);
console.log(`    (This may take 30-90 seconds for 31B model)\n`);

let responseText = '';
try {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: `JOB DESCRIPTION TO EVALUATE:\n\n${jdText}` },
      ],
      temperature: 0.3,
      max_tokens:  2048,
      stream: false,
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    console.error(`❌  NVIDIA API error (HTTP ${response.status}):`);
    console.error(errBody.slice(0, 500));
    console.error('\nCommon fixes:');
    console.error('  • Check NVIDIA_API_KEY is correct in .env');
    console.error('  • Check your NVIDIA free tier limit at https://build.nvidia.com');
    console.error('  • Try fallback: node groq-eval.mjs "JD text"');
    process.exit(1);
  }

  const data = await response.json();
  responseText = data.choices?.[0]?.message?.content || '';

  if (!responseText) {
    console.error('❌  Empty response from NVIDIA API');
    console.error('Full response:', JSON.stringify(data, null, 2).slice(0, 500));
    process.exit(1);
  }

} catch (err) {
  console.error(`❌  Network error: ${err.message}`);
  console.error('    Fallback: node groq-eval.mjs "JD text"');
  process.exit(1);
}

// ── Display result ────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(66));
console.log('  CAREER-OPS EVALUATION — powered by NVIDIA NIM (Gemma-4-31b)');
console.log('═'.repeat(66) + '\n');
console.log(responseText);

// ── Parse summary ─────────────────────────────────────────────────────────────
const m = responseText.match(/---SCORE_SUMMARY---\s*([\s\S]*?)---END_SUMMARY---/);
let company = 'unknown', role = 'unknown', score = '?', grade = '?', verdict = '?', archetype = 'unknown';
if (m) {
  const extract = key => { const r = m[1].match(new RegExp(`${key}:\\s*(.+)`)); return r ? r[1].trim() : '?'; };
  company   = extract('COMPANY');
  role      = extract('ROLE');
  score     = extract('SCORE');
  grade     = extract('GRADE');
  verdict   = extract('VERDICT');
  archetype = extract('ARCHETYPE');
}

// ── Save report ───────────────────────────────────────────────────────────────
if (doSave) {
  try {
    if (!existsSync(REPORTS)) mkdirSync(REPORTS, { recursive: true });
    const num         = nextNum();
    const today       = new Date().toISOString().split('T')[0];
    const slug        = company.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);
    const filename    = `${num}-${slug}-${today}.md`;
    writeFileSync(join(REPORTS, filename), `# Evaluation: ${company} — ${role}

**Date:** ${today} | **Tool:** NVIDIA NIM (${model})
**Grade:** ${grade} | **Score:** ${score}/10 | **Verdict:** ${verdict} | **Archetype:** ${archetype}

---

${responseText.replace(/---SCORE_SUMMARY---[\s\S]*?---END_SUMMARY---/, '').trim()}
`, 'utf-8');
    console.log(`\n✅  Report saved: reports/${filename}`);
  } catch (e) {
    console.warn(`⚠️  Could not save report: ${e.message}`);
  }
}

console.log('\n' + '─'.repeat(66));
console.log(`  Grade: ${grade} | Score: ${score}/10 | Verdict: ${verdict}`);
console.log(`  Archetype: ${archetype}`);
console.log('─'.repeat(66) + '\n');
