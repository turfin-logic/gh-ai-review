# gh-ai-review

[![CI](https://github.com/turfin-logic/gh-ai-review/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/turfin-logic/gh-ai-review/actions/workflows/ci.yml)

Experimental CLI for generating advisory pull-request reviews using Hugging Face. It displays a review locally by default and posts a COMMENT review only when `--post` is supplied. It never merges a PR. Model output is advice, not a security scan or an objective quality measurement.

## Run from source

Requires Node.js 22.14+ and npm. An authenticated GitHub CLI is optional when a GitHub token is provided separately.

```sh
git clone https://github.com/turfin-logic/gh-ai-review.git
cd gh-ai-review
npm ci --ignore-scripts
npm run build
node dist/index.js --help
```

Configure `GITHUB_TOKEN` (or `GH_TOKEN`, or `gh auth login`) and `HF_API_KEY` through your shell's environment. Grant the GitHub token only the repository access needed; posting requires permission to write PR reviews. Never put tokens in command arguments, README examples or source. Provider access, availability and costs depend on your Hugging Face account and chosen model.

```sh
node dist/index.js review 123 --repo owner/repository
node dist/index.js review 123 --repo owner/repository --post --dry-run
```

These examples require a real accessible PR. `--dry-run` prevents posting, but still sends the diff to Hugging Face. Remove `--dry-run` only when you intend to post. The manual Actions workflow operates from trusted default-branch code and requires explicit dispatch.

## Validation

```sh
npm test
npm run typecheck
npm audit --audit-level=high
npm pack --dry-run
```

Tests mock network calls. They cover pagination, HTTP errors, structured output rejection, invalid/out-of-PR comments and partial-review disclosure. They do not establish model accuracy or live provider availability. The CI workflow is configured to run tests/type checking on Windows and Linux with Node 22.14 and 24.

## Boundaries

- PR metadata, filenames and up to 8,000 diff characters are sent to Hugging Face. Private code therefore leaves GitHub; obtain the code owner's authorization before use.
- Larger diffs are explicitly labeled PARTIAL REVIEW. This tool cannot claim to review the whole PR in that case.
- Model responses must satisfy a runtime schema. Invalid data fails without posting; no synthetic passing score is created.
- Model input can contain adversarial instructions. Treat output as untrusted and review it yourself. Validation is not proof of semantic correctness.
- Inline comments may not map to valid diff lines; GitHub rejection falls back to a general advisory review.
- Source install/build is documented here. Registry publication of these changes is a separate release step.

Architecture: `src/index.ts` handles CLI orchestration, `github.ts` GitHub transport, `reviewer.ts` model calls, and `validation.ts` the output boundary. See [claim evidence](docs/claim-evidence.md). MIT license.
