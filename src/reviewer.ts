import { PRInfo, PRFile, ReviewResult } from './types.js';
import { validateReview } from './validation.js';

const REVIEW_PROMPT = `You are an expert senior software engineer doing a thorough code review. 
Analyze the provided PR diff and give detailed, actionable feedback.
You MUST write your entire review strictly in Professional English. Do not use any other language.

Your review must be structured as valid JSON with this exact format:
{
  "summary": "Brief summary of what this PR does and overall assessment",
  "score": 85,
  "severity": "APPROVE|REQUEST_CHANGES|COMMENT",
  "comments": [
    {
      "path": "src/file.ts",
      "line": 42,
      "body": "Detailed comment about the specific code issue",
      "side": "RIGHT"
    }
  ],
  "suggestions": [
    "General improvement suggestion 1",
    "General improvement suggestion 2"
  ]
}

Review criteria:
1. Bugs: Logic errors, off-by-one, null pointer risks, async/await issues
2. Security: SQL injection, XSS, hardcoded secrets, insecure dependencies
3. Performance: Unnecessary loops, memory leaks, blocking operations
4. Code Quality: Naming conventions, DRY principle, SOLID principles
5. Testing: Missing tests for critical paths, edge cases not covered
6. Documentation: Missing comments for complex logic

Score: 0-100 (>=80 = APPROVE, 60-79 = COMMENT, <60 = REQUEST_CHANGES)

Respond ONLY with valid JSON, no markdown, no extra text.`;

/**
 * Example model identifiers; availability and billing depend on the provider.
 * @constant {string[]}
 */
const HF_MODELS = [
  'meta-llama/Llama-3.1-8B-Instruct',
  'Qwen/Qwen2.5-72B-Instruct',
  'mistralai/Mixtral-8x7B-Instruct-v0.1',
];

/**
 * AIReviewer class handles interacting with the Hugging Face Router API
 * to generate automated PR code reviews based on diffs.
 */
export class AIReviewer {
  private apiKey: string;
  private model: string;
  private baseUrl = 'https://router.huggingface.co/v1/chat/completions';

  /**
   * Creates a new instance of AIReviewer.
   * @param {string} apiKey - Hugging Face API token.
   * @param {string} [model=HF_MODELS[0]] - Model identifier to use for inference.
   */
  constructor(apiKey: string, model = HF_MODELS[0]) {
    this.apiKey = apiKey;
    this.model = model;
  }

  /**
   * Generates a code review for a given PR and diff.
   * @param {PRInfo} pr - PR metadata (title, author, base/head refs, etc).
   * @param {PRFile[]} files - List of changed files.
   * @param {string} diff - The actual git diff content.
   * @returns {Promise<ReviewResult>} Parsed JSON review containing score, summary, and comments.
   * @throws {Error} If the API request fails after maximum retries.
   */
  async reviewPR(pr: PRInfo, files: PRFile[], diff: string): Promise<ReviewResult> {
    const maxDiffLength = 8000;
    const truncatedDiff = diff.length > maxDiffLength
      ? diff.substring(0, maxDiffLength) + '\n\n... [diff truncated] ...'
      : diff;

    const filesSummary = files.map(f =>
      `${f.filename} (${f.status}: +${f.additions}/-${f.deletions})`
    ).join('\n');

    const prompt = `<s>[INST] ${REVIEW_PROMPT}

## PR #${pr.number}: ${pr.title}
Author: ${pr.user.login}
Branch: ${pr.head.ref} to ${pr.base.ref}
Changes: +${pr.additions} -${pr.deletions} across ${pr.changed_files} files

PR Description: ${pr.body || 'No description provided.'}

Files Changed:
${filesSummary}

Diff:
${truncatedDiff}

Respond with ONLY valid JSON. [/INST]`;

    let response: Response | null = null;
    let errText = '';
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        response = await fetch(this.baseUrl, {
          method: 'POST',
          signal: AbortSignal.timeout(60000),
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: this.model,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 2048,
            temperature: 0.2,
          }),
        });
        if (response.ok) {
          break; // Success
        }

        errText = await response.text();
        // Retry rate limiting and temporary provider failures.
        if (![429, 503, 504, 524].includes(response.status)) {
          break; 
        }
      } catch (e: any) {
        errText = e.message;
      }

      if (attempt < maxRetries) {
        console.log(`\n⏳ Hugging Face API busy or loading (Attempt ${attempt}/${maxRetries}). Auto-retrying in 15 seconds...`);
        await new Promise(r => setTimeout(r, 15000));
      }
    }

    if (!response || !response.ok) {
      throw new Error(`Hugging Face API error (after ${maxRetries} attempts): ${response?.status || 'Network Error'} - ${errText}`);
    }

    const result = await response.json() as any;
    let content = result.choices?.[0]?.message?.content || result[0]?.generated_text || result.generated_text || '{}';

    // Accept a JSON object, optionally wrapped in a single Markdown code fence.
    const jsonStr = String(content).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    let parsed: unknown;
    try { parsed = JSON.parse(jsonStr); }
    catch { throw new Error('Model did not return valid JSON; nothing will be posted.'); }
    const review = validateReview(parsed);
    const changedPaths = new Set(files.map(file => file.filename));
    if (review.comments.some(comment => !changedPaths.has(comment.path))) {
      throw new Error('Model commented on a file outside this PR; nothing will be posted.');
    }
    if (diff.length > maxDiffLength) {
      review.summary = `[PARTIAL REVIEW: first ${maxDiffLength} of ${diff.length} diff characters.] ${review.summary}`;
    }
    return review;
  }
}
