import {decimal,isDate,normalize,MARKETS,PARSE_ISSUES,TEAMS,type Book,type Leg,type Market,type Operator,type Scope,type TicketDocument} from './model';
import {cleanPlayerText,detectMarket,looksLikePlayer} from './text';
export {detectMarket} from './text';

const aliases:Record<string,string[]>={ATL:['atlanta','hawks'],BOS:['boston','celtics'],BKN:['brooklyn','nets'],CHA:['charlotte','hornets'],CHI:['chicago','bulls'],CLE:['cleveland','cavaliers','cavs'],DAL:['dallas','mavericks'],DEN:['denver','nuggets'],DET:['detroit','pistons'],GSW:['golden state','warriors'],HOU:['houston','rockets'],IND:['indiana','pacers'],LAC:['la clippers','los angeles clippers','clippers'],LAL:['la lakers','los angeles lakers','lakers'],MEM:['memphis','grizzlies'],MIA:['miami','heat'],MIL:['milwaukee','bucks'],MIN:['minnesota','timberwolves'],NOP:['new orleans','pelicans'],NYK:['new york','knicks'],OKC:['oklahoma','thunder'],ORL:['orlando','magic'],PHI:['philadelphia','filadelfia','76ers','sixers'],PHX:['phoenix','suns'],POR:['portland','blazers'],SAC:['sacramento','kings'],SAS:['san antonio','spurs'],TOR:['toronto','raptors'],UTA:['utah','jazz'],WAS:['washington','wizards']};
function allTeams(text:string):string[]{const n=' '+normalize(text)+' ';const hits=Object.entries(aliases).map(([code,words])=>({code,index:Math.min(...[code.toLowerCase(),...words].map(w=>n.indexOf(' '+w+' ')).filter(i=>i>=0))})).filter(x=>Number.isFinite(x.index)).sort((a,b)=>a.index-b.index);return [...new Set(hits.map(x=>x.code))];}
export function findTeams(text:string):string[]{return allTeams(text).slice(0,2);}
export function detectBook(text:string):Book {const n=normalize(text);return /bet365|bet 365|crear apuesta/.test(n)?'bet365':/betano|creador de apuestas/.test(n)?'betano':/stake|multi a?puesta del mismo partido/.test(n)?'stake':'unknown';}
function scopeOf(text:string):Scope {const n=normalize(text);if(/\b(q1|1q)\b|1[ o]? cuarto|primer cuarto|1st quarter/.test(n))return 'Q1';if(/\b(h1|1h)\b|primera mitad|1[ a]? mitad|1st half/.test(n))return 'H1';if(/\b(h2|2h)\b|segunda mitad|2[ a]? mitad|2nd half/.test(n))return 'H2_REG';return 'FULL';}
function selection(text:string):{line:number;operator:Operator;index:number;end:number}|null {
 const n=text.normalize('NFD').replace(/[\u0300-\u036f]/g,'');
 const patterns:[RegExp,Operator][]=[[/\b(?:mas de|sobre|over)\s*(\d+(?:[.,]\d+)?)/i,'over'],[/\b(?:menos de|debajo(?:\s+de)?|bajo|under)\s*(\d+(?:[.,]\d+)?)/i,'under'],[/\b(?:al menos|at least)\s*(\d+(?:[.,]\d+)?)/i,'at_least'],[/\b(?:como maximo|at most)\s*(\d+(?:[.,]\d+)?)/i,'at_most'],[/(\d+(?:[.,]\d+)?)\s*\+/,'at_least']];
 for(const [rx,operator]of patterns){const m=rx.exec(n);if(m){const line=decimal(m[1]);if(line!==null)return {line,operator,index:m.index,end:m.index+m[0].length};}}return null;
}
const cleanPlayer=cleanPlayerText;
function plausiblePlayer(s:string){return looksLikePlayer(s)&&!selection(s)&&!findTeams(s).length;}

