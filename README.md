# gh-ai-review

> AI-powered GitHub Pull Request code reviewer — powered by **Hugging Face (Llama-3)**

[![npm version](https://img.shields.io/npm/v/gh-ai-review.svg)](https://npmjs.com/package/gh-ai-review)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/turfin-logic/gh-ai-review?style=social)](https://github.com/turfin-logic/gh-ai-review)

Review any Pull Request instantly with AI from your terminal. No more waiting for human reviewers — get instant feedback on bugs, security issues, performance, and code quality.

---

## ✨ Features

- 🧠 **AI-Powered** — Uses Llama-3.1-8B-Instruct via Hugging Face (completely free)
- 🐛 **Bug Detection** — Spots logic errors, null pointers, async issues
- 🔒 **Security Scanning** — Finds hardcoded secrets, injection vulnerabilities
- ⚡ **Performance Analysis** — Detects memory leaks, blocking ops, N+1 queries
- 📊 **Quality Score** — 0-100 score with APPROVE/REQUEST_CHANGES/COMMENT decision
- 💬 **Inline Comments** — Posts directly on GitHub PR diff lines
- 🤖 **GitHub Actions** — Auto-review every PR automatically
- ⚡ **Works everywhere** — CLI + GitHub Actions + `gh` extension

---

## Quick Start

### Install

```bash
npm install -g gh-ai-review
```

### Set API Keys

```bash
# Get free access token from https://huggingface.co/settings/tokens
export HF_API_KEY=your_token_here

# GitHub token (already set if using gh CLI)
export GITHUB_TOKEN=your_github_token
```

### Review a PR

```bash
# Review PR #42 locally (shows output in terminal)
gh-ai-review review 42 --repo turfin-logic/my-project

# Review and post result directly to GitHub PR
gh-ai-review review 42 --repo turfin-logic/my-project --post

# Dry run (see what would be posted)
gh-ai-review review 42 --repo turfin-logic/my-project --post --dry-run
```

---

## 🤖 GitHub Action (Auto-review every PR)

Add this to your repo at `.github/workflows/ai-review.yml`:

```yaml
name: AI Code Review

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  ai-review:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
      contents: read
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm install -g gh-ai-review
      - run: gh-ai-review review ${{ github.event.pull_request.number }} --repo ${{ github.repository }} --post
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          HF_API_KEY: ${{ secrets.HF_API_KEY }}
```

> **Add secret:** Go to `Settings → Secrets → HF_API_KEY` in your repo.

---

## 📊 Sample Output

```
╔═══════════════════════════════════════╗
║        🤖 gh-ai-review v1.0.0         ║
║   AI-powered PR review by Hugging Face    ║
╚═══════════════════════════════════════╝

✅ Fetched PR #42: "Add user authentication"
🤖 Hugging Face is analyzing the code...
✅ AI review complete!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 REVIEW RESULT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

❌ Decision: REQUEST_CHANGES
📈 Quality Score: 52/100

📝 Summary:
  This PR adds JWT authentication but has a critical security issue — 
  the secret key is hardcoded in auth.ts line 15. Also missing rate 
  limiting on the login endpoint.

💬 Inline Comments (2):
  [1] src/auth.ts:15
  ⚠️ Hardcoded secret key detected! Move to environment variable: 
  process.env.JWT_SECRET

  [2] src/routes/login.ts:23
  Missing rate limiting — this endpoint is vulnerable to brute force attacks.
  Add express-rate-limit middleware.

💡 Suggestions:
  • Add unit tests for the authentication flow
  • Consider using refresh tokens alongside access tokens
```

---

## ⚙️ Configuration

| Env Variable | Required | Description |
|---|---|---|
| `HF_API_KEY` | ✅ Yes | Get free at [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens) |
| `GITHUB_TOKEN` | ✅ Yes | GitHub personal access token or `gh auth login` |

### Options

```
gh-ai-review review <pr-number> [options]

Options:
  -r, --repo <owner/repo>   Repository (default: auto-detect from git)
  -m, --model <model>       Hugging Face model (default: meta-llama/Llama-3.1-8B-Instruct)
  --post                    Post review to GitHub PR
  --dry-run                 Preview without posting
```

---

## 🆓 Free API

**Hugging Face offers free serverless inference APIs**.

Get your token: [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens)

---

## 📝 License

MIT © [turfin-logic](https://github.com/turfin-logic)

---

## Star this repo if it helped you!

Built with ❤️ by [@turfin-logic](https://github.com/turfin-logic)
