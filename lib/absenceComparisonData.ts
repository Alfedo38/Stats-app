import 'server-only';
import prisma from './prisma';
import {archiveEnabled,archiveManifest,archivePart} from './nbaArchive';
import {getCurrentRosterPlayer,getCurrentRosterTeam,CURRENT_ROSTER_UPDATED_AT} from './currentRosters';
import {canonicalOddsPlayerName} from './oddsPlayerNames';
import {compareAbsences,type ComparisonSettings,type AbsenceComparison} from './absenceComparison';
export class ComparisonError extends Error{constructor(public status:number,message:string){super(message);}}
const cache=new Map<string,{until:number;value:Promise<AbsenceComparison>}>();
export function absenceComparisonData(s:ComparisonSettings){const key=JSON.stringify(s),old=cache.get(key);if(old&&old.until>Date.now())return old.value;const value=readComparison(s),entry={until:Date.now()+60000,value};cache.set(key,entry);if(cache.size>32)cache.delete(cache.keys().next().value!);value.catch(()=>{if(cache.get(key)===entry)cache.delete(key);});return value;}
async function readComparison(input:ComparisonSettings):Promise<AbsenceComparison>{
 if(!archiveEnabled())throw new ComparisonError(503,'El archivo histórico NBA no está disponible en este servidor.');
 const s={...input},target=getCurrentRosterPlayer(s.playerId);let teammateId:number|null=null;
 if(s.mode==='current'){if(!target||s.team&&s.team!==target.team_abbreviation)throw new ComparisonError(400,'El equipo no coincide con el plantel actual del jugador.');s.team=target.team_abbreviation;const matches=getCurrentRosterTeam(s.team).filter(p=>p.player_id!==s.playerId&&canonicalOddsPlayerName(p.full_name)===canonicalOddsPlayerName(s.teammateName));if(matches.length!==1)throw new ComparisonError(400,'Elegí un compañero confirmado en el equipo actual.');teammateId=matches[0].player_id;}
 const manifest=await archiveManifest();if(teammateId===null){const summary=await archivePart('summaries',manifest),matches=Object.entries(summary.players??{}).filter(([id,name])=>Number(id)!==s.playerId&&canonicalOddsPlayerName(name)===canonicalOddsPlayerName(s.teammateName));if(matches.length!==1)throw new ComparisonError(409,'No se pudo identificar un único jugador para ese compañero histórico. No se mezclaron identidades.');teammateId=Number(matches[0][0]);}
 if(!Number.isSafeInteger(teammateId)||teammateId<=0||teammateId===s.playerId)throw new ComparisonError(400,'Identidad del compañero inválida.');
 const catalogue=await prisma.$queryRawUnsafe<{name:string}[]>(`SELECT DISTINCT trim(cache.absent_teammate) AS name FROM public.ludo_wo_games_modal_cache cache WHERE cache.player_id=$1::bigint AND upper(trim(coalesce(to_jsonb(cache)->>'team_abbreviation',to_jsonb(cache)->>'team_abbr','')))=$2::text AND cache.absent_teammate IS NOT NULL LIMIT 257`,s.playerId,s.team);
 if(catalogue.length>256)throw new ComparisonError(503,'El catálogo de compañeros necesita revisión; no se usó una muestra truncada.');const aliases=catalogue.filter(p=>canonicalOddsPlayerName(p.name)===canonicalOddsPlayerName(s.teammateName)).map(p=>p.name);
 const [facts,teammateFacts,absences,periods]=await Promise.all([
  archivePart(`facts/${s.playerId}`,manifest),archivePart(`facts/${teammateId}`,manifest),
  aliases.length?prisma.$queryRawUnsafe<{row:Record<string,unknown>}[]>(`SELECT jsonb_build_object('game_id',cache.game_id,'team_abbreviation',coalesce(to_jsonb(cache)->>'team_abbreviation',to_jsonb(cache)->>'team_abbr'),'absent_teammate',cache.absent_teammate,'absent_status',to_jsonb(cache)->>'absent_status') AS row FROM public.ludo_wo_games_modal_cache cache WHERE cache.player_id=$1::bigint AND trim(cache.absent_teammate)=ANY($2::text[]) AND upper(trim(coalesce(to_jsonb(cache)->>'team_abbreviation',to_jsonb(cache)->>'team_abbr','')))=$3::text AND cache.game_id IS NOT NULL LIMIT 5001`,s.playerId,aliases,s.team):Promise.resolve([]),
  s.scope==='FULL'?Promise.resolve({available:true,rows:[] as Record<string,unknown>[]}):prisma.$queryRawUnsafe<{row:Record<string,unknown>}[]>('SELECT to_jsonb(cache) AS row FROM public.player_period_splits_front_v2_cache cache WHERE player_id=$1::bigint AND split_code=$2::text AND game_date<$3::date ORDER BY game_date DESC LIMIT 3001',s.playerId,s.scope,s.asOfDate).then(rows=>({available:rows.length<=3000,rows:rows.length<=3000?rows.map(r=>r.row):[]})).catch(()=>({available:false,rows:[]})),
 ]);
 if(absences.length>5000)throw new ComparisonError(503,'La consulta de ausencias excedió el límite. No se usó una muestra incompleta.');if(!Array.isArray(facts)||!Array.isArray(teammateFacts))throw new ComparisonError(503,'No se pudo comprobar el histórico de ambos jugadores.');
 return {ok:true,...compareAbsences(facts,teammateFacts,absences.map(r=>r.row),periods.rows,s,teammateId),archiveId:manifest.id,teammateId,teammateName:s.teammateName,periodsAvailable:periods.available,rosterAt:CURRENT_ROSTER_UPDATED_AT};
}
