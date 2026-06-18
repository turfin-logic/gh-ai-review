#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { execSync } from 'child_process';
import { GitHubClient } from './github.js';
import { AIReviewer } from './reviewer.js';

const program = new Command();

function getGitHubToken(): string {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token) return token;

  // Try to get from gh CLI
  try {
    const ghToken = execSync('gh auth token', { encoding: 'utf8' }).trim();
    if (ghToken) return ghToken;
  } catch {
    // gh CLI not available or not logged in
  }

  throw new Error(
    'GitHub token not found!\n' +
    'Set GITHUB_TOKEN env variable or login with: gh auth login'
  );
}

function getDeepSeekKey(): string {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) {
    throw new Error(
      'DeepSeek API key not found!\n' +
      'Set DEEPSEEK_API_KEY env variable.\n' +
      'Get your free key at: https://platform.deepseek.com'
    );
  }
  return key;
}

function printBanner() {
  console.log(chalk.cyan.bold(`
╔═══════════════════════════════════════╗
║        🤖 gh-ai-review v1.0.0         ║
║   AI-powered PR review by DeepSeek    ║
╚═══════════════════════════════════════╝
`));
}

function printResult(result: any) {
  const scoreColor = result.score >= 80 ? chalk.green : result.score >= 60 ? chalk.yellow : chalk.red;
  const severityEmoji: Record<string, string> = {
    APPROVE: '✅',
    REQUEST_CHANGES: '❌',
    COMMENT: '💬',
  };

  console.log('\n' + chalk.bold('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log(chalk.bold('📊 REVIEW RESULT'));
  console.log(chalk.bold('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));

  console.log(`\n${severityEmoji[result.severity] || '💬'} ${chalk.bold('Decision:')} ${chalk.bold(result.severity)}`);
  console.log(`📈 ${chalk.bold('Quality Score:')} ${scoreColor.bold(result.score + '/100')}`);
  console.log(`\n📝 ${chalk.bold('Summary:')}`);
  console.log(chalk.white('  ' + result.summary));

  if (result.comments && result.comments.length > 0) {
    console.log(`\n💬 ${chalk.bold(`Inline Comments (${result.comments.length}):`)}`);
    result.comments.forEach((c: any, i: number) => {
      console.log(chalk.yellow(`\n  [${i + 1}] ${c.path}:${c.line}`));
      console.log(chalk.white('  ' + c.body));
    });
  }

  if (result.suggestions && result.suggestions.length > 0) {
    console.log(`\n💡 ${chalk.bold('Suggestions:')}`);
    result.suggestions.forEach((s: string) => {
      console.log(chalk.blue('  • ' + s));
    });
  }

  console.log('\n' + chalk.bold('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
}

program
  .name('gh-ai-review')
  .description('🤖 AI-powered GitHub PR code reviewer using DeepSeek')
  .version('1.0.0');

program
  .command('review')
  .description('Review a Pull Request with AI')
  .argument('<pr-number>', 'Pull Request number to review')
  .option('-r, --repo <repo>', 'Repository in format owner/repo (default: current repo)')
  .option('-m, --model <model>', 'DeepSeek model to use', 'deepseek-chat')
  .option('--post', 'Post review as GitHub comment (default: just show locally)')
  .option('--dry-run', 'Show what would be posted without actually posting')
  .action(async (prNumber: string, options: { repo?: string; model: string; post?: boolean; dryRun?: boolean }) => {
    printBanner();

    try {
      // Get tokens
      const githubToken = getGitHubToken();
      const deepseekKey = getDeepSeekKey();

      // Get repo info
      let owner: string, repo: string;
      if (options.repo) {
        const parsed = GitHubClient.parseRepoUrl(options.repo);
        owner = parsed.owner;
        repo = parsed.repo;
      } else {
        // Try to detect from git remote
        try {
          const remoteUrl = execSync('git remote get-url origin', { encoding: 'utf8' }).trim();
          const match = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
          if (!match) throw new Error('Cannot parse remote URL');
          owner = match[1];
          repo = match[2];
        } catch {
          throw new Error('Cannot detect repo. Use --repo owner/repo flag');
        }
      }

      const prNum = parseInt(prNumber, 10);
      if (isNaN(prNum)) throw new Error(`Invalid PR number: ${prNumber}`);

      console.log(chalk.dim(`Repository: ${owner}/${repo}`));
      console.log(chalk.dim(`PR Number: #${prNum}`));
      console.log(chalk.dim(`Model: ${options.model}\n`));

      const github = new GitHubClient({ token: githubToken, owner, repo });
      const reviewer = new AIReviewer(deepseekKey, options.model);

      // Fetch PR data
      let spinner = ora('Fetching PR details from GitHub...').start();
      const [pr, files, diff] = await Promise.all([
        github.getPR(prNum),
        github.getPRFiles(prNum),
        github.getPRDiff(prNum),
      ]);
      spinner.succeed(`Fetched PR #${prNum}: "${pr.title}"`);

      console.log(chalk.dim(`  Changed files: ${files.length} | +${pr.additions} -${pr.deletions}`));

      // AI Review
      spinner = ora('🤖 DeepSeek is analyzing the code...').start();
      const result = await reviewer.reviewPR(pr, files, diff);
      spinner.succeed('AI review complete!');

      // Display result
      printResult(result);

      // Post to GitHub if requested
      if (options.post && !options.dryRun) {
        spinner = ora('Posting review to GitHub...').start();

        const reviewBody = `## 🤖 AI Code Review by [gh-ai-review](https://github.com/turfin-logic/gh-ai-review)

**Quality Score:** ${result.score}/100
**Decision:** ${result.severity}

### Summary
${result.summary}

${result.suggestions?.length ? '### 💡 Suggestions\n' + result.suggestions.map((s: string) => `- ${s}`).join('\n') : ''}

---
*Powered by DeepSeek AI • [Install gh-ai-review](https://github.com/turfin-logic/gh-ai-review)*`;

        // Filter out invalid inline comments (need line numbers in diff)
        const validComments = result.comments?.filter((c: any) =>
          c.path && c.line && c.body
        ) || [];

        await github.postReview(prNum, reviewBody, result.severity, validComments);
        spinner.succeed('Review posted to GitHub!');

        console.log(chalk.green(`\n✅ Review posted! View at: ${pr.html_url}`));
      } else if (options.post && options.dryRun) {
        console.log(chalk.yellow('\n[DRY RUN] Would post review to GitHub (use --post without --dry-run)'));
      } else {
        console.log(chalk.dim('\nTip: Use --post flag to automatically post review to GitHub PR!'));
      }

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(chalk.red('\n❌ Error: ') + message);
      process.exit(1);
    }
  });

program
  .command('config')
  .description('Show configuration and API key status')
  .action(() => {
    printBanner();
    const githubOk = !!(process.env.GITHUB_TOKEN || process.env.GH_TOKEN);
    const deepseekOk = !!process.env.DEEPSEEK_API_KEY;

    console.log(chalk.bold('Configuration Status:'));
    console.log(`  GitHub Token: ${githubOk ? chalk.green('✅ Set') : chalk.red('❌ Not set (set GITHUB_TOKEN)')}`);
    console.log(`  DeepSeek Key: ${deepseekOk ? chalk.green('✅ Set') : chalk.red('❌ Not set (set DEEPSEEK_API_KEY)')}`);
    console.log('\nGet DeepSeek API key: ' + chalk.blue('https://platform.deepseek.com'));
    console.log('Get GitHub token:     ' + chalk.blue('https://github.com/settings/tokens'));
  });

// Handle called as gh extension (gh ai-review review <pr>)
const args = process.argv.slice(2);
if (args.length > 0 && !['review', 'config', '--help', '-h', '--version', '-V'].includes(args[0])) {
  // User called: gh ai-review 123 (without 'review' subcommand)
  process.argv.splice(2, 0, 'review');
}

program.parse(process.argv);
