import {evidenceMetricIds,EVIDENCE_METRICS,summarizeEvidence,type EvidenceRow} from './marketEvidence';

export type MarketSupportItem={id:string;label:string;average:number|null;count:number;review:number};
export type MarketSupport={total:number;items:MarketSupportItem[]};

export function marketSupport(rows:EvidenceRow[],market:string):MarketSupport{
 const ids=evidenceMetricIds(market).filter(id=>!EVIDENCE_METRICS[id]?.numerator);
 const stats=ids.map(id=>summarizeEvidence(rows,EVIDENCE_METRICS[id]));
 return {total:stats[0]?.total??0,items:stats.map(({metric,average,count,review})=>({id:metric.id,label:metric.label,average,count,review}))};
}
