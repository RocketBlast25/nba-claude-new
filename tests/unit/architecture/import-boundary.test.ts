import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..', '..');
const PURE_DIRS = ['src/sim', 'src/sim/career', 'src/sim/season', 'src/possession', 'src/persistence'];

// Imports that would pull UI or browser code into the pure core (ADR-001).
const FORBIDDEN_IMPORT = /from\s+['"](react|react-dom)(\/[^'"]*)?['"]|require\(\s*['"](react|react-dom)/;
// Browser globals that must not be referenced directly in the pure core.
const FORBIDDEN_GLOBAL = /\b(document|window|HTMLCanvasElement|CanvasRenderingContext2D)\b/;

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...listTsFiles(full));
    } else if (name.endsWith('.ts') || name.endsWith('.tsx')) {
      out.push(full);
    }
  }
  return out;
}

describe('pure-core import boundary (ADR-001)', () => {
  for (const dir of PURE_DIRS) {
    it(`${dir} imports no React, react-dom, or DOM/Canvas globals`, () => {
      const violations: string[] = [];
      for (const file of listTsFiles(join(ROOT, dir))) {
        const lines = readFileSync(file, 'utf8').split('\n');
        lines.forEach((line, i) => {
          const code = line.replace(/\/\/.*$/, '');
          if (FORBIDDEN_IMPORT.test(code) || FORBIDDEN_GLOBAL.test(code)) {
            violations.push(`${relative(ROOT, file)}:${i + 1}: ${line.trim()}`);
          }
        });
      }
      expect(violations).toEqual([]);
    });
  }
});
