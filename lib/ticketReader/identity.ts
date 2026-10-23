import {canonicalOddsPlayerName} from '../oddsPlayerNames';
import {cleanPlayerText,looksLikePlayer} from './text';
import type {IdentityReview,PlayerOption} from './model';

function canonicalName(name:string){return canonicalOddsPlayerName(cleanPlayerText(name).replace(/ı/g,'i').replace(/[Łł]/g,'l').replace(/[Đđ]/g,'d').replace(/[Øø]/g,'o').replace(/ß/g,'ss'));}
export function playerKey(name:string){return canonicalName(name).replace(/\s+/g,'');}

function distance(a:string,b:string){
 const rows=Array.from({length:a.length+1},()=>Array<number>(b.length+1).fill(0));
 for(let i=0;i<=a.length;i++)rows[i][0]=i;for(let j=0;j<=b.length;j++)rows[0][j]=j;
 for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++){
  rows[i][j]=Math.min(rows[i-1][j]+1,rows[i][j-1]+1,rows[i-1][j-1]+(a[i-1]===b[j-1]?0:1));
  if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])rows[i][j]=Math.min(rows[i][j],rows[i-2][j-2]+1);
 }
 return rows[a.length][b.length];
}

export function playerCandidates(name:string,people:PlayerOption[],teams:string[]=[]):PlayerOption[]{
 const clean=cleanPlayerText(name),n=canonicalName(clean),key=playerKey(clean),words=n.split(' ').filter(Boolean);
 if(key.length<2||!/[a-z]/.test(key)||/\b(?:gol|campo|intentado|apuesta|cuota|mercado)\b/.test(n))return [];
 const scores=people.map(p=>{
  const target=canonicalName(p.name),parts=target.split(' '),pk=playerKey(p.name),d=distance(key,pk),similarity=1-d/Math.max(key.length,pk.length);
  const exact=key===pk,token=words.every(w=>parts.includes(w)),prefix=words.length===1&&parts.some(w=>w.startsWith(n));
  const near=words.length>=2&&Math.min(key.length,pk.length)>=7&&similarity>=.65&&d<=Math.max(2,Math.floor(pk.length*.28));
  const score=exact?1000:token?140:prefix?110:near?80+similarity*30:0;
  return {p,score:score?(score+(p.team&&teams.includes(p.team)?12:0)):0};
 });
 return scores.filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.p.name.localeCompare(b.p.name)).slice(0,6).map(x=>x.p);
}

export function reviewIdentity(name:string,people:PlayerOption[],teams:string[]=[]):IdentityReview {
 const key=playerKey(name);
 if(!looksLikePlayer(name))return {status:'invalid',originalName:name,candidates:[],message:'El texto leído no parece un nombre completo. Corregí el jugador antes de analizar.'};
 const exact=people.filter(p=>playerKey(p.name)===key);
 if(exact.length===1)return {status:'exact',originalName:name,player:exact[0],candidates:[],message:exact[0].team&&teams.length===2&&!teams.includes(exact[0].team)?`Nombre verificado. Su equipo de referencia es ${exact[0].team}; revisá si corresponde al partido del ticket.`:'Nombre verificado con el histórico y el plantel disponible.'};
 const candidates=exact.length?exact:playerCandidates(name,people,teams);
 return {status:exact.length>1?'ambiguous':candidates.length?'suggested':'not_found',originalName:name,candidates,message:candidates.length?'El nombre necesita revisión. Elegí el jugador correcto; las sugerencias priorizan los equipos del ticket.':'No se encontró una coincidencia suficiente. Corregí el nombre o probá con nombre y apellido.'};
}
