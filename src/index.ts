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

function getHFKey(): string {
  const key = process.env.HF_API_KEY;
  if (!key) {
    throw new Error(
      'Hugging Face API key not found!\n' +
      'Set HF_API_KEY env variable.\n' +
      'Get your FREE key at: https://huggingface.co/settings/tokens'
    );
  }
  return key;
}

function printBanner() {
  console.log(chalk.cyan(`
╔═══════════════════════════════════════╗
║        🤖 gh-ai-review v1.2.13        ║
║   AI-powered PR review by HuggingFace ║
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
  .description('AI-powered GitHub PR code reviewer using Hugging Face (Free)')
  .version('1.2.13');

program
  .command('review')
  .description('Review a Pull Request with AI')
  .argument('<pr-number>', 'Pull Request number to review')
  .option('-r, --repo <repo>', 'Repository in format owner/repo (default: current repo)')
  .option('-m, --model <model>', 'HuggingFace model to use', 'meta-llama/Llama-3.1-8B-Instruct')
  .option('--post', 'Post review as GitHub comment (default: just show locally)')
  .option('--dry-run', 'Show what would be posted without actually posting')
  .action(async (prNumber: string, options: { repo?: string; model: string; post?: boolean; dryRun?: boolean }) => {
    printBanner();

    try {
      // Get tokens
      const githubToken = getGitHubToken();
      const hfKey = getHFKey();

      // Get repo info
      let owner: string, repo: string;
      if (options.repo) {
        [owner, repo] = options.repo.split('/');
      } else {
        try {
          const remoteUrl = execSync('git config --get remote.origin.url', { stdio: 'pipe' }).toString().trim();
          const match = remoteUrl.match(/github\.com[:/](.+)\/(.+)\.git/);
          if (!match) {
            throw new Error('Could not parse GitHub repo from git remote origin url.');
          }
          owner = match[1];
          repo = match[2];
        } catch (e: any) {
          throw new Error('Cannot detect repo. You are not in a git repository. Use --repo owner/repo flag.');
        }
      }

      const prNum = parseInt(prNumber, 10);
      if (isNaN(prNum)) throw new Error(`Invalid PR number: ${prNumber}`);

      console.log(chalk.dim(`Repository: ${owner}/${repo}`));
      console.log(chalk.dim(`PR Number: #${prNum}`));
      console.log(chalk.dim(`Model: ${options.model}\n`));

      const github = new GitHubClient({ token: githubToken, owner, repo });
      const reviewer = new AIReviewer(hfKey, options.model);

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
      let aiSpinner = ora(`🤖 Hugging Face is analyzing the code...`).start();
      const result = await reviewer.reviewPR(pr, files, diff);
      aiSpinner.succeed('AI review complete!');

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
*Powered by Hugging Face AI (Free) • [Install gh-ai-review](https://github.com/turfin-logic/gh-ai-review)*`;

        // Filter out invalid inline comments (need line numbers in diff)
        const validComments = result.comments?.filter((c: any) =>
          c.path && c.line && c.body
        ) || [];

        try {
          await github.postReview(prNum, reviewBody, 'COMMENT', validComments);
        } catch (error: any) {
          if (error.message.includes('422')) {
            console.log(chalk.yellow('\n⚠️ GitHub rejected inline comments (line number mismatch). Falling back to general comment...'));
            
            let fallbackBody = reviewBody + '\n\n### 💬 Inline Comments (Fallback)\n';
            for (const c of validComments) {
              fallbackBody += `\n**File:** \`${c.path}\` (Line ${c.line})\n> ${c.body}\n`;
            }
            
            await github.postReview(prNum, fallbackBody, 'COMMENT', []);
          } else {
            throw error;
          }
        }
        spinner.succeed('Review posted to GitHub!');

        console.log(chalk.green(`\n✅ Review posted! View at: ${pr.html_url}`));
      } else if (options.post && options.dryRun) {
        console.log(chalk.yellow('\n[DRY RUN] Would post review to GitHub (use --post without --dry-run)'));
      } else {
        console.log(chalk.dim('\nTip: Use --post flag to automatically post review to GitHub PR!'));
      }

    } catch (error: any) {
      console.error(chalk.red(`\n❌ Error: ${error.message || error}`));
      if (error.cause) {
        console.error(chalk.red(`   Cause: ${error.cause}`));
      }
      process.exit(1);
    }
  });

program
  .command('config')
  .description('Show configuration and API key status')
  .action(() => {
    printBanner();
    const githubOk = !!(process.env.GITHUB_TOKEN || process.env.GH_TOKEN);
    const hfOk = !!process.env.HF_API_KEY;

    console.log(chalk.bold('Configuration Status:'));
    console.log(`  GitHub Token: ${githubOk ? chalk.green('✅ Set') : chalk.red('❌ Not set (set GITHUB_TOKEN)')}`);
    console.log(`  HF API Key:   ${hfOk ? chalk.green('✅ Set') : chalk.red('❌ Not set (set HF_API_KEY)')}`);
    console.log('\nGet FREE HuggingFace key: ' + chalk.blue('https://huggingface.co/settings/tokens'));
    console.log('Get GitHub token:         ' + chalk.blue('https://github.com/settings/tokens'));
  });

// Handle called as gh extension (gh ai-review review <pr>)
const args = process.argv.slice(2);
if (args.length > 0 && !['review', 'config', '--help', '-h', '--version', '-V'].includes(args[0])) {
  // User called: gh ai-review 123 (without 'review' subcommand)
  process.argv.splice(2, 0, 'review');
}

program.parse(process.argv);
