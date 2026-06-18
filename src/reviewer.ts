import OpenAI from 'openai';
import { PRInfo, PRFile, ReviewResult } from './types.js';

const REVIEW_PROMPT = `You are an expert senior software engineer doing a thorough code review. 
Analyze the provided PR diff and give detailed, actionable feedback.

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
1. 🐛 **Bugs**: Logic errors, off-by-one, null pointer risks, async/await issues
2. 🔒 **Security**: SQL injection, XSS, hardcoded secrets, insecure dependencies
3. ⚡ **Performance**: Unnecessary loops, memory leaks, blocking operations
4. 📝 **Code Quality**: Naming conventions, DRY principle, SOLID principles
5. 🧪 **Testing**: Missing tests for critical paths, edge cases not covered
6. 📚 **Documentation**: Missing JSDoc/comments for complex logic

Score: 0-100 (>=80 = APPROVE, 60-79 = COMMENT, <60 = REQUEST_CHANGES)

Respond ONLY with valid JSON, no markdown, no extra text.`;

export class AIReviewer {
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model = 'deepseek-chat') {
    // DeepSeek is OpenAI-compatible — just point to their base URL
    this.client = new OpenAI({
      apiKey,
      baseURL: 'https://api.deepseek.com/v1',
    });
    this.model = model;
  }

  async reviewPR(pr: PRInfo, files: PRFile[], diff: string): Promise<ReviewResult> {
    // Truncate diff if too large
    const maxDiffLength = 20000;
    const truncatedDiff = diff.length > maxDiffLength
      ? diff.substring(0, maxDiffLength) + '\n\n... [diff truncated for length] ...'
      : diff;

    const filesSummary = files.map(f =>
      `${f.filename} (${f.status}: +${f.additions}/-${f.deletions})`
    ).join('\n');

    const userMessage = `
## PR #${pr.number}: ${pr.title}

**Author:** ${pr.user.login}
**Branch:** ${pr.head.ref} → ${pr.base.ref}
**Changes:** +${pr.additions} -${pr.deletions} lines across ${pr.changed_files} files

**PR Description:**
${pr.body || 'No description provided.'}

**Files Changed:**
${filesSummary}

**Diff:**
\`\`\`diff
${truncatedDiff}
\`\`\`
`;

    const completion = await this.client.chat.completions.create({
      messages: [
        { role: 'system', content: REVIEW_PROMPT },
        { role: 'user', content: userMessage },
      ],
      model: this.model,
      temperature: 0.3,
      max_tokens: 4096,
    });

    const content = completion.choices[0]?.message?.content || '{}';

    // Parse JSON response
    let result: ReviewResult;
    try {
      // Extract JSON if wrapped in markdown code block
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : content;
      result = JSON.parse(jsonStr.trim());
    } catch {
      result = {
        summary: content.substring(0, 500),
        score: 70,
        severity: 'COMMENT',
        comments: [],
        suggestions: ['Review could not be fully parsed. Raw AI output above.'],
      };
    }

    return result;
  }
}
