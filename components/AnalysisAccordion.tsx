"use client";
import type {ReactNode} from 'react';
import {ChevronDown,BarChart3,Clock3,Database,Shield,TrendingUp} from 'lucide-react';
import styles from './AnalysisAccordion.module.css';
export {styles as analysisStyles};
const icons={coverage:Database,role:BarChart3,estimate:TrendingUp,defense:Shield,rest:Clock3};
export type AnalysisIcon=keyof typeof icons;
export function AnalysisSummary({title,icon}:{title:string;icon:AnalysisIcon}){
 const Icon=icons[icon];
 return <summary className={styles.trigger}><span className={styles.heading}><span className={styles.icon}><Icon size={16} aria-hidden="true" /></span><span className={styles.title}>{title}</span></span><ChevronDown size={16} aria-hidden="true" className={styles.chevron}/></summary>;
}
export default function AnalysisAccordion({title,icon,children,onToggle}:{title:string;icon:AnalysisIcon;children:ReactNode;onToggle?:(open:boolean)=>void}){
 return <details className={styles.box} onToggle={event=>onToggle?.(event.currentTarget.open)}><AnalysisSummary title={title} icon={icon}/><div className={`${styles.body} space-y-3`}>{children}</div></details>;
}
