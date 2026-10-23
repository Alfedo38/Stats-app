import {normalize,type Market} from './model';

const attempts=String.raw`\b(?:(?:gol(?:es)?|tiros?|lanzamientos?|canastas?)\s+(?:de\s+)?campo\s+(?:intentad[oa]s?|intentos)|tiros?\s+intentados?|field\s+goals?\s+attempt(?:ed|s)?|fga)\b`;
const made=String.raw`\b(?:(?:gol(?:es)?|tiros?|lanzamientos?|canastas?)\s+(?:de\s+)?campo\s+(?:anotad[oa]s?|convertid[oa]s?|realizad[oa]s?|hech[oa]s?)|tiros?\s+(?:anotados?|convertidos?)|field\s+goals?\s+made|fgm)\b`;
const statWords=String.raw`\b(?:puntos?|points?|pts|rebotes?|rebounds?|reb|asistencias?|assists?|ast|triples?|3pt|3pm|pra|pr|pa|ra|fgm|fga|robos?|steals?|stl|tapones?|bloqueos?|blocks?|blk|perdidas?|turnovers?|tov?)\b`;

export function detectMarket(text:string):Market|null {
 const n=normalize(text);
 if(new RegExp(attempts,'i').test(n))return 'FGA';
 if(new RegExp(made,'i').test(n))return 'FGM';
 const pts=/\b(puntos?|points?|pts)\b/.test(n),reb=/\b(rebotes?|rebounds?|reb)\b/.test(n),ast=/\b(asistencias?|assists?|ast)\b/.test(n);
 if(/\bpra\b/.test(n)||pts&&reb&&ast)return 'PRA';
 if(/\bpr\b/.test(n)||pts&&reb)return 'PR';
 if(/\bpa\b/.test(n)||pts&&ast)return 'PA';
 if(/\bra\b/.test(n)||reb&&ast)return 'RA';
 if(/\b(3pt|3pm|triples?|three pointers?)\b/.test(n))return '3PT';
 const stl=/\b(robos?|steals?|stl)\b/.test(n),blk=/\b(tapones?|bloqueos?|blocks?|blk)\b/.test(n);
 if(stl&&blk)return 'STL+BLK';if(stl)return 'STL';if(blk)return 'BLK';
 if(/\b(perdidas?|turnovers?|tov?)\b/.test(n))return 'TO';
 return pts?'PTS':reb?'REB':ast?'AST':null;
}

/** Remove sports labels, preserving name particles, suffixes and punctuation. */
export function cleanPlayerText(value:string):string {
 let text=value.replace(/\b(?:cuota|odds)\s*[:=]?.*$/i,'').replace(/\b(?:1[°ºo]?\s*cuarto|primer\s+cuarto|primera\s+mitad|segunda\s+mitad|1st\s+(?:quarter|half)|2nd\s+half)\b/gi,' ');
 const labelled=detectMarket(text)!==null||/\b(?:total(?:es)?|gol(?:es)?|campo|intenta[dn][oa]s?|field goals?)\b/i.test(text);
 if(labelled){
  text=text.replace(new RegExp(attempts,'gi'),' ').replace(new RegExp(made,'gi'),' ')
   .replace(/\bthree\s+pointers?\b/gi,' ').replace(new RegExp(statWords,'gi'),' ')
   .replace(/\btotal(?:es)?(?:\s+de)?\b/gi,' ').replace(/\b(?:realizados?|anotados?|convertidos?|intentados?)\b/gi,' ');
 }
 text=text.replace(/\([^)]*\)/g,' ').replace(/[|\[\]•·:+©¢&>]/g,' ').replace(/^[\s\d_.,;:!¡?¿'"=()\-–—]+/,'').replace(/[\s,;:\-–—]+$/g,'').replace(/\s+/g,' ').trim();
 if(labelled)text=text.replace(/^(?:(?:y|and|de)\s+)+|(?:\s+(?:y|and|de))+$/gi,'').trim();
 text=text.replace(/\s+y$/i,'').replace(/,\s*/g,', ').trim();
 return text;
}

export function looksLikePlayer(value:string):boolean {
 const text=cleanPlayerText(value),n=normalize(text);
 return text.length>=4&&text.length<=100&&text.split(/\s+/).filter(w=>/[A-Za-zÀ-ž]/.test(w)).length>=2
  &&detectMarket(text)===null&&!/\b(?:total(?:es)?|gol(?:es)?|campo|tiros?|lanzamientos?|canastas?|libres?|intentados?|anotados?|realizados?|convertidos?|field|goals?|attempted|made|ganador|winner|h2h|apuesta|cuota|odds|pago|ganancias|importe|referencia|stake|betano|bet365|mercado|partido|seleccion|casino|cash|retiro|disponible|explorar|talon|deportes|chat|ticket|esta noche)\b/.test(n)
  &&!/[0-9]/.test(text);
}
