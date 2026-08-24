import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Planner, PlannerRequest } from './types.js';

const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
export const MAX_CODEX_CHUNK_SECONDS = 600;
export const DEFAULT_CODEX_CHUNK_SECONDS = 540;

export class BenchmarkProviderError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'BenchmarkProviderError';
  }
}

export type ForegroundCommand = {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  stdin: 'ignore';
  timeoutMs: number;
};
export type ForegroundRunner = (command: ForegroundCommand) => Promise<void>;

/** Copies the process environment without ever reading API-key values. */
export function subscriptionEnvironment(source = process.env): NodeJS.ProcessEnv {
  const clean: NodeJS.ProcessEnv = {};
  for (const name of Object.keys(source)) {
    if (/OPENAI.*(?:API_?)?KEY/i.test(name)) continue;
    clean[name] = source[name];
  }
  return clean;
}

export async function runForegroundCommand(command: ForegroundCommand): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command.command, command.args, {
      cwd: command.cwd,
      env: command.env,
      detached: false,
      stdio: [command.stdin, 'pipe', 'pipe'],
    });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 2_000).unref();
    }, command.timeoutMs);
    // JSONL progress and provider stderr may contain runtime details. Drain both
    // without retaining or publishing either stream.
    child.stdout.resume();
    child.stderr.resume();
    child.on('error', () => {
      clearTimeout(timer);
      reject(new BenchmarkProviderError('BENCHMARK_PROVIDER_START_FAILED'));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) reject(new BenchmarkProviderError('BENCHMARK_PROVIDER_TIMEOUT'));
      else if (code !== 0) reject(new BenchmarkProviderError('BENCHMARK_PROVIDER_FAILED'));
      else resolve();
    });
  });
}

export type SubscriptionProviderOptions = {
  cwd: string;
  outputSchemaFile: string;
  timeoutSeconds?: number;
  command?: string;
  runner?: ForegroundRunner;
  authCheck?: () => boolean;
  environment?: NodeJS.ProcessEnv;
};

const defaultAuthCheck = () => {
  const result = spawnSync('codex', ['login', 'status'], {
    encoding: 'utf8',
    timeout: 10_000,
    env: subscriptionEnvironment(),
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return result.status === 0 && result.stdout.includes('Logged in using ChatGPT');
};

function providerPrompt(request: PlannerRequest): string {
  const repair = request.previousLayout !== undefined;
  return JSON.stringify({
    task: repair
      ? 'Repair the architecture layout. Do not inspect or modify files and do not call tools. Return only JSON matching the supplied output schema.'
      : 'Plan the architecture layout. Do not inspect or modify files and do not call tools. Return only JSON matching the supplied output schema.',
    architecture: request.architecture,
    ...(request.view ? { view: request.view } : {}),
    ...(repair
      ? {
          previousLayout: request.previousLayout,
          diagnostics: request.errors ?? [],
        }
      : {}),
  });
}

/** ChatGPT Subscription provider boundary. It never consults OPENAI_API_KEY. */
export class CodexSubscriptionPlanner implements Planner {
  private authChecked = false;
  private readonly timeoutSeconds: number;
  private readonly runner: ForegroundRunner;
  private readonly authCheck: () => boolean;
  private readonly command: string;
  private readonly environment: NodeJS.ProcessEnv;

  constructor(private readonly options: SubscriptionProviderOptions) {
    this.timeoutSeconds = options.timeoutSeconds ?? DEFAULT_CODEX_CHUNK_SECONDS;
    if (
      !Number.isInteger(this.timeoutSeconds) ||
      this.timeoutSeconds < 1 ||
      this.timeoutSeconds > MAX_CODEX_CHUNK_SECONDS
    )
      throw new BenchmarkProviderError('BENCHMARK_TIMEOUT_OUT_OF_RANGE');
    this.runner = options.runner ?? runForegroundCommand;
    this.authCheck = options.authCheck ?? defaultAuthCheck;
    this.command = options.command ?? 'codex';
    this.environment = subscriptionEnvironment(options.environment);
  }

  async plan(request: PlannerRequest): Promise<unknown> {
    if (!this.authChecked) {
      if (!this.authCheck())
        throw new BenchmarkProviderError('BENCHMARK_SUBSCRIPTION_AUTH_REQUIRED');
      this.authChecked = true;
    }
    const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'archtokens-codex-'));
    fs.chmodSync(temporaryDirectory, 0o700);
    const outputFile = path.join(temporaryDirectory, 'final.json');
    try {
      await this.runner({
        command: this.command,
        args: [
          'exec',
          '-C',
          this.options.cwd,
          '--sandbox',
          'workspace-write',
          '-c',
          'model_reasoning_effort="medium"',
          '--json',
          '--ephemeral',
          '--output-schema',
          this.options.outputSchemaFile,
          '-o',
          outputFile,
          providerPrompt(request),
        ],
        cwd: this.options.cwd,
        env: this.environment,
        stdin: 'ignore',
        timeoutMs: this.timeoutSeconds * 1_000,
      });
      const stats = fs.lstatSync(outputFile);
      if (!stats.isFile() || stats.isSymbolicLink())
        throw new BenchmarkProviderError('BENCHMARK_PROVIDER_INVALID_OUTPUT_FILE');
      if (stats.size > MAX_OUTPUT_BYTES)
        throw new BenchmarkProviderError('BENCHMARK_PROVIDER_OUTPUT_LIMIT');
      fs.chmodSync(outputFile, 0o600);
      return JSON.parse(fs.readFileSync(outputFile, 'utf8'));
    } catch (cause) {
      if (cause instanceof BenchmarkProviderError) throw cause;
      throw new BenchmarkProviderError('BENCHMARK_PROVIDER_NON_JSON');
    } finally {
      const stats = fs.lstatSync(outputFile, { throwIfNoEntry: false });
      if (stats) {
        if (stats.isFile() && !stats.isSymbolicLink()) {
          const size = Math.min(stats.size, MAX_OUTPUT_BYTES);
          fs.writeFileSync(outputFile, Buffer.alloc(size), { mode: 0o600 });
        }
        fs.unlinkSync(outputFile);
      }
      fs.rmdirSync(temporaryDirectory);
    }
  }
}
