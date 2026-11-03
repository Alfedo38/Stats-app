'use client';
import {useState,useCallback} from 'react';
import {useAnalysisQuery} from './useAnalysisQuery';
import {defenseMarket,defensePosition,defenseSeason,filterDefense,type DefenseReport,type DefenseBand,type DefenseGroup} from '@/lib/nbaDefense';
type Input={initial?:{season:string|null;window:'season'|'10'|'20'|null;position:DefenseGroup|null;band:DefenseBand};playerId:string;position?:string;opponent:string;market:string;asOfDate:string;phase:string;scope:string};
export function usePlayerDefense(input:Input){
 const key=input.playerId+':'+input.asOfDate;
 const [choice,setChoice]=useState<{key:string;season:string;window:'season'|'10'|'20';position:DefenseGroup;venue:'ALL'|'HOME'|'AWAY'}|null>(()=>input.initial?{key,season:input.initial.season??defenseSeason(input.asOfDate),window:input.initial.window??'season',venue:'ALL',position:input.initial.position??defensePosition(input.position)??'ALL'}:null);
 const options=choice?.key===key?choice:{key,season:defenseSeason(input.asOfDate),window:'season' as const,venue:'ALL' as const,position:defensePosition(input.position)??'ALL'};
 const market=defenseMarket(input.market),q=new URLSearchParams({market:market??'pts',asOfDate:input.asOfDate,phase:input.phase,season:options.season,window:options.window,position:options.position,venue:options.venue});
 if(input.opponent)q.set('opponent',input.opponent);
 const url=market?'/api/nba-defense?'+q:null;
 const query=useAnalysisQuery<DefenseReport>(url);
 const bandKey=url+':'+input.scope;
 const [bandState,setBandState]=useState<{key:string;value:DefenseBand}|null>(()=>input.initial?{key:bandKey,value:input.initial.band}:null);
 const band=input.scope==='FULL'&&bandState?.key===bandKey?bandState.value:'all';
 const report=query.data?.available?query.data:null;
 const setBand=useCallback((value:DefenseBand)=>setBandState({key:bandKey,value}),[bandKey]);
 const canFilter=input.scope==='FULL'&&!!report?.rankings?.[options.position]?.some(r=>r.rankedTeams===30);
 return {...query,report,url,market,options,band,canFilter,
  select:(value:Partial<Omit<typeof options,'key'>>)=>setChoice({...options,...value,key}),
  setBand,
  apply:<T extends Record<string,any>>(rows:T[])=>filterDefense(rows,report,options.position,band),
 };
}
