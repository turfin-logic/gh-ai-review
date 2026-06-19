import { PRInfo, PRFile, ReviewResult } from './types.js';

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

// Free Hugging Face models good for code review
const HF_MODELS = [
  'meta-llama/Llama-3.1-8B-Instruct',
  'Qwen/Qwen2.5-72B-Instruct',
  'mistralai/Mixtral-8x7B-Instruct-v0.1',
];

export class AIReviewer {
  private apiKey: string;
  private model: string;
  private baseUrl = 'https://router.huggingface.co/v1/chat/completions';

  constructor(apiKey: string, model = HF_MODELS[0]) {
    this.apiKey = apiKey;
    this.model = model;
  }

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
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

        response = await fetch(this.baseUrl, {
          method: 'POST',
          signal: controller.signal,
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
        clearTimeout(timeoutId);

        if (response.ok) {
          break; // Success
        }

        errText = await response.text();
        // Only retry on 503 (Loading/Unavailable), 504 (Gateway Timeout), 524 (A timeout occurred)
        if (![503, 504, 524].includes(response.status)) {
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

    let parsedResult: ReviewResult;
    try {
      // Extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : content;
      parsedResult = JSON.parse(jsonStr.trim());
    } catch {
      parsedResult = {
        summary: content.substring(0, 500) || 'Review generated but could not be parsed.',
        score: 70,
        severity: 'COMMENT',
        comments: [],
        suggestions: ['Run again if the model was still loading.'],
      };
    }

    return parsedResult;
  }
}
