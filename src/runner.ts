/**
 * Builds one run's results file: copy Novera, apply the run's patches, build,
 * run the suite, and merge the parts into the framework's e2e-results.json.
 *
 * Scenarios that change the target (proxy rules, base URL, server down) each
 * get their own Playwright invocation, so their fault touches only their test.
 * Everything else runs in one main invocation. The parts are blob reports,
 * merged with `playwright merge-reports` through the suite's own config, so
 * the file is written by the framework's reporter exactly as a sharded CI run
 * would write it.
 */
import { spawn } from 'node:child_process';
import { copyFileSync, createWriteStream, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startProxy, startStranger } from './proxy.ts';
import { NOVERA, ROOT, SCENARIOS_DIR, leafTitle, type Labels, type RunDef, type Scenario } from './scenarios.ts';

const APP_PORT = 3200;
const BASE_PORT = 3100; // The Novera profile's defaultBaseUrl.
const BASE_URL = `http://localhost:${BASE_PORT}`;

/** Env for every child process. Nothing else from the shell gets through. */
function childEnv(extra: Record<string, string> = {}): Record<string, string> {
  const pick = (name: string) => (process.env[name] ? { [name]: process.env[name]! } : {});
  return {
    ...pick('PATH'),
    ...pick('HOME'),
    ...pick('TMPDIR'),
    ...pick('PLAYWRIGHT_BROWSERS_PATH'),
    CI: '1', // the framework only retries in CI; retries are how flaky is recorded
    BLAZE_TEST_BROWSERSTACK: 'false',
    BLAZE_TEST_PLAYWRIGHT_PLATFORM_COVERAGE: 'chromium',
    PLAYWRIGHT_HTML_OPEN: 'never',
    NEXT_TELEMETRY_DISABLED: '1',
    ...extra,
  };
}

/** Every env var name the harness sets, for the leakage check. */
export const ENV_NAMES = [
  ...Object.keys(childEnv()),
  'BLAZE_TEST_PLAYWRIGHT_BASE_URL',
  'BLAZE_TEST_RESULTS_FILE',
];

interface Exec {
  code: number;
}

function exec(cmd: string, args: string[], cwd: string, env: Record<string, string>, log: string): Promise<Exec> {
  return new Promise((resolve, reject) => {
    const out = createWriteStream(log, { flags: 'a' });
    out.write(`\n$ ${cmd} ${args.join(' ')}\n`);
    const child = spawn(cmd, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.pipe(out, { end: false });
    child.stderr.pipe(out, { end: false });
    child.on('error', reject);
    child.on('close', (code) => {
      out.end();
      resolve({ code: code ?? 1 });
    });
  });
}

async function waitForHttp(url: string, ms: number): Promise<void> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`${url} did not come up in ${ms}ms`);
}

async function portFree(port: number): Promise<boolean> {
  try {
    await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1000) });
    return false;
  } catch {
    return true;
  }
}

function close(server: Server | undefined): Promise<void> {
  if (!server) return Promise.resolve();
  server.closeAllConnections();
  return new Promise((r) => server.close(() => r()));
}

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export interface RunOutcome {
  ok: boolean;
  resultsFile: string;
  problems: string[];
}

