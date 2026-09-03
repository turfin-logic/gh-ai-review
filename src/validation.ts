import { ReviewResult } from './types';

/** Treat model output as untrusted data. Never invent a passing fallback score. */
export function validateReview(value: unknown): ReviewResult {
  const r = value as ReviewResult;
  if (!r || typeof r !== 'object' || typeof r.summary !== 'string' || !r.summary.trim()
      || !Number.isFinite(r.score) || r.score < 0 || r.score > 100
      || !['APPROVE', 'REQUEST_CHANGES', 'COMMENT'].includes(r.severity)
      || !Array.isArray(r.comments) || r.comments.length > 100
      || !Array.isArray(r.suggestions) || !r.suggestions.every(s => typeof s === 'string')) {
    throw new Error('Model returned an invalid review; nothing will be posted.');
  }
  for (const c of r.comments) {
    if (!c || typeof c.path !== 'string' || !c.path || c.path.startsWith('/')
        || c.path.includes('\\') || c.path.split('/').includes('..')
        || !Number.isInteger(c.line) || c.line < 1 || typeof c.body !== 'string' || !c.body.trim()
        || (c.side !== undefined && c.side !== 'LEFT' && c.side !== 'RIGHT')) {
      throw new Error('Model returned an invalid inline comment; nothing will be posted.');
    }
  }
  return { summary: r.summary, score: r.score, severity: r.severity, comments: r.comments, suggestions: r.suggestions };
}
