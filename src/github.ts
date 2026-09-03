import { PRInfo, PRFile, ReviewComment, GitHubConfig } from './types.js';

export class GitHubClient {
  private config: GitHubConfig;
  private baseUrl = 'https://api.github.com';

  constructor(config: GitHubConfig) {
    this.config = config;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      signal: AbortSignal.timeout(30000),
      headers: {
        'Authorization': `token ${this.config.token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'gh-ai-review/1.0.0',
        ...(options.headers || {}),
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GitHub API error ${response.status}: ${error}`);
    }

    return response.json() as Promise<T>;
  }

  async getPR(prNumber: number): Promise<PRInfo> {
    return this.request<PRInfo>(
      `/repos/${this.config.owner}/${this.config.repo}/pulls/${prNumber}`
    );
  }

  async getPRFiles(prNumber: number): Promise<PRFile[]> {
    const files: PRFile[] = [];
    for (let page = 1; page <= 100; page++) {
      const batch = await this.request<PRFile[]>(
        `/repos/${this.config.owner}/${this.config.repo}/pulls/${prNumber}/files?per_page=100&page=${page}`
      );
      if (!Array.isArray(batch)) throw new Error('Invalid PR file response');
      files.push(...batch);
      if (batch.length < 100) return files;
    }
    throw new Error('PR file list exceeds the supported pagination limit');
  }

  async getPRDiff(prNumber: number): Promise<string> {
    const response = await fetch(
      `${this.baseUrl}/repos/${this.config.owner}/${this.config.repo}/pulls/${prNumber}`,
      {
        signal: AbortSignal.timeout(30000),
        headers: {
          'Authorization': `token ${this.config.token}`,
          'Accept': 'application/vnd.github.v3.diff',
          'User-Agent': 'gh-ai-review/1.0.0',
        },
      }
    );
    if (!response.ok) throw new Error(`GitHub diff request failed: HTTP ${response.status}`);
    return response.text();
  }

  async postReview(
    prNumber: number,
    body: string,
    event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT',
    comments: ReviewComment[] = []
  ): Promise<void> {
    await this.request(
      `/repos/${this.config.owner}/${this.config.repo}/pulls/${prNumber}/reviews`,
      {
        method: 'POST',
        body: JSON.stringify({
          body,
          event,
          comments: comments.map(c => ({
            path: c.path,
            line: c.line,
            body: c.body,
            side: c.side || 'RIGHT',
          })),
        }),
      }
    );
  }

  async postComment(prNumber: number, body: string): Promise<void> {
    await this.request(
      `/repos/${this.config.owner}/${this.config.repo}/issues/${prNumber}/comments`,
      {
        method: 'POST',
        body: JSON.stringify({ body }),
      }
    );
  }

  static parseRepoUrl(repoFullName: string): { owner: string; repo: string } {
    const parts = repoFullName.split('/');
    if (parts.length !== 2 || !/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(parts[0]) || !/^[A-Za-z0-9_.-]+$/.test(parts[1]) || ['.', '..'].includes(parts[1])) {
      throw new Error(`Invalid repo format. Expected "owner/repo", got: ${repoFullName}`);
    }
    return { owner: parts[0], repo: parts[1] };
  }
}
