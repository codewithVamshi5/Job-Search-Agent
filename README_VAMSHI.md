# Career-Ops — Vamshi's Job Search Pipeline
### Automated Job Scraping + CV Matching + Reports

---

## 🎯 What This Does

This system automatically:
1. **Scrapes** Internshala and Naukri for intern roles in Hyderabad
2. **Extracts** each job description
3. **Compares** it against your `cv.md` using free AI (Gemini/Groq)
4. **Saves** a detailed report per job with: Grade, CV improvement tips, verdict (Apply/Maybe/Skip)
5. **Prints** a ranked table so you know exactly which jobs to prioritize

---

## ⚡ Quick Start (3 Steps)

### Step 1 — Install browsers (one-time, takes ~2 minutes)
```bash
cd career-ops
npm install
npx playwright install chromium
```

### Step 2 — Your API keys are already set in `.env`:
```
GEMINI_API_KEY=AIzaSyDh42g...   ← already added ✅
GROQ_API_KEY=gsk_GOxx...        ← already added ✅
```

### Step 3 — Run the scraper
```bash
# Scrape both Internshala + Naukri (default)
node scrape-and-rank.mjs

# Only Internshala, 5 jobs
node scrape-and-rank.mjs --source internshala --limit 5

# Only Naukri, machine learning roles
node scrape-and-rank.mjs --source naukri --keyword "machine learning intern"

# Dry run (list jobs without evaluation)
node scrape-and-rank.mjs --dry-run
```

---

## 📊 What You Get

After running, you'll see:
```
01. 🟢 Grade A | Score: 8/10 | ✅ APPLY
    Python ML Intern @ Qualcomm [Internshala]
    📍 Hyderabad | 💰 ₹20,000/month
    📄 001-qualcomm-2026-04-29.md

02. 🔵 Grade B | Score: 7/10 | ✅ APPLY
    AI Engineer Intern @ Freshworks [Naukri]
    ...
```

Each report file (`reports/XXX-company-date.md`) contains:
- Your exact match score
- Which skills matched
- Which skills you're missing
- Specific CV edits to improve your shortlisting chances
- Likely interview questions

---

## 🔧 All Available Commands

```bash
# === SCRAPING (NEW) ===
npm run scrape                  # Scrape all sources, evaluate
npm run scrape:internshala      # Only Internshala
npm run scrape:naukri           # Only Naukri
npm run scrape:dry              # List jobs without AI evaluation

node scrape-and-rank.mjs --keyword "data science intern" --limit 8

# === MANUAL EVALUATION (original feature) ===
npm run eval -- "Paste a job description here"
node eval.mjs "Software developer intern at XYZ company..."

# === FORCE A SPECIFIC API ===
node eval.mjs --api groq "JD text here"
node eval.mjs --api gemini "JD text here"
```

---

## 💡 Search Tips

These keywords work well for your profile:

| What you want | Keyword to use |
|---|---|
| AI/ML roles | `machine learning intern hyderabad` |
| Python roles | `python developer intern hyderabad` |
| Full-stack | `full stack intern hyderabad` |
| Any intern | `intern hyderabad` |
| AI startups | `generative ai intern hyderabad` |

---

## 💰 API Usage / Cost

| API | Limit | Status |
|---|---|---|
| **Gemini** | 1 million tokens/day FREE | ✅ Used first |
| **Groq** | ~30 req/min FREE | ✅ Backup |

Both keys are already in `.env`. You should never hit a cost unless you run hundreds of evaluations per day.

---

## 📁 Folder Structure

```
career-ops/
├── scrape-and-rank.mjs  ← 🆕 Main pipeline (scrape + evaluate)
├── eval.mjs             ← Manual single-JD evaluator (original)
├── cv.md                ← YOUR RESUME ← Keep updated!
├── config/profile.yml   ← Your details (already filled)
├── .env                 ← API keys (already set)
├── reports/             ← All evaluation reports saved here
│   ├── SUMMARY-date.md  ← Ranked table of all results
│   ├── 001-company-date.md
│   └── 002-company-date.md
└── ...
```

---

## ❓ Troubleshooting

**Browser error**: Run `npx playwright install chromium` first

**No jobs found**: Some sites block scrapers. Try `--source internshala` or change the keyword.

**Rate limit**: If Gemini hits quota, Groq activates automatically. Or wait a few minutes.

**Want faster results**: Use `--limit 3` to evaluate only 3 jobs.
