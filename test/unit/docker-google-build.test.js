import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const dockerfile = new URL('../../Dockerfile', import.meta.url);

test('Docker passes the Google Client ID to the stage that runs the Vite build', () => {
  const stages = readFileSync(dockerfile, 'utf8').split(/^FROM\s+/im);
  const build = stages.find((stage) => /\bAS\s+build\b/i.test(stage));
  assert.ok(build, 'Docker needs a build stage');
  const lines = build.split(/\r?\n/).map((line) => line.trim());
  const buildIndex = lines.findIndex((line) => /^RUN\s+npm\s+run\s+build\b/.test(line));
  assert.ok(buildIndex >= 0, 'Vite build must run in the build stage');
  assert.ok(lines.slice(0, buildIndex).some((line) => /^ARG\s+VITE_GOOGLE_CLIENT_ID(?:\s|$)/.test(line)),
    'Railway build argument must be declared before Vite builds');
  assert.ok(lines.slice(0, buildIndex).some((line) => /^ENV\s+VITE_GOOGLE_CLIENT_ID=\$VITE_GOOGLE_CLIENT_ID$/.test(line)),
    'Vite must receive the build argument as its build-stage environment');
});
