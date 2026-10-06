/**
 * Calls the system under test, the `blaze-e2e-triage` CLI that ships with the
 * framework version Novera installs, exactly as a CI job would.
 */
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NOVERA, ROOT } from './scenarios.ts';

export const CLI = join(NOVERA, 'node_modules', '.bin', 'blaze-e2e-triage');

export interface TriagedFailure {
  test: string;
  platforms: string[];
  category: string;
  confidence: 'high' | 'medium' | 'low';
  summary: string;
  evidence: string;
  next_step: string;
}

export interface TriageCall {
  ok: boolean;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  /** The CLI's reason when it fell back to a plain list. */
  note?: string;
  verdict?: string;
  failures: TriagedFailure[];
  seconds: number;
}

/** ANTHROPIC_API_KEY (and ANTHROPIC_WORKSPACE_ID if present) from .env.local, and nowhere else. */
export function apiEnv(): Record<string, string> {
  const file = join(ROOT, '.env.local');
  if (!existsSync(file)) throw new Error('.env.local not found; create it with ANTHROPIC_API_KEY=...');
  const env: Record<string, string> = {};
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = /^\s*(ANTHROPIC_API_KEY|ANTHROPIC_WORKSPACE_ID)\s*=\s*"?([^"\s]+)"?\s*$/.exec(line);
    if (m) env[m[1]] = m[2];
  }
  if (!env.ANTHROPIC_API_KEY) throw new Error('.env.local has no ANTHROPIC_API_KEY');
  return env;
}

function run(args: string[], cwd: string, extra: Record<string, string>): Promise<string> {
  return new Promise((resolve, reject) => {
    // Only what the CLI needs: no Slack webhook, no GitHub summary file, no shell secrets.
    const env = { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', ...extra };
    const child = spawn(CLI, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('error', reject);
    child.on('close', () => resolve(out));
  });
}

/** `--dry-run`: what would be sent, with no API call. Returns the CLI's output. */
export async function dryRun(resultsFile: string, dir: string): Promise<{ chars: number | undefined; output: string }> {
  mkdirSync(dir, { recursive: true });
  const output = await run(['--dry-run', '--no-slack', '--results', resultsFile], dir, {});
  writeFileSync(join(dir, 'dry-run.txt'), output);
  const m = /Would send (\d+) characters/.exec(output);
  return { chars: m ? Number(m[1]) : undefined, output };
}

/**
 * One real triage. The results file is copied into `dir` because the CLI
 * writes e2e-triage.json next to the file it reads.
 */
export async function triageOnce(resultsFile: string, dir: string, api: Record<string, string>): Promise<TriageCall> {
  mkdirSync(dir, { recursive: true });
  const input = join(dir, 'e2e-results.json');
  copyFileSync(resultsFile, input);
  const started = Date.now();
  const output = await run(['--no-slack', '--results', input], dir, api);
  const seconds = Math.round((Date.now() - started) / 100) / 10;
  writeFileSync(join(dir, 'cli-output.txt'), output);

  const usage = /Triaged with (\S+) \((\d+) input \/ (\d+) output tokens\)/.exec(output);
  const triageFile = join(dir, 'e2e-triage.json');
  if (!usage || !existsSync(triageFile)) {
    const note = /> Not triaged: (.*)\./.exec(output)?.[1] ?? /warning: (.*)/.exec(output)?.[1] ?? 'no triage written';
    return { ok: false, note, failures: [], seconds };
  }
  const triage = JSON.parse(readFileSync(triageFile, 'utf8')) as { verdict: string; failures: TriagedFailure[] };
  return {
    ok: true,
    model: usage[1],
    inputTokens: Number(usage[2]),
    outputTokens: Number(usage[3]),
    verdict: triage.verdict,
    failures: triage.failures,
    seconds,
  };
}
