career-ops — Automated Internship Finder
A personal job search pipeline I built to stop manually browsing Internshala and Naukri every day. It scrapes listings automatically, pulls each job description, compares it against my CV using an AI model, and saves a report telling me exactly whether to apply, what I'm missing, and what to fix in my resume for that specific role.
Built for my own intern search in Hyderabad. Adapted from the open-source career-ops project.

The Problem It Solves
Every day I was going to Internshala, clicking through 20-30 listings, reading job descriptions, trying to figure out if I was a good fit, then forgetting which ones I applied to. It was slow and inconsistent. Different roles need different things highlighted in a resume — a "Python Developer Intern" role wants to see your scripting projects front and center, while an "ML Intern" wants TensorFlow and model training experience even if both are in the same resume.
This tool automates the boring part. It finds the listings, reads them, and tells me specifically: your match score is 8/10, you're missing experience with Docker, add this line about your RAG project to your CV before applying.

What It Actually Does
Internshala / Naukri
        ↓
  Headless browser scrapes listings
        ↓
  Extracts full job description from each listing page
        ↓
  Sends JD + your CV to NVIDIA NIM (Gemma-4-31b)
        ↓
  Gets back: grade, matched skills, missing skills, CV tips, interview questions
        ↓
  Saves a .md report per job in /reports/
        ↓
  Prints ranked table of all results
It does not auto-apply anywhere. You apply manually. The tool just tells you which ones are worth your time and what to change before you do.

Stack
PartToolWhyScrapingPlaywright (headless Chromium)Handles JavaScript-rendered pages that basic fetch can't readAI EvaluationNVIDIA NIM — google/gemma-4-31b-itFree API, 31B parameter model, good qualityFallback AIGroq — llama3-70b-8192Also free, much faster (5 sec vs 2 min), used when NVIDIA is slowRuntimeNode.js (ES Modules)The original career-ops project was in Node, kept it consistentConfigYAML + .envProfile and portal config in YAML, API keys in .env

Folder Structure
career-ops-final/
│
├── scrape-and-rank.mjs     ← main pipeline (scrape + evaluate + rank)
├── nvidia-eval.mjs         ← evaluate a single JD using NVIDIA NIM
├── groq-eval.mjs           ← evaluate a single JD using Groq
├── eval.mjs                ← smart router (picks best available API)
├── gemini-eval.mjs         ← also routes to NVIDIA now (key change)
│
├── cv.md                   ← your resume in markdown — edit this
├── config/
│   └── profile.yml         ← your name, target roles, location, stipend range
├── .env                    ← API keys (never commit this)
│
├── reports/                ← all evaluation reports saved here
│   ├── SUMMARY-date.md     ← ranked table after each scrape run
│   └── 001-company-date.md ← individual job report
│
├── modes/                  ← evaluation prompt templates
├── portals.yml             ← job portal config (Internshala, Naukri etc.)
└── package.json

Setup
Requirements

Node.js v18 or higher — download from nodejs.org
A free NVIDIA NIM API key — from build.nvidia.com
A free Groq API key — from console.groq.com (optional backup)

Installation
bash# 1. Clone the repo
git clone https://github.com/YOUR_USERNAME/career-ops-hyderabad.git
cd career-ops-hyderabad

# 2. Install dependencies
npm install

# 3. Install the headless browser (one-time, ~150MB download)
npx playwright install chromium

# 4. Set up your API keys
cp .env.example .env
# then open .env and add your keys
.env file
envNVIDIA_API_KEY=nvapi-your-key-here
NVIDIA_MODEL=google/gemma-4-31b-it
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1

GROQ_API_KEY=gsk_your-key-here
GROQ_MODEL=llama3-70b-8192
Fill in your details
Open cv.md and replace the content with your actual resume.
Open config/profile.yml and update your name, email, target roles, and location.

