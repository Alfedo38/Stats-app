/** Keep attempts if their inputs are valid, even when makes are missing. */
export function twoPointFieldGoals(fga:number|null,fgm:number|null,threeA:number|null,threeM:number|null){
 const valid=(n:number|null):n is number=>n!==null&&Number.isSafeInteger(n)&&n>=0;
 const inconsistent=valid(fga)&&valid(fgm)&&fgm>fga||valid(threeA)&&valid(threeM)&&threeM>threeA||
  valid(fga)&&valid(threeA)&&threeA>fga||valid(fgm)&&valid(threeM)&&threeM>fgm;
 if(inconsistent)return {attempts:null,made:null};
 const attempts=valid(fga)&&valid(threeA)?fga-threeA:null;
 const made=valid(fgm)&&valid(threeM)?fgm-threeM:null;
 return made!==null&&attempts!==null&&made>attempts?{attempts:null,made:null}:{attempts,made};
}
