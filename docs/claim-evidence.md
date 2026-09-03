# Claim evidence

Local verification snapshot: 3 September 2026. See GitHub Actions for subsequent remote results. VERIFIED means supported by the named code/check, not production certification. Remote CI, live model inference and posting have not been executed for this revision.

| Claim | Code evidence | Test evidence | Status |
|---|---|---|---|
| PR files are paginated | `src/github.ts:getPRFiles` | `test/review.test.cjs`: 101 files over two pages | VERIFIED |
| HTTP error pages cannot be treated as a diff | `getPRDiff` checks status | Mocked 403 regression | VERIFIED |
| Invalid structured model output fails before posting | `src/validation.ts`, `reviewer.ts` | Missing fields, invalid score/line/path, malformed JSON and out-of-PR comment cases | VERIFIED |
| Large diffs receive a partial-review warning | `reviewer.ts`: 8,000-character limit and summary prefix | 9,000-character regression | VERIFIED |
| Default CLI does not post; explicit posting is advisory | `src/index.ts`: `options.post && !options.dryRun`, literal COMMENT event | Transport test for COMMENT; complete CLI posting path not exercised against GitHub | PARTIAL |
| Runtime schema makes AI advice correct | Shape validation cannot establish semantics | No accuracy benchmark | FALSE — not claimed |
| Free inference on every listed model | Account/provider dependent | Live inference NOT EXECUTED | UNSUPPORTED — removed |
| Complete security review of a PR | Limited context, no execution or security scanner | No coverage proof | FALSE — explicitly disclaimed |
| Installs and builds from source | Lockfile, TypeScript build, CLI entry point | Clean `npm ci`, build, typecheck, tests and CLI help on Node 24.20.0 / Windows | VERIFIED within that environment |
| Windows/Linux and Node 22/24 compatibility | Proposed CI matrix, engines declaration | Node 24 Windows passed; Node 22 local run blocked by EPERM; remote matrix NOT EXECUTED | PARTIAL |

The source README documents data transfer to Hugging Face, optional posting, provider billing uncertainty and prompt-injection risk. A schema check is not a permission boundary or semantic safety guarantee. Published npm artifacts may differ until a reviewed release occurs.
