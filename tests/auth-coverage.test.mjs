import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Regression gate: new pages/APIs must explicitly participate in authorization.
const root = new URL('../app/', import.meta.url);
const files = fs.readdirSync(root, { recursive: true });
test('ninguna página de datos omite el control de sesión', () => {
  for (const file of files.filter(f => f.endsWith('page.tsx') && f !== 'login/page.tsx')) {
    const source = fs.readFileSync(new URL(file, root), 'utf8');
    assert.match(source, /await requirePageUser\(/, file);
  }
});
test('todas las API existentes tienen guardia propia además de Proxy', () => {
  for (const file of files.filter(f => f.endsWith('route.ts') && !f.startsWith('api/auth/'))) {
    const source = fs.readFileSync(new URL(file, root), 'utf8');
    assert.match(source, /export const (GET|POST) = withAuth\(/, file);
    assert.doesNotMatch(source, /export (async )?function (GET|POST|PUT|DELETE|PATCH)/, file);
  }
  const sync = fs.readFileSync(new URL('injuries/sync/route.ts', root), 'utf8');
  assert.match(sync, /export const POST = withAuth\(handleGET, true\)/);
  assert.doesNotMatch(sync, /export const GET/);
});
