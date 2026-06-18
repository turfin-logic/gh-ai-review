export interface PRFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
  raw_url: string;
}

export interface PRInfo {
  number: number;
  title: string;
  body: string;
  user: { login: string };
  base: { ref: string; repo: { full_name: string } };
  head: { ref: string };
  state: string;
  changed_files: number;
  additions: number;
  deletions: number;
  html_url: string;
}

export interface ReviewComment {
  path: string;
  line: number;
  body: string;
  side?: 'LEFT' | 'RIGHT';
}

export interface ReviewResult {
  summary: string;
  score: number;
  severity: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
  comments: ReviewComment[];
  suggestions: string[];
}

export interface GitHubConfig {
  token: string;
  owner: string;
  repo: string;
}
