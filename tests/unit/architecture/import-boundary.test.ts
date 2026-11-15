import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..', '..');
// Pure core: no UI and no browser storage or animation APIs. src/persistence is the one
// layer allowed to touch browser storage (IndexedDB / localStorage), so it is checked for
// React/DOM imports only.
const PURE_DIRS = ['src/sim', 'src/sim/career', 'src/sim/season', 'src/possession'];
const STORAGE_LAYER_DIRS = ['src/persistence'];

// Imports that would pull UI or browser code into the pure core (ADR-001).
const FORBIDDEN_IMPORT = /from\s+['"](react|react-dom)(\/[^'"]*)?['"]|require\(\s*['"](react|react-dom)/;
// Browser globals that must not be referenced directly in the pure core.
const FORBIDDEN_GLOBAL =
  /\b(document|window|HTMLCanvasElement|CanvasRenderingContext2D|indexedDB|localStorage|sessionStorage|requestAnimationFrame|cancelAnimationFrame)\b/;

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

function scan(dirs: string[], forbidden: RegExp[]): string[] {
  const violations: string[] = [];
  for (const dir of dirs) {
    for (const file of listTsFiles(join(ROOT, dir))) {
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        const code = line.replace(/\/\/.*$/, '');
        if (forbidden.some((re) => re.test(code))) {
          violations.push(`${relative(ROOT, file)}:${i + 1}: ${line.trim()}`);
        }
      });
    }
  }
  return violations;
}

describe('pure-core import boundary (ADR-001)', () => {
  for (const dir of PURE_DIRS) {
    it(`${dir} imports no React, react-dom, DOM/Canvas, or browser storage/animation globals`, () => {
      expect(scan([dir], [FORBIDDEN_IMPORT, FORBIDDEN_GLOBAL])).toEqual([]);
    });
  }

  for (const dir of STORAGE_LAYER_DIRS) {
    it(`${dir} imports no React or react-dom (browser storage is allowed here only)`, () => {
      expect(scan([dir], [FORBIDDEN_IMPORT])).toEqual([]);
    });
  }
});
