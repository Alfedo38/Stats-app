import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

function load(file, overrides = {}) {
  const module = { exports: {} };
  runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, {
    module, exports: module.exports,
    require: name => {
      if (Object.hasOwn(overrides, name)) return overrides[name];
      throw new Error('Import no simulado: ' + name);
    },
    ...overrides.globals,
  }, { filename: file });
  return module.exports;
}

const { gameCardStatus, carouselArrows } = load('lib/gameCardStatus.ts');
const start = '2026-11-05T03:00:00Z', ms = Date.parse(start);
assert.equal(gameCardStatus(1, 'post', start, ms + 200_000), 'final');
assert.equal(gameCardStatus(3, 'pre', start, ms), 'final');
assert.equal(gameCardStatus(1, 'in', start, ms + 60_000), 'live');
assert.equal(gameCardStatus(1, undefined, start, ms - 1), 'scheduled');
assert.equal(gameCardStatus(1, undefined, start, ms + 1_800_000), 'unknown');
assert.equal(gameCardStatus(2, undefined, start, ms + 86_400_000), 'unknown');
for (const [args, expected] of [
  [[1200, 600, 0], [false, false]],
  [[400, 900, 0], [false, true]],
  [[400, 900, 250], [true, true]],
  [[400, 900, 500], [true, false]],
]) assert.deepEqual(Object.values(carouselArrows(...args)), expected);
console.log('OK Estado verificado del partido y flechas en extremos o sin desborde');

let called;
const pilot = load('components/RotationPilot.tsx', {
  react: { useState: v => [v, () => {}] },
  'react/jsx-runtime': { jsx: () => null, jsxs: () => null },
  '@/hooks/useAnalysisQuery': { useAnalysisQuery: (...args) => (called = args, {}) },
  '@/lib/injuryReport': {},
  '@/lib/nbaRotations': { rotationGameId: v => v },
});
pilot.default({ playerId: '1629029', gameIds: ['0022600187'], open: true });
const path = new URL(called[0], 'https://app.example').pathname;
assert.ok(existsSync('app' + path + '/route.ts'), 'el cliente debe llamar una ruta existente');
assert.deepEqual(JSON.parse(JSON.stringify(called[1])), { playerId: '1629029', gameIds: ['0022600187'] });
pilot.default({ playerId: '1629029', gameIds: ['0022600187'], open: false });
assert.equal(called[0], null);
console.log('OK El panel de rotaciones consulta la ruta existente y espera a que se abra');

async function simulate(response) {
  let result;
  const { useAnalysisQuery } = load('hooks/useAnalysisQuery.ts', {
    react: { useState: v => [v, value => { result = value; }], useEffect: f => f() },
    globals: { fetch: async () => response, AbortController },
  });
  useAnalysisQuery('/api/prueba');
  await new Promise(resolve => setImmediate(resolve));
  return result;
}

const html = status => ({ ok: status === 200, status, json: async () => { throw SyntaxError('Unexpected token <'); } });
for (const status of [200, 404, 503]) {
  assert.match((await simulate(html(status))).error, /^No se pudieron cargar/);
}
assert.match((await simulate(html(401))).error, /sesión terminó/);
const expected = { ok: true, value: 0 };
const good = await simulate({ ok: true, status: 200, json: async () => expected });
assert.equal(good.status, 'ready');
assert.equal(good.data, expected);
assert.equal((await simulate({ ok: false, status: 503, json: async () => ({ error: 'Sin datos todavía.' }) })).error, 'Sin datos todavía.');
console.log('OK Respuestas HTML, sesión vencida, mensaje de API y JSON válido');
