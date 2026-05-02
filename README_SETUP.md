# Career-Ops — Setup Guide for Intern Job Search (Hyderabad)

This is your pre-configured career-ops system for finding intern/fresher roles
across any company in and around Hyderabad.

---

## What's Pre-Configured for You

- `portals.yml` → Scans 25+ Hyderabad companies (TCS, Infosys, Microsoft, Google,
  Amazon, Wipro, HCL, Cyient, Freshworks, Qualcomm, etc.) + Indian job portals
  (Naukri, Internshala, LinkedIn, Indeed India, Glassdoor India)
- `config/profile.yml` → Template ready for your personal details
- `cv.md` → Resume template in markdown (fill it in)
- `.env` → Slots for 4 different APIs with fallback support
- `eval.mjs` → Smart evaluator that auto-picks whichever API key you've set
- `groq-eval.mjs` → Free Groq backup evaluator
- `claude-eval.mjs` → Anthropic API evaluator

---

## Step 1 — Install Prerequisites

### Node.js (required)
Download and install Node.js 18 or higher:
- Windows/Mac: https://nodejs.org → click "LTS" → download and install
- Linux (Ubuntu/Debian): `sudo apt install nodejs npm`

Verify: open Terminal and run `node --version` → should show v18 or higher.

### Git (to clone or just use the zip)
- Windows: https://git-scm.com/download/win
- Mac: `xcode-select --install`
- Linux: `sudo apt install git`

---

## Step 2 — Set Up the Project

```bash
# If you downloaded the zip, just unzip and open the folder in terminal.
# If using git:
git clone https://github.com/santifer/career-ops.git
cd career-ops

# Install Node.js dependencies
npm install

# Install Playwright (for scanning company career pages)
npx playwright install chromium
```

---

## Step 3 — Get at Least ONE Free API Key

You only need ONE to start. All are free.

### Option A — Gemini (BEST FREE OPTION — Recommended)
1. Go to https://aistudio.google.com/apikey
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy the key

Free limits: **15 requests/minute, 1 million tokens/day** — plenty for daily job searching.

### Option B — Groq (Free backup)
1. Go to https://console.groq.com
2. Sign up (free, no credit card)
3. Go to API Keys → Create key
4. Copy the key

Free limits: 30 requests/minute on Llama 3 and Mixtral models.

### Option C — Anthropic/Claude ($5 free credit)
1. Go to https://console.anthropic.com
2. Sign up → verify email
3. Go to API Keys → Create key
4. New accounts get ~$5 free credit (use `claude-haiku` to stretch it)

### Option D — Gemini CLI (No API key needed at all!)
```bash
npm install -g @google/gemini-cli
gemini auth   # login with Google account
```
Then use `gemini` command instead of `node eval.mjs`. Completely free.

---

## Step 4 — Add Your API Key to .env

Open the `.env` file in the project folder with any text editor (Notepad, VS Code, etc.)
and replace the placeholder with your actual key:

```
# Example — if you chose Gemini:
GEMINI_API_KEY=AIzaSyABC123yourActualKeyHere

# Example — if you chose Groq:
GROQ_API_KEY=gsk_yourActualGroqKeyHere
```

You can add multiple keys. The system tries them in order: Gemini → Groq → Anthropic → OpenAI.

---

## Step 5 — Fill in Your Profile

### 5a. Edit config/profile.yml
Open `config/profile.yml` in a text editor. Replace all `[EDIT: ...]` fields:

```yaml
candidate:
  full_name: "Ravi Kumar"           ← your name
  email: "ravi@gmail.com"           ← your email
  phone: "+91-9876543210"           ← your phone
  linkedin: "linkedin.com/in/ravi"  ← your LinkedIn profile URL
```

Edit the rest of the file to match your degree, target roles, etc.

### 5b. Edit cv.md
Open `cv.md` in a text editor. This is your resume in markdown format.
Replace all `[EDIT: ...]` fields with your actual details.

