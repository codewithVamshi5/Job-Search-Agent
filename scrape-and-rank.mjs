#!/usr/bin/env node
/**
 * scrape-and-rank.mjs — Job Scraper + CV Evaluator Pipeline
 *
 * Usage:
 *   node scrape-and-rank.mjs                          ← scrape all sources
 *   node scrape-and-rank.mjs --source internshala
 *   node scrape-and-rank.mjs --source naukri
 *   node scrape-and-rank.mjs --keyword "machine learning intern"
 *   node scrape-and-rank.mjs --limit 5
 *   node scrape-and-rank.mjs --dry-run
 *   node scrape-and-rank.mjs --api groq              ← force Groq
 *   node scrape-and-rank.mjs --api gemini            ← force Gemini
 */

import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

try { const { config } = await import('dotenv'); config(); } catch { }

const ROOT = dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = join(ROOT, 'reports');
const CV_PATH = join(ROOT, 'cv.md');

// Chromium executable — try multiple possible paths
const CHROMIUM_PATHS = [
  // Windows (user's machine)
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  // Linux server (this sandbox)
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  // Mac
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

// ── CLI Args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
let source = 'all';
let keyword = 'intern';
let limit = 10;
let dryRun = false;
let forcedApi = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--source' && args[i + 1]) source = args[++i];
  else if (args[i] === '--keyword' && args[i + 1]) keyword = args[++i];
  else if (args[i] === '--limit' && args[i + 1]) limit = parseInt(args[++i]);
  else if (args[i] === '--api' && args[i + 1]) forcedApi = args[++i].toLowerCase();
  else if (args[i] === '--dry-run') dryRun = true;
  else if (args[i] === '--help') {
    console.log(`
  USAGE
    node scrape-and-rank.mjs [options]

  OPTIONS
    --source <name>    internshala | naukri | all  (default: all)
    --keyword <text>   Search keyword  (default: "intern")
    --limit <n>        Max jobs to evaluate  (default: 10)
    --api <name>       Force API: groq | nvidia
    --dry-run          List jobs without AI evaluation
    --help             Show this help

  EXAMPLES
    node scrape-and-rank.mjs
    node scrape-and-rank.mjs --source internshala --keyword "machine learning"
    node scrape-and-rank.mjs --api groq --limit 5
    node scrape-and-rank.mjs --dry-run
`);
    process.exit(0);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function readCV() {
  if (!existsSync(CV_PATH)) {
    console.error('❌  cv.md not found.');
    process.exit(1);
  }
  return readFileSync(CV_PATH, 'utf-8').trim();
}

function nextReportNumber() {
  if (!existsSync(REPORTS_DIR)) return '001';
  const files = readdirSync(REPORTS_DIR)
    .filter(f => /^\d{3}-/.test(f))
    .map(f => parseInt(f.slice(0, 3)))
    .filter(n => !isNaN(n));
  return files.length === 0 ? '001' : String(Math.max(...files) + 1).padStart(3, '0');
}

function slugify(str) {
  return (str || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);
}

function isKeySet(envVar) {
  const val = process.env[envVar];
  return val && !val.startsWith('your_') && val.length > 10;
}

// Try text from multiple selectors, return first that has content
async function tryText(el, selectors) {
  for (const sel of selectors) {
    try {
      const text = await el.$eval(sel, e => e.innerText?.trim()).catch(() => '');
      if (text && text.length > 1) return text;
    } catch { }
  }
  return '';
}

// ── Launch Browser ─────────────────────────────────────────────────────────────
async function launchBrowser() {
  // Try without executablePath first (uses playwright's own chromium)
  const launchOptions = {
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
      '--disable-setuid-sandbox', '--disable-web-security'],
  };

  // Find a working chromium executable
  for (const p of CHROMIUM_PATHS) {
    if (existsSync(p)) {
      launchOptions.executablePath = p;
      break;
    }
  }

  return chromium.launch(launchOptions);
}

// ── Internshala Scraper ────────────────────────────────────────────────────────
async function scrapeInternshala(page, searchKeyword, maxJobs) {
  console.log('\n🔍  Scraping Internshala...');
  const jobs = [];

  try {
    // Internshala URL format: /internships/{keyword}-internship/
    const slug = searchKeyword.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const url = `https://internshala.com/internships/${slug}-internship/`;
    console.log(`    URL: ${url}`);

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    // Grab all internship cards — Internshala uses .individual_internship
    const cards = await page.$$('.individual_internship');
    console.log(`    Found ${cards.length} listing cards`);

    for (const card of cards.slice(0, maxJobs)) {
      try {
        // Role title — Internshala has changed selectors over time, try all variants
        const title = await tryText(card, [
          '.job-internship-name',     // newer layout
          '.profile',                  // older layout
          'h3',
          '.title',
          'a[href*="internship"]',
        ]);

        // Company
        const company = await tryText(card, [
          '.company-name',
          '.company_name',
          '.companyName',
          '.company_and_premium',
          'p.company-name',
          '.company',
        ]);

        // Location
        const location = await tryText(card, [
          '.locations span',
          '.location_link',
          '.location',
          '.row-1-item span',
          '[data-location]',
        ]);

        // Stipend
        const stipend = await tryText(card, [
          '.stipend',
          '.stipend_container span',
          '.salary',
          '[class*="stipend"]',
        ]);

        // Link
        let link = '';
        try {
          link = await card.$eval('a.view_detail_button', e => e.href);
        } catch {
          try { link = await card.$eval('a', e => e.href); } catch { }
        }

        // Skip if we couldn't get a title
        if (!title) {
          // Last resort: grab all text from the card and parse manually
          const allText = await card.evaluate(e => e.innerText.trim());
          const lines = allText.split('\n').map(l => l.trim()).filter(l => l.length > 2);
          if (lines.length === 0) continue;

          jobs.push({
            source: 'Internshala',
            title: lines[0] || 'Unknown Role',
            company: lines[1] || 'Unknown Company',
            location: 'Hyderabad',
            stipend: lines.find(l => l.includes('₹') || l.toLowerCase().includes('stipend')) || 'Not specified',
            link,
            jd: '',
          });
          continue;
        }

        jobs.push({
          source: 'Internshala',
          title,
          company: company || 'Unknown Company',
          location: location || 'Hyderabad',
          stipend: stipend || 'Not specified',
          link,
          jd: '',
        });

      } catch (e) {
        // skip bad card
      }
    }

    console.log(`    Parsed ${jobs.length} jobs from cards`);

    // Fetch JD for each job
    for (const job of jobs) {
      if (!job.link) { job.jd = `${job.title} internship at ${job.company} in Hyderabad`; continue; }
      try {
        console.log(`    📄  Fetching JD: ${job.title} @ ${job.company}`);
        await page.goto(job.link, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForTimeout(1500);

        let jdText = '';
        for (const sel of ['#about-internship', '.internship_details', '.about_company_text_container', '.detail_view', 'main', 'body']) {
          try {
            jdText = await page.$eval(sel, e => e.innerText.trim());
            if (jdText.length > 100) break;
          } catch { }
        }
        job.jd = jdText.slice(0, 3000) || `${job.title} internship at ${job.company}`;
      } catch {
        job.jd = `${job.title} internship at ${job.company} in Hyderabad. Stipend: ${job.stipend}`;
      }
    }

  } catch (err) {
    console.warn(`    ⚠️  Internshala error: ${err.message}`);
  }

  return jobs;
}

// ── Naukri Scraper ─────────────────────────────────────────────────────────────
async function scrapeNaukri(page, searchKeyword, maxJobs) {
  console.log('\n🔍  Scraping Naukri...');
  const jobs = [];

  try {
    const q = encodeURIComponent(searchKeyword);
    const url = `https://www.naukri.com/internship-jobs-in-hyderabad?k=${q}&l=hyderabad&experience=0&jobType=internship`;
    console.log(`    URL: ${url}`);

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    // Naukri uses different containers — try several
    let cards = await page.$$('article.jobTuple');
    if (cards.length === 0) cards = await page.$$('.cust-job-tuple');
    if (cards.length === 0) cards = await page.$$('[class*="jobTuple"]');
    if (cards.length === 0) cards = await page.$$('.job-container');
    if (cards.length === 0) cards = await page.$$('li.job-post');
    console.log(`    Found ${cards.length} listing cards`);

    for (const card of cards.slice(0, maxJobs)) {
      try {
        const title = await tryText(card, ['.title', 'a.title', '.job-title', 'h2 a', 'h3 a', 'a[href*="job"]']);
        const company = await tryText(card, ['.comp-name', '.company-name', '.companyName', '.company', 'a.comp-name']);
        const location = await tryText(card, ['.loc-wrap', '.location', '.job-location', '[title*="Hyderabad"]']);
        let link = '';
        try { link = await card.$eval('a.title', e => e.href); } catch {
          try { link = await card.$eval('a', e => e.href); } catch { }
        }

        if (!title) continue;
        jobs.push({ source: 'Naukri', title, company: company || 'Unknown', location: location || 'Hyderabad', stipend: 'See listing', link, jd: '' });
      } catch { }
    }

    // Fetch JDs
    for (const job of jobs) {
      if (!job.link) { job.jd = `${job.title} at ${job.company}`; continue; }
      try {
        console.log(`    📄  Fetching JD: ${job.title} @ ${job.company}`);
        await page.goto(job.link, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForTimeout(1500);
        let jdText = '';
        for (const sel of ['.job-desc', '.dang-inner-html', '#job_description', '.jd-desc', 'section.job-description', 'main']) {
          try {
            jdText = await page.$eval(sel, e => e.innerText.trim());
            if (jdText.length > 100) break;
          } catch { }
        }
        job.jd = jdText.slice(0, 3000) || `${job.title} at ${job.company}`;
      } catch {
        job.jd = `${job.title} at ${job.company} in Hyderabad`;
      }
    }

  } catch (err) {
    console.warn(`    ⚠️  Naukri error: ${err.message}`);
  }

  return jobs;
}

// ── AI Evaluators ─────────────────────────────────────────────────────────────
function buildPrompt(cvText, job) {
  return `You are a career advisor evaluating an internship application fit for an Indian student.

## CANDIDATE RESUME
${cvText.slice(0, 2500)}

## JOB DETAILS
Title: ${job.title}
Company: ${job.company}
Location: ${job.location}
Stipend: ${job.stipend}
Source: ${job.source}

## JOB DESCRIPTION
${(job.jd || 'No description available').slice(0, 2000)}

## YOUR TASK — respond in this EXACT format:

## MATCH SCORE
Grade: [A/B/C/D/F]
Score: [1-10]/10

## VERDICT
[APPLY / SKIP / MAYBE] — [one sentence reason]

## MATCHED SKILLS
- [specific skill from resume that matches this JD]
- [specific skill from resume that matches this JD]
- [specific skill from resume that matches this JD]

## MISSING SKILLS
- [skill JD wants that is NOT in resume]
- [skill JD wants that is NOT in resume]

## CV IMPROVEMENTS FOR THIS ROLE
1. [specific line/section to add or reword in cv.md]
2. [specific line/section to add or reword in cv.md]
3. [specific line/section to add or reword in cv.md]

## INTERVIEW QUESTIONS TO PREPARE
1. [likely interview question]
2. [likely interview question]

## SUMMARY
[2-3 sentences: overall fit, strongest asset, main gap]

---SCORE_SUMMARY---
COMPANY: ${job.company}
ROLE: ${job.title}
SCORE: [number 1-10]
GRADE: [A/B/C/D/F]
VERDICT: [APPLY/SKIP/MAYBE]
---END_SUMMARY---`;
}

async function callGroq(prompt) {
  const apiKey = process.env.GROQ_API_KEY;
  const model = 'openai/gpt-oss-120b';
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 2000,
    }),
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || `HTTP ${response.status}`);
  }
  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

