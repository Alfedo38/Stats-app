export const MINUTES_MIN_GAMES=5;
export function minutesDistribution(values:(number|null)[]){
 const sorted=values.filter((v):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>0&&v<=72).sort((a,b)=>a-b);
 const n=sorted.length;
 const quantile=(p:number)=>{const i=(n-1)*p,lo=Math.floor(i),hi=Math.ceil(i);return sorted[lo]+(sorted[hi]-sorted[lo])*(i-lo);};
 return {count:n,average:n?sorted.reduce((s,v)=>s+v,0)/n:null,median:n?quantile(.5):null,
  typical:n>=MINUTES_MIN_GAMES?[quantile(.25),quantile(.75)] as [number,number]:null};
}
export type SeasonMinutes={season:string}&ReturnType<typeof minutesDistribution>;