**Important:** The AI uses this file to evaluate how well you match each job.
The more detail you add (projects, skills, achievements), the better the evaluations.

---

## Step 6 — Run Your First Evaluation

Find any internship on Naukri, LinkedIn, or Internshala. Copy the full job description text.
Then run:

```bash
# Smart evaluator (auto-picks whichever API key you set):
node eval.mjs "Paste the full job description text here inside quotes"

# Or save the JD to a file and pass the file:
node eval.mjs --file ./jds/tcs-intern.txt

# Force a specific API:
node eval.mjs --api gemini "JD text here"
node eval.mjs --api groq   "JD text here"
```

The system will:
1. Read your CV and profile
2. Evaluate the job against your profile (score 1-5, A-F grade)
3. Show what matches and what gaps you have
4. Save a report to the `reports/` folder

---

## Step 7 — Scan for Jobs Automatically

```bash
# Scan all configured portals (TCS, Infosys, Naukri, Internshala, etc.)
npm run scan

# Or if using Gemini CLI:
gemini   # then type: /career-ops scan
```

---

## API Limit Management — What to Do When One Runs Out

| API | Daily Limit | When Exhausted |
|-----|------------|----------------|
| Gemini | 1M tokens/day (resets at midnight) | Switch to Groq |
| Groq | 6000 tokens/min, no daily cap | Usually fine |
| Anthropic | Pay-per-use ($5 credit) | Switch to Gemini/Groq |
| OpenAI | Pay-per-use ($5 credit) | Switch to Gemini/Groq |

**Switching APIs manually:**
```bash
node eval.mjs --api groq "JD text"      # use Groq when Gemini is exhausted
node eval.mjs --api gemini "JD text"    # use Gemini when Groq hits rate limit
```

**Auto-switching (no extra work):**
Set multiple keys in `.env`. The `eval.mjs` script picks the first available one.

---

## Common Commands Reference

```bash
npm run eval -- "JD text"          # Evaluate a job (auto-picks API)
npm run gemini:eval -- "JD text"   # Force Gemini
npm run groq:eval -- "JD text"     # Force Groq
npm run claude:eval -- "JD text"   # Force Claude/Anthropic

npm run scan                       # Scan all configured portals
npm run doctor                     # Check if everything is set up correctly

node eval.mjs --file ./jds/job.txt # Evaluate from a saved file
```

---

## Folder Structure

```
career-ops/
├── cv.md                 ← YOUR RESUME (fill this in)
├── config/
│   └── profile.yml       ← YOUR PROFILE (fill this in)
├── portals.yml           ← Hyderabad company list (pre-configured)
├── .env                  ← API keys (add your keys here)
├── eval.mjs              ← Smart evaluator (start here)
├── gemini-eval.mjs       ← Gemini-specific evaluator
├── groq-eval.mjs         ← Groq-specific evaluator (free backup)
├── claude-eval.mjs       ← Anthropic API evaluator
├── reports/              ← Saved evaluation reports (auto-created)
├── jds/                  ← Save job descriptions here (auto-created)
├── data/                 ← Application tracker
└── modes/                ← AI evaluation logic (don't edit)
```

---

## Tips for Best Results

1. **Fill cv.md thoroughly** — add all projects, certifications, skills. The AI can only
   match what it knows about you.

2. **Evaluate before applying** — jobs scoring below 3.5/5 are not worth your time.
   Focus on 4.0+ scores.

3. **Save JDs as files** — create a folder `jds/` and save job descriptions as `.txt`
   files so you can re-evaluate or compare later.

4. **Use Gemini CLI for free** — if you don't want to manage API keys at all, install
   Gemini CLI (`npm install -g @google/gemini-cli`) and use it with your Google account.
   Zero cost, zero billing.

5. **Check reports/** — after each evaluation, a markdown report is saved. Review it
   before applying.

---

## Getting Help

- Project Discord: https://discord.gg/8pRpHETxa4
- Original README: README.md
- Setup issues: run `npm run doctor` to diagnose
