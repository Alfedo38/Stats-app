import {rotationMinutes,rotationPeriodMs,type RotationGame} from './nbaRotations';

export type RotationChangeGame={gameId:string;team:string;players:Map<number,RotationGame>};
export function countRotationChanges(games:RotationChangeGame[],pid:number){
 const exits=new Map<number,number>(),entries=new Map<number,number>();
 let gamesWithLineup=0,multiple=0,unverified=0;
 for(const {players} of games){
  const player=players.get(pid);
  if(!player?.played||players.size<5)continue;
  const boundaries=new Set(player.spans.flatMap(([q,a,b])=>[a>0?`${q}:${a}`:'',b<rotationPeriodMs(q)?`${q}:${b}`:'']).filter(Boolean));
  let checked=false;
  for(const event of boundaries){
   const [q,ms]=event.split(':').map(Number);
   const before=new Set<number>(),after=new Set<number>();
   for(const [id,row] of players){
    for(const [period,a,b] of row.spans){
     if(q!==period)continue;
     if(a<ms&&ms<=b)before.add(id);
     if(a<=ms&&ms<b)after.add(id);
    }
   }
   if(before.size!==5||after.size!==5){unverified++;continue;}
   const out=[...before].filter(id=>!after.has(id)),inc=[...after].filter(id=>!before.has(id));
   if(!out.includes(pid)&&!inc.includes(pid))continue;
   checked=true;
   if(out.length!==1||inc.length!==1){multiple++;continue;}
   const [counter,id]=out[0]===pid?[exits,inc[0]]:[entries,out[0]];
   counter.set(id,(counter.get(id)??0)+1);
  }
  if(checked)gamesWithLineup++;
 }
 const rank=(m:Map<number,number>)=>[...m].map(([id,count])=>({id,count})).sort((a,b)=>b.count-a.count||a.id-b.id);
 return {games:gamesWithLineup,multiple,unverified,inForPlayer:rank(exits),playerInFor:rank(entries)};
}

export function quarterRole(sample:RotationGame[]){
 return Array.from({length:4},(_,i)=>{
  const q=i+1,values=sample.map(g=>rotationMinutes(g,q)).sort((a,b)=>a-b);
  const center=values.length?(values[Math.floor((values.length-1)/2)]+values[Math.ceil((values.length-1)/2)])/2:null;
  return {quarter:q,minutes:center,played:values.filter(n=>n>0).length,games:values.length};
 });
}
