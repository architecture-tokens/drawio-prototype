#!/usr/bin/env node
// Live use is deliberately a thin foreground wrapper. The implementation
// launches one bounded, ephemeral `codex exec` using ChatGPT Subscription
// auth, closes stdin immediately after the prompt, and publishes only a
// schema-checked redacted report.
import { runBenchmarkCli } from '../dist/benchmark-cli.js';

const result = await runBenchmarkCli(process.argv.slice(2));
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.exitCode = result.exitCode;
