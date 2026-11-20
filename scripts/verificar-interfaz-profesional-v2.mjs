import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript'),root=process.cwd(),cache=new Map();
function load(name){
 if(!name.startsWith('.')&&!name.startsWith('@/')&&!path.isAbsolute(name))return require(name);
 let file=name.startsWith('@/')?path.join(root,name.slice(2)):path.resolve(root,name);
 if(!fs.existsSync(file))file=['.ts','.tsx','.mjs','.js'].map(ext=>file+ext).find(fs.existsSync);
 if(!file)throw Error('No existe módulo '+name);
 if(cache.has(file))return cache.get(file).exports;
 const module={exports:{}};cache.set(file,module);
 const output=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;
 vm.runInNewContext(output,{module,exports:module.exports,require:n=>n.startsWith('.')?load(path.resolve(path.dirname(file),n)):load(n),console,Intl,Date,Number,Map,Set,URLSearchParams},{filename:path.relative(root,file)});
 return module.exports;
}

const media=load('./lib/nbaVisuals.ts'),context=load('./lib/nbaMatchupPreview.ts'),studio=load('./lib/nbaStudio.ts'),checks=[];
function check(name,fn){fn();checks.push(name);console.log('OK '+name);}
check('Los 30 logos corresponden a IDs NBA distintos',()=>{assert.equal(Object.keys(media.NBA_TEAM_IDS).length,30);assert.equal(new Set(Object.values(media.NBA_TEAM_IDS)).size,30);assert.match(media.nbaLogo('SAS'),/1610612759/);assert.equal(media.nbaLogo('XXX'),null);});
check('Fotos solo admiten IDs numéricos y no construyen URLs arbitrarias',()=>{assert.match(media.nbaPortrait(1629029),/260x190\/1629029.png$/);for(const raw of ['../1','<img>',0,'0','1/2',null])assert.equal(media.nbaPortrait(raw),null);});
check('Solo AST y REB de partido completo habilitan tracking secundario',()=>{assert.equal(media.opportunityFor('ast'),'potential_ast');assert.equal(media.opportunityFor('reb'),'rebound_chances');for(const market of ['pts','fga','fgm','fg2a','fg2m','fg3a','fg3m','ftm'])assert.equal(media.opportunityFor(market),null);for(const scope of ['Q1','H1','H2_REG'])assert.equal(media.opportunityFor('ast',scope),null);});
check('La conversión usa cociente de sumas sobre los mismos partidos',()=>{const r=media.pairedOpportunity([[2,4],[3,12]],x=>x[0],x=>x[1]);assert.equal(r.count,2);assert.equal(r.conversion,31.25);});
check('Un faltante no se transforma en cero ni aumenta el denominador',()=>{const r=media.pairedOpportunity([[2,null],[null,8],[0,4],[3,6]],x=>x[0],x=>x[1]);assert.equal(r.count,2);assert.equal(r.total,4);assert.equal(r.made,3);assert.equal(r.chances,10);assert.equal(r.conversion,30);});
check('Sin oportunidades no se inventa una conversión',()=>{const r=media.pairedOpportunity([[0,0],[null,null]],x=>x[0],x=>x[1]);assert.equal(r.conversion,null);assert.equal(r.zero,1);});
check('Producción superior a oportunidades queda fuera de la conversión',()=>{const r=media.pairedOpportunity([[7,4],[3,6]],x=>x[0],x=>x[1]);assert.equal(r.inconsistent,1);assert.equal(r.count,1);assert.equal(r.conversion,50);});
check('El gráfico alternativo también rechaza tracking inconsistente',()=>{assert.equal(studio.studioValue({ast:8,potential_ast:5},'potential_ast'),null);assert.equal(studio.studioValue({reb:9,rebound_chances:null},'rebound_chances'),null);assert.equal(studio.studioValue({reb:0,rebound_chances:0},'rebound_chances'),0);});
const row=(id,date,team='SAS',extra={})=>({id,date,team,data:{pts:110,fga:90,fta:20,oreb:10,tov:12},opponent:{fga:85,fta:22,oreb:8,tov:10},...extra});
check('Posesiones usan ambos equipos y coeficiente de libres 0.44',()=>{const r=context.summarizeMatchupTeam([row('1','2026-11-16')],'SAS','2026-11-18');assert.ok(Math.abs(r.possessions-98.74)<1e-9);assert.equal(r.paceGames,1);assert.equal(r.restDays,1);assert.equal(r.backToBack,false);});
check('Un box incompleto deja posesiones sin dato, no cero',()=>{const r=context.summarizeMatchupTeam([row('1','2026-11-16','SAS',{opponent:{fga:85,fta:22,tov:10}})],'SAS','2026-11-18');assert.equal(r.possessions,null);assert.equal(r.games,1);assert.equal(r.paceGames,0);});
check('Descanso usa el último partido registrado, excluye el día consultado y el futuro',()=>{const r=context.summarizeMatchupTeam([row('1','2026-11-17'),row('2','2026-11-18'),row('3','2026-11-19')],'SAS','2026-11-18');assert.equal(r.games,1);assert.equal(r.lastDate,'2026-11-17');assert.equal(r.backToBack,true);});
check('Partidos duplicados con ceros iniciales no duplican el ritmo',()=>{const r=context.summarizeMatchupTeam([row('001','2026-11-17'),row('1','2026-11-17'),row('2','2026-11-16','LAL')],'SAS','2026-11-18');assert.equal(r.games,1);assert.equal(r.paceGames,1);});
check('Sin partidos no se infiere descanso ni promedio cero',()=>{const r=context.summarizeMatchupTeam([],'SAS','2026-11-18');assert.equal(r.points,null);assert.equal(r.restDays,null);assert.equal(r.backToBack,null);});
check('La ficha tiene una presentación avanzada y no conserva selectores de modo',()=>{const presentation=fs.readFileSync('components/PlayerPresentation.tsx','utf8'),content=fs.readFileSync('components/PlayerPageContent.tsx','utf8');assert.match(presentation,/value=\{false\}/);assert.ok(!presentation.includes('Vista rápida'));assert.ok(!presentation.includes('>Compacta<'));assert.ok(!content.includes('Vista rápida'));assert.match(content,/const effectiveMode = "pro"/);});
check('El gráfico gris comparte el eje y conserva el eje independiente para otras unidades',()=>{const s=fs.readFileSync('components/PlayerChart.tsx','utf8');assert.match(s,/hasOverlay&&opportunityBars&&<Bar yAxisId="left"/);assert.match(s,/hasOverlay&&!opportunityBars&&overlayAxis==="right"/);});
check('El endpoint de contexto exige autenticación y calendario; lecturas parametrizadas',()=>{const s=fs.readFileSync('app/api/nba-matchup-preview/route.ts','utf8');assert.match(s,/GET=withAuth/);assert.match(s,/games.length!==1/);assert.match(s,/game_date<\$\{date\}/);assert.ok(!s.includes('$queryRawUnsafe'));assert.ok(!/INSERT|UPDATE|DELETE/.test(s));});
console.log(`\nInterfaz profesional v2: ${checks.length} verificaciones correctas. Sin red ni bases de datos.`);