async function callNvidia(prompt) {
  const apiKey  = process.env.NVIDIA_API_KEY;
  const model   = process.env.NVIDIA_MODEL    || 'google/gemma-4-31b-it';
  const baseUrl = process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1';
  // NVIDIA uses OpenAI-compatible API format
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 2000,
      stream: false,
    }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `HTTP ${response.status}`);
  }
  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

async function evaluate(cvText, job, apiOrder) {
  const prompt = buildPrompt(cvText, job);
  for (const api of apiOrder) {
    try {
      if (api === 'groq') return await callGroq(prompt);
      if (api === 'nvidia') return await callNvidia(prompt);
    } catch (err) {
      const msg = err.message || '';
      const isQuota = msg.includes('quota') || msg.includes('429') || msg.includes('rate');
      console.warn(`    ⚠️  ${api.toUpperCase()} failed${isQuota ? ' (quota/rate limit)' : ''}: ${msg.slice(0, 80)}`);
      if (api === apiOrder[apiOrder.length - 1]) throw err; // last option, re-throw
      console.log(`    🔄  Falling back to next API...`);
      if (isQuota) await new Promise(r => setTimeout(r, 5000));
    }
  }
  throw new Error('All APIs failed');
}

// ── Save Report ───────────────────────────────────────────────────────────────
function saveReport(job, evaluation) {
  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });
  const num = nextReportNumber();
  const today = new Date().toISOString().split('T')[0];
  const filename = `${num}-${slugify(job.company)}-${today}.md`;
  const reportPath = join(REPORTS_DIR, filename);

  const m = evaluation.match(/---SCORE_SUMMARY---\s*([\s\S]*?)---END_SUMMARY---/);
  let grade = '?', score = '?', verdict = '?';
  if (m) {
    const extract = key => { const r = m[1].match(new RegExp(`${key}:\\s*(.+)`)); return r ? r[1].trim() : '?'; };
    grade = extract('GRADE'); score = extract('SCORE'); verdict = extract('VERDICT');
  }

  writeFileSync(reportPath, `# Evaluation: ${job.company} — ${job.title}

**Date:** ${today} | **Source:** ${job.source}
**Location:** ${job.location} | **Stipend:** ${job.stipend}
**Link:** ${job.link || 'N/A'}
**Grade:** ${grade} | **Score:** ${score}/10 | **Verdict:** ${verdict}

---

${evaluation.replace(/---SCORE_SUMMARY---[\s\S]*?---END_SUMMARY---/, '').trim()}
`, 'utf-8');

  return { filename, grade, score, verdict };
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
console.log(`
╔══════════════════════════════════════════════════════════════════╗
║     career-ops — Job Scraper + CV Evaluator Pipeline            ║
║     Candidate: Vamshi Ketireddypally — Hyderabad Interns        ║
╚══════════════════════════════════════════════════════════════════╝
`);

