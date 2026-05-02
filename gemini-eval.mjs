#!/usr/bin/env node
/**
 * gemini-eval.mjs — Redirected to NVIDIA NIM (Gemma-4-31b)
 *
 * Originally called Google's Gemini API, but your NVIDIA key
 * runs the same Gemma model (by Google) with MORE parameters (31B vs 8B).
 * So this now calls NVIDIA's API instead — same model family, better quality.
 *
 * NVIDIA API is OpenAI-compatible format, so the code is simpler too.
 *
 * Usage:
 *   node gemini-eval.mjs "Paste full JD text here"
 *   node gemini-eval.mjs --file ./jds/job.txt
 *   node gemini-eval.mjs --model google/gemma-4-31b-it "JD text"
 *
 * Requires: NVIDIA_API_KEY in .env (already set ✅)
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

try { const { config } = await import('dotenv'); config(); } catch {}

const ROOT    = dirname(fileURLToPath(import.meta.url));
const REPORTS = join(ROOT, 'reports');
const CV_PATH = join(ROOT, 'cv.md');
const SHARED  = join(ROOT, 'modes', '_shared.md');
const OFERTA  = join(ROOT, 'modes', 'oferta.md');

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
if (args.length === 0 || args[0] === '--help') {
  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║   career-ops — Gemma Evaluator via NVIDIA NIM (FREE)           ║
╚══════════════════════════════════════════════════════════════════╝

  Model: google/gemma-4-31b-it (31 billion parameters)
  API:   NVIDIA NIM (https://integrate.api.nvidia.com)
  Cost:  FREE with your NVIDIA key ✅

  USAGE
    node gemini-eval.mjs "Paste full JD text here"
    node gemini-eval.mjs --file ./jds/job.txt

  OPTIONS
    --file <path>    Read JD from a file
    --model <name>   Override model (default: google/gemma-4-31b-it)
    --no-save        Do not save report to reports/
    --help           Show this help
`);
  process.exit(0);
}

let jdText = '', modelOverride = null, doSave = true;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--file' && args[i+1]) {
    const p = args[++i];
    if (!existsSync(p)) { console.error(`❌  File not found: ${p}`); process.exit(1); }
    jdText = readFileSync(p, 'utf-8').trim();
  } else if (args[i] === '--model' && args[i+1]) {
    modelOverride = args[++i];
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

// ── Config ────────────────────────────────────────────────────────────────────
const apiKey  = process.env.NVIDIA_API_KEY;
const model   = modelOverride || process.env.NVIDIA_MODEL    || 'google/gemma-4-31b-it';
const baseUrl = process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1';

if (!apiKey || apiKey.startsWith('your_')) {
  console.error(`
❌  NVIDIA_API_KEY not set in .env
    Get a free key at: https://build.nvidia.com
    Then add: NVIDIA_API_KEY=nvapi-xxx to .env
`);
  process.exit(1);
}

// ── Load files ────────────────────────────────────────────────────────────────
function readOpt(p, label) {
  return existsSync(p) ? readFileSync(p, 'utf-8').trim() : `[${label} not found]`;
}
const cv     = readOpt(CV_PATH, 'cv.md');
const shared = readOpt(SHARED,  'modes/_shared.md');
const oferta = readOpt(OFERTA,  'modes/oferta.md');

function nextNum() {
  if (!existsSync(REPORTS)) return '001';
  const nums = readdirSync(REPORTS).filter(f => /^\d{3}-/.test(f)).map(f => parseInt(f.slice(0,3))).filter(n => !isNaN(n));
  return nums.length === 0 ? '001' : String(Math.max(...nums) + 1).padStart(3, '0');
}

// ── Build prompt ──────────────────────────────────────────────────────────────
const systemPrompt = `You are career-ops, an AI career advisor for Vamshi Ketireddypally, an AI/ML engineering student in Hyderabad, India seeking internships.

Evaluate how well the candidate's resume matches the job description provided.

CANDIDATE RESUME (cv.md):
${cv.slice(0, 2500)}

EVALUATION FRAMEWORK:
${shared.slice(0, 400)}
${oferta.slice(0, 400)}

Respond in this EXACT structured format:

## MATCH SCORE
Grade: [A/B/C/D/F]
Score: [1-10]/10

## VERDICT
[APPLY / SKIP / MAYBE] — [one sentence reason]

## MATCHED SKILLS
- [skill from resume that directly matches this JD]
- [skill from resume that directly matches this JD]
- [skill from resume that directly matches this JD]

## MISSING SKILLS
- [skill the JD requires that is NOT clearly shown in resume]
- [skill the JD requires that is NOT clearly shown in resume]

## CV IMPROVEMENTS FOR THIS ROLE
1. [specific change to make in cv.md — be concrete, not generic]
2. [specific change to make in cv.md — be concrete, not generic]
3. [specific change to make in cv.md — be concrete, not generic]

## INTERVIEW QUESTIONS TO PREPARE
1. [likely technical question for this specific role]
2. [likely HR/behavioral question for this role]

## SUMMARY
[3 sentences: overall assessment, strongest match point, key gap to address]

---SCORE_SUMMARY---
COMPANY: [company name or "Unknown"]
ROLE: [role title]
SCORE: [1-10]
GRADE: [A/B/C/D/F]
VERDICT: [APPLY/SKIP/MAYBE]
ARCHETYPE: [ML/AI | Software Engineering | Data Science | Full Stack | Other]
LEGITIMACY: [High Confidence | Proceed with Caution | Suspicious]
---END_SUMMARY---`;

// ── Call NVIDIA API (OpenAI-compatible) ───────────────────────────────────────
console.log(`\n🤖  Calling NVIDIA NIM — model: ${model}`);
console.log(`    (31B parameter model — may take 30-90 seconds)\n`);

let evaluationText = '';
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
        { role: 'user',   content: `JOB DESCRIPTION:\n\n${jdText}` },
      ],
      temperature: 0.3,
      max_tokens: 2500,
      stream: false,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error(`❌  NVIDIA API error (HTTP ${response.status}):`);
    console.error(body.slice(0, 600));
    console.error('\n💡  Fallback: node groq-eval.mjs "JD text"');
    process.exit(1);
  }

  const data = await response.json();
  evaluationText = data.choices?.[0]?.message?.content || '';

  if (!evaluationText) {
    console.error('❌  Empty response. Try: node groq-eval.mjs "JD text"');
    process.exit(1);
  }
} catch (err) {
  console.error(`❌  Network error: ${err.message}`);
  console.error('💡  Fallback: node groq-eval.mjs "JD text"');
  process.exit(1);
}

// ── Display ───────────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(66));
console.log(`  CAREER-OPS EVALUATION — NVIDIA NIM (${model})`);
console.log('═'.repeat(66) + '\n');
console.log(evaluationText);

// ── Parse summary ─────────────────────────────────────────────────────────────
const m = evaluationText.match(/---SCORE_SUMMARY---\s*([\s\S]*?)---END_SUMMARY---/);
let company = 'unknown', role = 'unknown', score = '?', grade = '?', verdict = '?', archetype = 'unknown', legitimacy = 'unknown';
if (m) {
  const ex = key => { const r = m[1].match(new RegExp(`${key}:\\s*(.+)`)); return r ? r[1].trim() : '?'; };
  company = ex('COMPANY'); role = ex('ROLE'); score = ex('SCORE');
  grade = ex('GRADE'); verdict = ex('VERDICT'); archetype = ex('ARCHETYPE'); legitimacy = ex('LEGITIMACY');
}

// ── Save report ───────────────────────────────────────────────────────────────
if (doSave) {
  try {
    if (!existsSync(REPORTS)) mkdirSync(REPORTS, { recursive: true });
    const num   = nextNum();
    const today = new Date().toISOString().split('T')[0];
    const slug  = company.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);
    const fname = `${num}-${slug}-${today}.md`;
    writeFileSync(join(REPORTS, fname), `# Evaluation: ${company} — ${role}

**Date:** ${today} | **Tool:** NVIDIA NIM (${model})
**Grade:** ${grade} | **Score:** ${score}/10 | **Verdict:** ${verdict}
**Archetype:** ${archetype} | **Legitimacy:** ${legitimacy}

---

${evaluationText.replace(/---SCORE_SUMMARY---[\s\S]*?---END_SUMMARY---/, '').trim()}
`, 'utf-8');
    console.log(`\n✅  Report saved → reports/${fname}`);
    console.log(`\n📊  Tracker entry:`);
    console.log(`    | ${num} | ${today} | ${company} | ${role} | ${score}/10 | ${verdict} | [view](reports/${fname}) |`);
  } catch (e) {
    console.warn(`⚠️  Could not save: ${e.message}`);
  }
}

console.log('\n' + '─'.repeat(66));
console.log(`  Grade: ${grade} | Score: ${score}/10 | Verdict: ${verdict} | Archetype: ${archetype}`);
console.log('─'.repeat(66) + '\n');
