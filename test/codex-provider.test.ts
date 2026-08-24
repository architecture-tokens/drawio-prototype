import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BenchmarkProviderError,
  CodexSubscriptionPlanner,
  runForegroundCommand,
  subscriptionEnvironment,
  type ForegroundCommand,
} from '../src/codex-provider.js';
import { layoutSchema } from '../src/layout.js';

const root = path.resolve(import.meta.dirname, '..');
const emptyLayout = { version: '0.1', canvas: { width: 1, height: 1 }, nodes: [], edges: [] };

describe('ChatGPT Subscription codex provider', () => {
  it('uses a bounded foreground codex exec contract and scrubs API keys', async () => {
    const calls: ForegroundCommand[] = [];
    const planner = new CodexSubscriptionPlanner({
      cwd: root,
      outputSchemaFile: path.join(root, 'benchmark/layout-output.schema.json'),
      timeoutSeconds: 600,
      authCheck: () => true,
      environment: {
        PATH: process.env.PATH,
        OPENAI_API_KEY: 'must-not-be-read-or-forwarded',
        SAFE_VALUE: 'kept',
      },
      runner: async (command) => {
        calls.push(command);
        const output = command.args[command.args.indexOf('-o') + 1];
        fs.writeFileSync(output, JSON.stringify(emptyLayout));
      },
    });
    await planner.plan({ architecture: { kind: 'renderer-input' }, schema: layoutSchema });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      command: 'codex',
      timeoutMs: 600_000,
      cwd: root,
      stdin: 'ignore',
      env: { SAFE_VALUE: 'kept' },
    });
    expect(calls[0].env).not.toHaveProperty('OPENAI_API_KEY');
    expect(calls[0].args.slice(0, 10)).toEqual([
      'exec',
      '-C',
      root,
      '--sandbox',
      'workspace-write',
      '-c',
      'model_reasoning_effort="medium"',
      '--json',
      '--ephemeral',
      '--output-schema',
    ]);
    expect(calls[0].args).toContain('-o');
    expect(calls[0].args).not.toContain('-');
    expect(calls[0].args.at(-1)).toContain('renderer-input');
    const privateOutput = calls[0].args[calls[0].args.indexOf('-o') + 1];
    expect(privateOutput).toContain('archtokens-codex-');
    expect(fs.existsSync(privateOutput)).toBe(false);
  });

  it('requires ChatGPT auth before dispatch and reports only a stable code', async () => {
    let called = false;
    const planner = new CodexSubscriptionPlanner({
      cwd: root,
      outputSchemaFile: 'schema.json',
      authCheck: () => false,
      runner: async () => {
        called = true;
        return '{}';
      },
    });
    await expect(planner.plan({ architecture: {}, schema: {} })).rejects.toMatchObject({
      code: 'BENCHMARK_SUBSCRIPTION_AUTH_REQUIRED',
    });
    expect(called).toBe(false);
    expect(
      () =>
        new CodexSubscriptionPlanner({
          cwd: root,
          outputSchemaFile: 'schema.json',
          timeoutSeconds: 601,
        }),
    ).toThrowError(BenchmarkProviderError);
  });

  it('ignores provider stdin and enforces timeout without retaining output streams', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'benchmark-stdin-test-'));
    const marker = path.join(directory, 'stdin-state.txt');
    await runForegroundCommand({
      command: process.execPath,
      args: [
        '-e',
        "const fs=require('fs');let value='';process.stdin.on('data',x=>value+=x);process.stdin.on('end',()=>fs.writeFileSync(process.argv[1],'closed:'+value))",
        marker,
      ],
      cwd: root,
      env: subscriptionEnvironment(),
      stdin: 'ignore',
      timeoutMs: 2_000,
    });
    expect(fs.readFileSync(marker, 'utf8')).toBe('closed:');
    fs.rmSync(directory, { recursive: true, force: true });

    const timeout = runForegroundCommand({
      command: process.execPath,
      args: ['-e', "process.stderr.write('secret');setInterval(()=>{},1000)"],
      cwd: root,
      env: subscriptionEnvironment(),
      stdin: 'ignore',
      timeoutMs: 50,
    });
    await expect(timeout).rejects.toMatchObject({ code: 'BENCHMARK_PROVIDER_TIMEOUT' });
  });
});