// Determine API order — prefer Groq (more reliable free tier), fallback to Gemini
let apiOrder;
if (forcedApi) {
  apiOrder = [forcedApi];
  console.log(`🤖  API: ${forcedApi.toUpperCase()} (forced)`);
} else {
  // Default: Groq first (more reliable free tier), Gemini as backup
  apiOrder = [];
  if (isKeySet('GROQ_API_KEY')) apiOrder.push('groq');
  if (isKeySet('NVIDIA_API_KEY')) apiOrder.push('nvidia');
  if (apiOrder.length === 0 && !dryRun) {
    console.error('❌  No API key found. Add GROQ_API_KEY or NVIDIA_API_KEY to .env');
    process.exit(1);
  }
  if (!dryRun) console.log(`🤖  API order: ${apiOrder.join(' → ')} (auto-detected — Groq=free, NVIDIA=Gemma-4-31b-free)`);
}

const cvText = readCV();
console.log(`✅  CV loaded (${cvText.length} chars)`);
console.log(`🔎  Keyword: "${keyword}" | Source: ${source} | Limit: ${limit}`);

// Launch browser
console.log('\n🌐  Launching headless browser...');
const browser = await launchBrowser();
const ctx = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  viewport: { width: 1280, height: 800 },
});
const page = await ctx.newPage();