export async function executeRun(
  run: RunDef,
  scenarios: Map<string, Scenario>,
  labels: Labels,
  outDir: string,
): Promise<RunOutcome> {
  if (!existsSync(join(NOVERA, 'node_modules', '.bin', 'playwright'))) {
    throw new Error('novera/node_modules is missing: run `npm ci --prefix novera` and `npx --prefix novera playwright install chromium`.');
  }
  for (const port of [APP_PORT, BASE_PORT, 3110]) {
    if (!(await portFree(port))) throw new Error(`port ${port} is in use; stop whatever is on it first`);
  }

  const list = run.scenarios.map((id) => scenarios.get(id)!);
  const logDir = join(ROOT, '.work', 'logs', run.id);
  rmSync(logDir, { recursive: true, force: true });
  mkdirSync(logDir, { recursive: true });
  mkdirSync(outDir, { recursive: true });
  const log = (name: string) => join(logDir, `${name}.log`);

  // A neutral temp path: nothing about the run in it.
  // realpath: on macOS tmpdir() is under /var, a symlink to /private/var, which skews the reporter's relative paths.
  const work = realpathSync(mkdtempSync(join(tmpdir(), 'nv-')));
  const app = join(work, 'app');
  const suite = join(app, 'tests-pw', 'e2e');
  const blobs = join(work, 'blobs');
  let next: ReturnType<typeof spawn> | undefined;

  try {
    // 1. Copy (APFS clones on macOS, so node_modules is cheap) and drop VCS metadata.
    const cp = process.platform === 'darwin' ? ['-cR'] : ['-R'];
    if ((await exec('cp', [...cp, NOVERA, app], ROOT, childEnv(), log('setup'))).code) throw new Error('copy failed');
    for (const p of ['.git', '.next', 'tests-pw/e2e/test-results', 'tests-pw/e2e/playwright-report']) {
      rmSync(join(app, p), { recursive: true, force: true });
    }

    // 2. Patches.
    for (const s of list.filter((s) => s.patch)) {
      const r = await exec('patch', ['-p1', '--forward', '--batch', '-i', join(SCENARIOS_DIR, s.patch!)], app, childEnv(), log('setup'));
      if (r.code) throw new Error(`patch for ${s.id} did not apply (see ${log('setup')})`);
    }

    // 3. Build and serve the production app.
    if ((await exec('npm', ['run', 'build'], app, childEnv(), log('build'))).code) {
      throw new Error(`build failed (see ${log('build')})`);
    }
    next = spawn(join(app, 'node_modules', '.bin', 'next'), ['start', '--port', String(APP_PORT)], {
      cwd: app,
      env: childEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    next.stdout?.pipe(createWriteStream(log('server')));
    next.stderr?.pipe(createWriteStream(log('server-err')));
    await waitForHttp(`http://127.0.0.1:${APP_PORT}/`, 60_000);

    // 4. Parts: the main one runs everything except the isolated targets.
    const isolated = list.filter((s) => s.shard);
    const playwright = join(app, 'node_modules', '.bin', 'playwright');
    const part = async (name: string, opts: { grep?: string; grepInvert?: string; setup: boolean; baseUrl: string }) => {
      const config = join(suite, `playwright.${name}.config.ts`);
      writeFileSync(
        config,
        [
          'import base from "./playwright.config";',
          'export default {',
          '  ...base,',
          '  webServer: undefined,',
          opts.setup ? '' : '  globalSetup: undefined,',
          // Own directory per part: the blob reporter empties its outputDir when a run starts.
          `  reporter: [["blob", { outputDir: ${JSON.stringify(join(blobs, name))}, fileName: ${JSON.stringify(`${name}.zip`)} }]],`,
          '};',
          '',
        ].join('\n'),
      );
      const args = ['test', '--config', config];
      if (opts.grep) args.push('--grep', opts.grep);
      if (opts.grepInvert) args.push('--grep-invert', opts.grepInvert);
      await exec(playwright, args, suite, childEnv({ BLAZE_TEST_PLAYWRIGHT_BASE_URL: opts.baseUrl }), log(name));
    };

    const proxy = await startProxy({ listenPort: BASE_PORT, upstreamPort: APP_PORT, rules: [] });
    const invert = isolated.map((s) => escapeRegex(leafTitle(s.target)));
    await part('main', { grepInvert: invert.length ? `(${invert.join('|')})` : undefined, setup: true, baseUrl: BASE_URL });
    await close(proxy);

    for (const [i, s] of isolated.entries()) {
      const shard = s.shard!;
      const proxyServer =
        shard.proxy === false ? undefined : await startProxy({ listenPort: BASE_PORT, upstreamPort: APP_PORT, rules: shard.proxyRules ?? [] });
      const stranger = shard.stranger ? await startStranger(shard.stranger) : undefined;
      try {
        await part(`part-${i + 1}`, { grep: escapeRegex(leafTitle(s.target)), setup: false, baseUrl: shard.baseUrl ?? BASE_URL });
      } finally {
        await close(proxyServer);
        await close(stranger);
      }
    }

    // 5. Merge through the suite's config, so its reporter writes the file.
    const merge = join(suite, 'playwright.merge.config.ts');
    writeFileSync(merge, 'import base from "./playwright.config";\nexport default { ...base, webServer: undefined, globalSetup: undefined };\n');
    const resultsFile = join(outDir, 'e2e-results.json');
    rmSync(resultsFile, { force: true });
    const gathered = join(work, 'merge');
    mkdirSync(gathered);
    for (const name of ['main', ...isolated.map((_, i) => `part-${i + 1}`)]) {
      const zip = join(blobs, name, `${name}.zip`);
      if (!existsSync(zip)) throw new Error(`part ${name} wrote no blob report (see ${log(name)})`);
      copyFileSync(zip, join(gathered, `${name}.zip`));
    }
    await exec(playwright, ['merge-reports', '--config', merge, gathered], suite, childEnv({ BLAZE_TEST_RESULTS_FILE: resultsFile }), log('merge'));
    if (!existsSync(resultsFile)) throw new Error(`merge wrote no results (see ${log('merge')})`);

    const problems = manifestProblems(readFileSync(resultsFile, 'utf8'), list, labels);
    return { ok: problems.length === 0, resultsFile, problems };
  } finally {
    next?.kill('SIGTERM');
    rmSync(work, { recursive: true, force: true });
  }
}

/** The run's failures must be exactly its scenarios' targets, with the expected outcome. */
export function manifestProblems(json: string, list: Scenario[], labels: Labels): string[] {
  const results = JSON.parse(json) as { failures: { title: string; outcome: string }[] };
  const problems: string[] = [];
  const seen = new Map(results.failures.map((f) => [f.title, f.outcome]));
  for (const s of list) {
    const want = labels[s.id].category === 'flaky' ? 'flaky' : 'failed';
    const got = seen.get(s.target);
    if (got !== want) problems.push(`${s.id}: expected "${s.target}" to be ${want}, got ${got ?? 'passed or missing'}`);
    seen.delete(s.target);
  }
  for (const [title, outcome] of seen) problems.push(`unexpected ${outcome}: "${title}"`);
  return problems;
}
