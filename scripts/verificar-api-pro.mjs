import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
let handler=async()=>[],calls=[],wrapped=0;
const prisma={$queryRawUnsafe:async(...args)=>{calls.push(args);return handler(...args);}};
function load(path){
 const module={exports:{}};
 const compiled=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const mock=(name)=>name==='@/lib/prisma'?{__esModule:true,default:prisma}:name==='@/lib/auth/server'?{withAuth:fn=>{wrapped++;return fn;}}:name==='next/server'?{NextResponse:{json:(data,init={})=>({data,status:init.status??200,headers:init.headers??{}})}}:(()=>{throw new Error(`Import inesperado ${name}`);})();
 new Function('require','module','exports',compiled)(mock,module,module.exports);return module.exports.GET;
}
const request=(query)=>{const url=new URL(`http://localhost/api/test?${query}`);return {url:url.href,nextUrl:url};};
const originalError=console.error;console.error=()=>{};
try{
 const pro=load('app/api/nba-pro-context/route.ts'),periods=load('app/api/player-period-splits/route.ts');assert.equal(wrapped,2);
 calls=[];assert.equal((await pro(request('playerId=1&season=bad&kind=defense&opponent=BOS'))).status,400);assert.equal(calls.length,0);
 assert.equal((await pro(request('playerId=1&season=2025-26&kind=defense&opponent=BAD'))).status,400);
 handler=async()=>[{zone:'Restricted Area',attempts:100,made:50,league_attempts:1000,league_made:500}];
 calls=[];const defense=await pro(request('playerId=1&season=2025-26&kind=defense&opponent=BOS'));assert.equal(defense.status,200);assert.equal(defense.data.zones[0].league_attempts,1000);assert.deepEqual(calls[0].slice(1),['BOS','2025-26','ALL']);assert.ok(calls[0][0].includes('league_team_games'));
 await pro(request('playerId=1&season=2025-26&kind=defense&opponent=BOS'));assert.equal(calls.length,1);
 handler=async(sql)=>{if(sql.includes('player_page_game_fact_cache'))throw new Error('fixture database error');return [{team:'BOS',date:'2025-11-01'}];};
 const rest=await pro(request('playerId=1&season=2025-26&kind=rest'));assert.equal(rest.data.teamDates.length,1);
 handler=async()=>{throw new Error('fixture connection secret');};assert.equal((await pro(request('playerId=1&season=2025-26&kind=rest'))).status,503);
 handler=async()=>[];assert.deepEqual((await pro(request('playerId=1&season=2025-26&kind=rest'))).data,{ok:true,teamDates:[]});
 calls=[];assert.equal((await periods(request('playerId=-1'))).status,400);assert.equal(calls.length,0);
 handler=async()=>[{game_id:1n,game_date:new Date('2025-11-01'),fg3m:0,fg3a:null}];
 const splits=await periods(request('playerId=1&limit=999999'));assert.equal(splits.status,200);assert.equal(splits.data.rows[0].fg3m,0);assert.equal(splits.data.rows[0].fg3a,null);assert.equal(splits.data.rows[0].game_id,1);assert.deepEqual(calls.at(-1).slice(1),[1,3000]);assert.equal(splits.headers['Cache-Control'],'private, no-store');
 handler=async()=>{throw new Error('fixture connection secret');};const failed=await periods(request('playerId=1'));assert.equal(failed.status,503);assert.equal(failed.data.ok,false);assert.ok(!JSON.stringify(failed.data).includes('secret'));
 console.log('API Pro (base simulada): parámetros, consultas parametrizadas, caché, fuentes alternativas, faltantes y errores OK.');
}finally{console.error=originalError;}
