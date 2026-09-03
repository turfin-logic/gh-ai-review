const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { validateReview } = require('../dist/validation');
const { GitHubClient } = require('../dist/github');
const { AIReviewer } = require('../dist/reviewer');
const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; });
const valid = () => ({ summary: 'Advisory review', score: 70, severity: 'COMMENT', comments: [], suggestions: [] });
const pr = { number: 1, title: 'Example', user: { login: 'example' }, head: { ref: 'feature' }, base: { ref: 'main' }, changed_files: 1, additions: 1, deletions: 0 };

test('repository names cannot inject API paths or queries', () => {
  assert.deepEqual(GitHubClient.parseRepoUrl('owner/repo-name'), { owner: 'owner', repo: 'repo-name' });
  for (const value of ['/repo', 'owner/', 'owner/..', 'owner/repo?x=1', 'owner/repo/extra']) {
    assert.throws(() => GitHubClient.parseRepoUrl(value), /Invalid repo format/);
  }
});

test('valid structured review is accepted', () => { assert.deepEqual(validateReview(valid()), valid()); });
test('missing fields and invented scores are rejected', () => {
  for (const bad of [{}, { ...valid(), score: '90' }, { ...valid(), score: NaN }, { ...valid(), score: 101 }, { ...valid(), comments: null }]) {
    assert.throws(() => validateReview(bad), /invalid review/);
  }
});
test('unsafe or malformed inline comments are rejected', () => {
  for (const comment of [{ path: '../secret', line: 1, body: 'x' }, { path: 'a.ts', line: 0, body: 'x' }, { path: 'a.ts', line: 1, body: 'x', side: 'BAD' }]) {
    assert.throws(() => validateReview({ ...valid(), comments: [comment] }), /invalid inline/);
  }
});
test('PR files are collected from more than one page', async () => {
  const urls = [];
  global.fetch = async url => { urls.push(url); return Response.json(url.includes('page=2') ? [{ filename: 'last.ts' }] : Array.from({ length: 100 }, (_, i) => ({ filename: `${i}.ts` }))); };
  const files = await new GitHubClient({ token: 'test', owner: 'a', repo: 'b' }).getPRFiles(1);
  assert.equal(files.length, 101); assert.equal(urls.length, 2); assert.equal(files[100].filename, 'last.ts');
});
test('diff HTTP errors cannot be reviewed as source', async () => {
  global.fetch = async () => new Response('error', { status: 403 });
  await assert.rejects(new GitHubClient({ token: 'test', owner: 'a', repo: 'b' }).getPRDiff(1), /HTTP 403/);
});
test('invalid model JSON fails closed', async () => {
  global.fetch = async () => Response.json({ choices: [{ message: { content: 'not json' } }] });
  await assert.rejects(new AIReviewer('test').reviewPR(pr, [], 'diff'), /nothing will be posted/);
});
test('truncated review is visibly disclosed', async () => {
  global.fetch = async () => Response.json({ choices: [{ message: { content: JSON.stringify(valid()) } }] });
  assert.match((await new AIReviewer('test').reviewPR(pr, [], 'x'.repeat(9000))).summary, /PARTIAL REVIEW: first 8000 of 9000/);
});
test('out-of-PR model comments fail closed', async () => {
  global.fetch = async () => Response.json({ choices: [{ message: { content: JSON.stringify({ ...valid(), comments: [{ path: 'other.ts', line: 1, body: 'x' }] }) } }] });
  await assert.rejects(new AIReviewer('test').reviewPR(pr, [{ filename: 'a.ts' }], 'diff'), /outside this PR/);
});
test('posting uses the supplied advisory event', async () => {
  let body;
  global.fetch = async (_url, options) => { body = JSON.parse(options.body); return Response.json({}); };
  await new GitHubClient({ token: 'test', owner: 'a', repo: 'b' }).postReview(1, 'Advisory', 'COMMENT');
  assert.equal(body.event, 'COMMENT');
});