// Collect jobs
let allJobs = [];
const perSource = Math.ceil(limit / (source === 'all' ? 2 : 1));

if (source === 'all' || source === 'internshala') {
  const jobs = await scrapeInternshala(page, keyword, perSource);
  allJobs = allJobs.concat(jobs);
  console.log(`    ✅  Internshala: ${jobs.length} jobs parsed`);
}
if (source === 'all' || source === 'naukri') {
  const jobs = await scrapeNaukri(page, keyword, perSource);
  allJobs = allJobs.concat(jobs);
  console.log(`    ✅  Naukri: ${jobs.length} jobs parsed`);
}

await browser.close();
console.log(`\n📋  Total jobs found: ${allJobs.length}`);

if (allJobs.length === 0) {
  console.log(`
⚠️  No jobs found. Internshala/Naukri may have blocked the scraper or changed their layout.

Alternatives to try:
  node scrape-and-rank.mjs --keyword "machine learning"
  node scrape-and-rank.mjs --keyword "python developer"
  node scrape-and-rank.mjs --source internshala --keyword "software"

Or use the manual evaluator (paste a JD yourself):
  node eval.mjs "Paste full job description text here"
  node groq-eval.mjs "Paste full job description text here"
`);
  process.exit(0);
}

// Dry run
if (dryRun) {
  console.log('\n📄  DRY RUN — Jobs scraped (no AI evaluation):');
  console.log('─'.repeat(70));
  allJobs.forEach((j, i) => {
    console.log(`${String(i + 1).padStart(2, '0')}. [${j.source}] ${j.title} @ ${j.company}`);
    console.log(`    📍 ${j.location} | 💰 ${j.stipend}`);
    if (j.link) console.log(`    🔗 ${j.link.slice(0, 80)}`);
    console.log('');
  });
  process.exit(0);
}