function boundary(line:string){
 const n=normalize(line),clean=cleanPlayer(line);
 return !!selection(line)||/\bh2h\b/.test(n)||allTeams(line).length>0&&!plausiblePlayer(clean)||/^(?:apuesta|pago|ganancias|cash out|multi a?puesta|creador de apuestas|crear apuesta|cuota total|total odds)\b/.test(n);
}
function recoverSelection(lines:string[],index:number,pick:NonNullable<ReturnType<typeof selection>>,used:Set<number>,beforeOrder:boolean){
 const raw=lines[index],inline=[cleanPlayer(raw.slice(0,pick.index)),cleanPlayer(raw.slice(pick.end))].filter(plausiblePlayer);
 const preceding:{value:string;index:number}[]=[];
 for(let j=index-1;j>=Math.max(0,index-4);j--){if(used.has(j)||boundary(lines[j]))break;preceding.unshift({value:lines[j],index:j});}
 const preNames=preceding.map(x=>({name:cleanPlayer(x.value),index:x.index})).filter(x=>plausiblePlayer(x.name));
 const nameBefore=inline.length===0&&preNames.length===1;
 const following:{value:string;index:number}[]=[];
 for(let j=index+1;j<Math.min(lines.length,index+9);j++){
  if(boundary(lines[j]))break;
  if(plausiblePlayer(cleanPlayer(lines[j]))&&/\bh2h\b/i.test(lines[j+1]??''))break;
  if((inline.length||nameBefore)&&plausiblePlayer(cleanPlayer(lines[j])))break;
  following.push({value:lines[j],index:j});
 }
 const nearby=[...following];
 // Join an explicitly hyphen-wrapped name, without joining two different people.
 for(let j=0;j<nearby.length-1;j++)if(/[-–]\s*$/.test(nearby[j].value)&&/^[A-Za-zÀ-ž'’]+$/.test(nearby[j+1].value)&&!detectMarket(nearby[j+1].value)){
  nearby[j]={...nearby[j],value:nearby[j].value.replace(/[-–]\s*$/,'-')+nearby[j+1].value};nearby.splice(j+1,1);
 }
 const postNames=nearby.map(x=>cleanPlayer(x.value)).filter(plausiblePlayer);
 const names=[...new Set(inline.length?inline:nameBefore?preNames.map(x=>x.name):beforeOrder?[]:postNames)];
 const marketTexts=[raw,...following.map(x=>x.value),...(nameBefore||beforeOrder?preceding.map(x=>x.value):[])];
 const markets=[...new Set(marketTexts.map(detectMarket).filter((m):m is Market=>m!==null))];
 const issues:string[]=[];if(!names.length)issues.push('NAME_MISSING');if(names.length>1)issues.push('NAME_AMBIGUOUS');if(!markets.length)issues.push('MARKET_MISSING');if(markets.length>1)issues.push('MARKET_AMBIGUOUS');
 if(!nameBefore&&!inline.length&&!beforeOrder)for(const line of following)used.add(line.index);
 if(nameBefore)for(const line of preceding)used.add(line.index);
 return {name:names.length===1?names[0]:'',market:markets.length===1?markets[0]:null,issues,before:nameBefore};
}

function footerEvents(lines:string[],picks:number[]){
 const markers:{start:number;end:number;teams:string[]}[]=[];
 for(let i=0;i<lines.length;i++){
  if(selection(lines[i]))continue;const teams=allTeams(lines[i]);
  if(teams.length===2){markers.push({start:i,end:i,teams});continue;}
  if(teams.length!==1||plausiblePlayer(cleanPlayer(lines[i])))continue;
  for(let j=i+1;j<Math.min(lines.length,i+4);j++){
   if(selection(lines[j]))break;const second=allTeams(lines[j]);
   if(second.length===1&&second[0]!==teams[0]){markers.push({start:i,end:j,teams:[teams[0],second[0]]});i=j;break;}
  }
 }
 return markers.length>=2&&markers.length===picks.length&&markers.every((m,i)=>m.start>picks[i]&&(i===picks.length-1||m.end<picks[i+1]))?markers:null;
}


export function parseTicket(text:string,book:Book='unknown',date=''):TicketDocument {
 if(text.length>80000)throw Error('El texto supera el máximo de 80.000 caracteres.');
 const detected=book==='unknown'?detectBook(text):book;
 const lines=text.split(/\r?\n/).map(s=>s.replace(/[\t\u00a0]/g,' ').replace(/\b(?:asistoncas|asistencios)\b/gi,'Asistencias').replace(/\brobotes\b/gi,'Rebotes').trim()).filter(Boolean);
 const dateFound=/\b(\d{2})\/(\d{2})\/(\d{4})\b/.exec(text);const found=dateFound?`${dateFound[3]}-${dateFound[2]}-${dateFound[1]}`:'';const eventDate=isDate(found)?found:date;
 let teams:string[]=[],matchup='',group='1',groupIndex=0,groupOdds:number|null=null,totalOdds:number|null=null,pendingOdds:number|null=null;let scope:Scope='FULL';
 const legs:Leg[]=[];const warnings:string[]=[];const used=new Set<number>(),pickLines:number[]=[];let beforeOrder=false;
 const setGroupOdds=(value:number|null)=>{if(value===null||value<=1)return;groupOdds=value;for(const leg of legs)if(leg.group===group)leg.groupOdds=value;};
 for(let i=0;i<lines.length;i++){
  const line=lines[i],n=normalize(line),foundTeams=allTeams(line);
  if(foundTeams.length>2&&!selection(line)){teams=[];matchup='';continue;}
  const combined=/crear\s+apuesta\s*\+\s*(\d+[.,]\d+)/i.exec(line);if(combined){totalOdds=decimal(combined[1]);continue;}
  if(foundTeams.length===2&&!selection(line)){teams=foundTeams;matchup=line;group=String(++groupIndex);groupOdds=pendingOdds;pendingOdds=null;const tail=/(\d+[.,]\d{2})\s*$/.exec(line);if(tail)groupOdds=decimal(tail[1]);scope='FULL';continue;}
  // Betano sometimes prints each team on a separate line, with a date on the second.
  if(foundTeams.length===1&&!selection(line)){let end=-1,second:string[]=[];for(let j=i+1;j<Math.min(i+4,lines.length);j++){if(selection(lines[j]))break;const t=findTeams(lines[j]);if(t.length===1&&t[0]!==foundTeams[0]){second=t;end=j;break;}}if(end>=0){teams=[foundTeams[0],second[0]];matchup=teams.join(' – ');group=String(++groupIndex);groupOdds=pendingOdds;pendingOdds=null;scope='FULL';i=end;continue;}}
  if(/multi a?puesta|creador de apuestas|crear apuesta/.test(n)){
   const tail=line.match(/(?:\s|^)(\d+[.,]\d{2})\s*$/);if(tail){if(!groupIndex)pendingOdds=decimal(tail[1]);else setGroupOdds(decimal(tail[1]));}continue;
  }
  if(/cuota total|total odds/.test(n)){const m=line.match(/(\d+[.,]\d+)\s*$/);if(m)totalOdds=decimal(m[1]);continue;}
  if(/^\d+[.,]\d{2}$/.test(line)){setGroupOdds(decimal(line));continue;}
  if(/\b(q1|h1|h2|1q|1h|2h)\b|cuarto|mitad|quarter|half/.test(n))scope=scopeOf(line);
  const pick=selection(line);if(!pick||/\bh2h\b/i.test(line))continue;
  const recovered=recoverSelection(lines,i,pick,used,beforeOrder),{market,name}=recovered;if(recovered.before)beforeOrder=true;pickLines.push(i);
  // A price is individual only when explicitly labelled, never copied from a group.
  const price=/\b(?:cuota|odds)\s*[:=]?\s*(\d+[.,]\d+)/i.exec(line);
  legs.push({id:`leg-${legs.length+1}`,book:detected,group,playerName:name,matchup,teams:[...teams],market,operator:pick.operator,line:pick.line,scope:scopeOf(line)==='FULL'?scope:scopeOf(line),odds:price?decimal(price[1]):null,groupOdds,eventDate,teamSource:teams.length===2?'ticket':undefined,parseIssues:recovered.issues,raw:lines.slice(Math.max(0,i-1),Math.min(lines.length,i+3)).join('\n'),confirmed:false});
  if(legs.length>=40){warnings.push('Se alcanzó el máximo de 40 selecciones. Dividí los tickets más largos.');break;}
 }
 const footers=footerEvents(lines,pickLines);
 if(footers)for(let i=0;i<legs.length;i++){legs[i].teams=[...footers[i].teams];legs[i].matchup=footers[i].teams.join(' – ');legs[i].teamSource='ticket';legs[i].group=String(i+1);legs[i].groupOdds=null;legs[i].parseIssues=[...(legs[i].parseIssues??[]),'EVENT_FROM_FOOTER'];}
 // Some layouts print the event below every selection. Fill missing matches
 // only when the entire input names exactly one possible pair of NBA teams.
 // Do not copy the last event onto an ambiguous multi-game ticket.
 const ticketTeams=[...new Set(lines.flatMap(allTeams))];
 if(ticketTeams.length===2){for(const leg of legs){if(leg.teams.length===0){leg.teams=[...ticketTeams];leg.matchup=ticketTeams.join(' – ');leg.teamSource='ticket';}}}
 for(const leg of legs)if(leg.teams.length!==2)leg.parseIssues=[...(leg.parseIssues??[]),'EVENT_MISSING'];
 for(let i=0;i<lines.length;i++)if(/\bh2h\b/i.test(lines[i])){const detail=[lines[i],...lines.slice(i+1,i+2).filter(x=>!selection(x)&&!findTeams(x).length)].join(' ').slice(0,220);warnings.push(`Mercado sin análisis: ${detail}. Este duelo entre jugadores debe revisarse por separado.`);}
 if(/\bganador\b/i.test(text))warnings.push('Mercado sin análisis: ganador. Revisá esa selección por separado.');
 if(!legs.length)warnings.push('No se reconocieron selecciones. Podés editar el texto o agregar una selección manual.');
 if(legs.some(x=>!x.playerName||!x.market))warnings.push('Hay nombres o mercados pendientes de completar.');
 if(legs.some(x=>x.teams.length!==2))warnings.push('Confirmá el partido: algunas selecciones no tienen ambos equipos.');
 if(legs.some(x=>x.odds===null))warnings.push('Las cuotas de grupo se conservan como cuotas de grupo. Sin precio individual mostramos antecedentes, no valor de la apuesta.');
 return {version:1,title:'Mi ticket NBA',eventDate,totalOdds,legs,warnings};
}

export function importTicket(value:unknown):TicketDocument {
 if(!value||typeof value!=='object')throw Error('El JSON no es un ticket exportado por este lector.');
 const v=value as TicketDocument;if(v.version!==1||!Array.isArray(v.legs)||v.legs.length>40||!isDate(v.eventDate))throw Error('Formato de ticket inválido.');
 const books=['stake','betano','bet365','unknown'],scopes=['FULL','Q1','H1','H2_REG'],ops=['over','under','at_least','at_most'];
 const legs=v.legs.map((x,i)=>{if(!x||typeof x!=='object'||!books.includes(x.book)||!scopes.includes(x.scope)||x.operator!==null&&!ops.includes(x.operator)||typeof x.playerName!=='string'||x.playerName.length>100||!Array.isArray(x.teams)||x.teams.some(t=>!TEAMS.includes(t))||x.teams.length>2||(!isDate(x.eventDate)||x.eventDate!==v.eventDate)||x.market!==null&&!Object.keys(MARKETS).includes(x.market)||x.line!==null&&(typeof x.line!=='number'||!Number.isFinite(x.line)||x.line<0||x.line>300))throw Error('Hay una selección inválida en el JSON.');return {...x,id:`leg-${i+1}`,group:String(x.group??1).slice(0,20),matchup:String(x.matchup??'').slice(0,200),raw:String(x.raw??'').slice(0,1500),playerId:Number.isSafeInteger(x.playerId)&&Number(x.playerId)>0?x.playerId:undefined,playerTeam:TEAMS.includes(String(x.playerTeam))?x.playerTeam:undefined,teamConfirmed:x.teamConfirmed===true,odds:typeof x.odds==='number'&&x.odds>1&&x.odds<10000?x.odds:null,groupOdds:typeof x.groupOdds==='number'&&x.groupOdds>1&&x.groupOdds<100000?x.groupOdds:null,teamSource:['ticket','schedule','manual'].includes(String(x.teamSource))?x.teamSource:undefined,parseIssues:Array.isArray(x.parseIssues)?x.parseIssues.filter(i=>(PARSE_ISSUES as readonly string[]).includes(i)).slice(0,6):[],confirmed:false};});
 return {version:1,title:String(v.title??'Mi ticket NBA').slice(0,100),eventDate:v.eventDate,totalOdds:typeof v.totalOdds==='number'&&v.totalOdds>1?v.totalOdds:null,legs,warnings:['Revisá las selecciones importadas antes de analizarlas.',...(Array.isArray(v.warnings)?v.warnings.filter(w=>typeof w==='string'&&(w.startsWith('Mercado sin análisis:')||w.startsWith('El ticket incluye un mercado de ganador'))).slice(0,40).map(()=>'Mercado sin análisis: selección importada que requiere revisión.'):[])]};
}
