import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = process.cwd();
let count = 0;
function check(name, test) { test(); count++; console.log('OK ' + name); }
function evaluate(relative, mocks = {}, extra = '') {
  const source = fs.readFileSync(path.join(root, relative), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } });
  const module = { exports: {} };
  const context = { module, exports: module.exports, require: name => name in mocks ? mocks[name] : require(name), console, Date, Map, Set, Number };
  vm.runInNewContext(compiled.outputText + extra, context, { filename: relative });
  return module.exports;
}
const tracking = evaluate('lib/trackingValues.ts');
const v = tracking.trackingValue;
check('Vacíos, booleanos y objetos no producen cero', () => {
  for (const x of [null, undefined, '', '  ', true, false, {}, [], NaN, Infinity, -1, 'NaN', 'null']) assert.equal(v(x), null);
});
check('Cero confirmado y números válidos se conservan', () => {
  assert.equal(v(0), 0); assert.equal(v('0'), 0); assert.equal(v('12'), 12); assert.equal(v(3.5), 3.5);
  assert.equal(v(2n), 2); assert.equal(v({toNumber: () => 6}), 6);
  assert.equal(v({toNumber: () => {throw Error('invalid decimal')}}), null);
});
const formatters = evaluate('lib/formatters.ts');
const react = { useEffect() {}, useMemo: f => f(), useRef: () => ({ current: null }), useState: x => [x, () => {}] };
const recharts = Object.fromEntries(['Bar','CartesianGrid','Cell','ComposedChart','LabelList','Line','ReferenceLine','Tooltip','XAxis','YAxis'].map(x => [x, x]));
const chart = evaluate('components/PlayerChart.tsx', { react, recharts, '@/lib/trackingValues': tracking, '@/lib/formatters': formatters }, '\nmodule.exports.testTooltip=CustomTooltip;module.exports.testOverlayLabel=OverlayPointLabel;');
function find(tree, name) {
  if (!tree || typeof tree !== 'object') return null;
  if (tree.type === name) return tree;
  for (const child of [tree.props?.children].flat(Infinity)) { const hit = find(child, name); if (hit) return hit; }
  return null;
}
function content(tree) {
  if (tree === null || tree === undefined || typeof tree === 'boolean') return '';
  if (typeof tree !== 'object') return String(tree);
  return [tree.props?.children].flat(Infinity).map(content).join('');
}
const base = { game_id: '0022600001', game_date: '2026-10-21', ast: 3, opponent: 'TOR' };
function render(data, overlayKey = 'potential_ast') { return chart.default({ data, statKey: 'ast', lineValue: 4.5, overlayKey, overlayLabel: 'Pot. AST' }); }
check('El último dato vacío corta la línea y mantiene la barra', () => {
  const tree = render([{ ...base, potential_ast: 6 }, { ...base, game_id: '2', game_date: '2026-10-22', potential_ast: null }]);
  const data = find(tree, 'ComposedChart').props.data;
  assert.equal(data[0]._overlayValue, 6); assert.equal(data[1]._overlayValue, null); assert.equal(data[1].value, 3);
  assert.equal(find(tree, 'Line').props.connectNulls, false);
});
check('Un hueco intermedio permanece vacío', () => {
  const tree = render([6, null, 8].map((x, i) => ({ ...base, game_date: `2026-10-${21+i}`, game_id: String(i+1), potential_ast: x })));
  const data = find(tree, 'ComposedChart').props.data;
  assert.equal(data[1]._overlayValue, null); assert.equal(data[2]._overlayValue, 8);
});
check('Una serie de ceros confirmados sigue visible', () => assert.ok(find(render([{ ...base, potential_ast: 0 }]), 'Line')));
check('Una serie sin datos no dibuja puntos', () => assert.equal(find(render([{ ...base, potential_ast: null }]), 'Line'), null));
check('El punto reaparece al llegar el dato', () => {
  const data = find(render([{ ...base, potential_ast: 7 }]), 'ComposedChart').props.data;
  assert.equal(data[0]._overlayValue, 7);
});
check('El tooltip diferencia faltante de cero', () => {
  const tooltip = value => chart.testTooltip({ active: true, payload: [{ dataKey: 'value', payload: { ...base, value: 3, lineValue: 4.5, _overlayEnabled: true, _overlayLabel: 'Pot. AST', _overlayValue: value } }] });
  assert.ok(content(tooltip(null)).includes('Sin datos disponibles'));
  assert.ok(content(tooltip(0)).includes('Pot. AST: 0'));
});
check('Las etiquetas de puntos vacíos no muestran cero', () => assert.equal(chart.testOverlayLabel({ x: 1, y: 1, value: null }), null));
check('Chances de rebote conserva los mismos huecos', () => {
  assert.equal(find(render([{ ...base, rebound_chances: null }], 'rebound_chances'), 'Line'), null);
});
check('Sin overlay no aparece potencial en el tooltip', () => {
  const data = find(render([base], null), 'ComposedChart').props.data;
  assert.equal(data[0]._overlayEnabled, false);
});
check('La API y el histórico conservan tracking vacío', () => {
  const api = fs.readFileSync(path.join(root, 'lib/api.ts'), 'utf8');
  const history = fs.readFileSync(path.join(root, 'lib/playerHistory.ts'), 'utf8');
  assert.ok(api.includes('potential_ast: trackingValue('));
  assert.ok(history.includes('potential_ast: trackingValue(row.potential_ast)'));
});
console.log(`Potenciales: ${count} verificaciones correctas. Sin acceso a red ni base de datos.`);