Usage
Scrape jobs and evaluate all of them
bash# Scrape Internshala for machine learning roles
node scrape-and-rank.mjs --source internshala --keyword "machine learning" --api nvidia

# Scrape Naukri for python roles
node scrape-and-rank.mjs --source naukri --keyword "python developer" --api nvidia

# Scrape both sites, evaluate top 10 jobs
node scrape-and-rank.mjs --api nvidia

# Limit to 5 jobs (faster for testing)
node scrape-and-rank.mjs --source internshala --keyword "AI intern" --limit 5 --api nvidia

# Just list what jobs are available without evaluating (no API used)
node scrape-and-rank.mjs --dry-run
Evaluate a single job description
If you find a listing on LinkedIn or somewhere else, copy the full job description text and paste it directly:
bashnode nvidia-eval.mjs "We are hiring a Machine Learning intern in Hyderabad. 
Must know Python, TensorFlow, and NLP. 3-month internship with stipend."

# Or read from a text file
node nvidia-eval.mjs --file ./jds/somejob.txt
Keywords that work well for Hyderabad intern search
bash"machine learning"
"artificial intelligence"
"deep learning"
"python developer"
"data science"
"nlp"
"generative ai"
"full stack"
"react developer"
"software developer"

What a Report Looks Like
Every evaluated job saves a .md file in reports/. Here's the format:
# Evaluation: Qualcomm — ML Intern

Date: 2026-04-30 | Grade: A | Score: 9/10 | Verdict: APPLY

---

## MATCH SCORE
Grade: A
Score: 9/10

## VERDICT
APPLY — Strong match across all core requirements with additional Agentic AI experience.

## MATCHED SKILLS
- Python: Expert level, used across all projects
- TensorFlow: Explicitly listed in skills
- NLP: Advanced (BERT, Transformers, LangChain)

## MISSING SKILLS
- Docker: Not mentioned in resume
- MLflow: Not mentioned

## CV IMPROVEMENTS FOR THIS ROLE
1. Add a line in RepoGuardian project about model deployment
2. Mention any experience containerizing Python apps, even locally
3. Highlight the 60% efficiency improvement metric more prominently

## INTERVIEW QUESTIONS TO PREPARE
1. Walk us through how you built the multi-agent system in RepoGuardian
2. What's the difference between fine-tuning and RAG? When would you use each?

## SUMMARY
Vamshi is a strong fit for this role. His hackathon experience and existing
AI projects put him ahead of most intern candidates. Main gap is deployment
tooling (Docker/MLflow) which he should address in a cover letter.
After a full scrape run, a SUMMARY-date.md is also created with a ranked table of all evaluated jobs.

API Notes
NVIDIA NIM (primary):

Free tier from build.nvidia.com
Model: google/gemma-4-31b-it — 31 billion parameters
Slow (1-3 minutes per evaluation) but free and good quality
Note: Gemma-4 doesn't support the system role — all prompts go in the user message

Groq (backup):

Free tier from console.groq.com
Model: llama3-70b-8192 — 70 billion parameters
Fast (3-8 seconds) but hits rate limits if you run many evaluations back to back
Use --api groq to force it

The system auto-detects which key is set in .env and picks accordingly. To force a specific API:
bashnode scrape-and-rank.mjs --api nvidia   # use NVIDIA
node scrape-and-rank.mjs --api groq     # use Groq

Known Limitations
Scraping reliability — Internshala and Naukri occasionally block headless browsers or change their HTML structure. If a scrape returns 0 jobs, try a different keyword or use --dry-run to see if the site is loading at all. The fallback is always to copy-paste a JD manually into nvidia-eval.mjs.
NVIDIA speed — The 31B model is slow on the free tier. If you're evaluating 10 jobs it could take 20-30 minutes. Either use --limit 3 to test first, or switch to --api groq for faster runs.
CV updates — The tool evaluates against whatever is in cv.md. If you update your resume, update cv.md too or the reports won't reflect your current profile.