// Evaluate
console.log('\n🤖  Starting AI evaluation...\n');
const results = [];

for (const [i, job] of allJobs.slice(0, limit).entries()) {
  console.log(`[${i + 1}/${Math.min(allJobs.length, limit)}] ${job.title} @ ${job.company} (${job.source})`);
  try {
    const evaluation = await evaluate(cvText, job, apiOrder);
    const saved = saveReport(job, evaluation);
    results.push({ ...job, ...saved });
    console.log(`    ✅  Grade: ${saved.grade} | Score: ${saved.score}/10 | Verdict: ${saved.verdict}`);
    console.log(`    📄  Saved: reports/${saved.filename}`);
    // Pause between calls to avoid rate limits
    if (i < allJobs.length - 1) await new Promise(r => setTimeout(r, 3000));
  } catch (err) {
    console.error(`    ❌  Failed: ${err.message.slice(0, 100)}`);
  }
}

// Ranked summary
console.log('\n' + '═'.repeat(70));
console.log('  FINAL RANKED RESULTS');
console.log('═'.repeat(70));

results.sort((a, b) => (parseFloat(b.score) || 0) - (parseFloat(a.score) || 0));

const G = { A: '🟢', B: '🔵', C: '🟡', D: '🟠', F: '🔴' };
const V = { APPLY: '✅ APPLY', MAYBE: '🤔 MAYBE', SKIP: '❌ SKIP' };

results.forEach((job, i) => {
  console.log(`\n${String(i + 1).padStart(2, '0')}. ${G[job.grade] || '⚪'} Grade ${job.grade} | Score: ${job.score}/10 | ${V[job.verdict] || job.verdict}`);
  console.log(`    ${job.title} @ ${job.company} [${job.source}]`);
  console.log(`    💰 ${job.stipend} | 📄 ${job.filename}`);
});

// Save summary
if (results.length > 0) {
  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });
  const today = new Date().toISOString().split('T')[0];
  const summaryPath = join(REPORTS_DIR, `SUMMARY-${today}.md`);
  writeFileSync(summaryPath, `# Job Search Summary — ${today}
Candidate: Vamshi Ketireddypally | Keyword: ${keyword} | Total: ${results.length}

| # | Grade | Score | Verdict | Role | Company | Source | Report |
|---|-------|-------|---------|------|---------|--------|--------|
${results.map((j, i) => `| ${i + 1} | ${j.grade} | ${j.score}/10 | ${j.verdict} | ${j.title} | ${j.company} | ${j.source} | [view](${j.filename}) |`).join('\n')}

## Next Steps
- Open Grade A/B reports first for CV improvement tips
- Apply manually via job links in each report
- Run again with different keywords to find more roles
`, 'utf-8');
  console.log(`\n✅  Summary: reports/SUMMARY-${today}.md`);
}

console.log('\n📌  Open reports/ folder and read each Grade A or B report for CV tips.\n');
