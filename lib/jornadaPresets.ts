import {BOOK_LABELS,marketIsValid,type JornadaMarket} from './nbaJornada';
import {DEFENSE_BANDS,type DefenseBand} from './nbaDefense';

export const PRESET_LIMIT=6;
export type JornadaPresetFilters={market:JornadaMarket;book:string;side:'over'|'under';sample:5|10;minimum:number;onlyQuotes:boolean;sort:string;defenseBand:DefenseBand;published:boolean;dense:boolean};
export type JornadaPreset={name:string;filters:JornadaPresetFilters};
export function cleanPreset(value:unknown):JornadaPreset|null{
 if(!value||typeof value!=='object')return null;
 const {name,filters}=value as Partial<JornadaPreset>;
 if(typeof name!=='string'||!name.trim()||name.length>32||!filters||typeof filters!=='object')return null;
 const {market,book,side,sample,minimum,onlyQuotes,sort,defenseBand,published,dense}=filters;
 if(!marketIsValid(market)||typeof book!=='string'||book!=='all'&&!Object.hasOwn(BOOK_LABELS,book)||(side!=='over'&&side!=='under')
   ||(sample!==5&&sample!==10)||![0,5,10].includes(minimum)||typeof onlyQuotes!=='boolean'||!['average','minutes','rate'].includes(sort)
   ||typeof defenseBand!=='string'||!Object.hasOwn(DEFENSE_BANDS,defenseBand)||typeof published!=='boolean'||typeof dense!=='boolean')return null;
 return {name:name.trim(),filters:{market,book,side,sample,minimum,onlyQuotes,sort,defenseBand,published,dense}};
}
export function readPresets(storage:Pick<Storage,'getItem'>,key:string){
 const raw=storage.getItem(key);
 if(!raw||raw.length>16000)return [];
 try{
  const input:unknown=JSON.parse(raw);
  if(!Array.isArray(input))return [];
  const entries=input.slice(0,PRESET_LIMIT).map(cleanPreset).filter((p):p is JornadaPreset=>p!==null);
  return [...new Map(entries.map(p=>[p.name,p])).values()];
 }catch{return [];}
}
