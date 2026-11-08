'use client';
import {useState} from 'react';
import {cleanPreset,PRESET_LIMIT,readPresets,type JornadaPreset,type JornadaPresetFilters} from '@/lib/jornadaPresets';
import styles from './NbaResearch.module.css';

export default function JornadaPresets({storageKey,filters,onApply}:{storageKey:string;filters:JornadaPresetFilters;onApply:(filters:JornadaPresetFilters)=>void}){
 const key=storageKey+':jornada-presets-v1';
 const [list,setList]=useState<JornadaPreset[]>([]),[choice,setChoice]=useState(''),[name,setName]=useState(''),[notice,setNotice]=useState('');
 function refresh(){
  try{setList(readPresets(localStorage,key));}catch{setNotice('El navegador bloqueó el acceso a los filtros guardados.');}
 }
 function write(next:JornadaPreset[],selected:string,message:string){
  localStorage.setItem(key,JSON.stringify(next));setList(next);setChoice(selected);setNotice(message);
 }
 function save(){
  const preset=cleanPreset({name,filters});if(!preset)return;
  try{
   const current=readPresets(localStorage,key),updated=current.some(p=>p.name===preset.name);
   if(!updated&&current.length>=PRESET_LIMIT){setNotice('Guardaste seis vistas. Eliminá una antes de agregar otra.');return;}
   write([...current.filter(p=>p.name!==preset.name),preset],preset.name,updated?'Vista actualizada.':'Vista guardada.');setName('');
  }catch{setNotice('El navegador no pudo guardar la vista.');}
 }
 function apply(){
  try{
   const current=readPresets(localStorage,key),preset=current.find(p=>p.name===choice);
   setList(current);
   if(!preset){setChoice('');setNotice('La vista ya no está guardada.');return;}
   onApply(preset.filters);setNotice('Filtros aplicados.');
  }catch{setNotice('No pudimos leer la vista guardada.');}
 }
 function remove(){
  try{write(readPresets(localStorage,key).filter(p=>p.name!==choice),'','Vista eliminada.');}catch{setNotice('No pudimos eliminar la vista.');}
 }
 return <details className={styles.disclosure} onToggle={e=>{if(e.currentTarget.open)refresh();}}>
  <summary>Vistas guardadas</summary>
  <div className={styles.detail}>
   <p>Reutilizá mercado, casa y filtros en esta computadora. La fecha, el partido y la búsqueda siguen como están.</p>
   <div className={styles.presets}>
    <label>Nombre de la vista<input maxLength={32} value={name} onChange={e=>setName(e.target.value)} placeholder="Ej. Rebotes · Stake"/></label>
    <button type="button" disabled={!name.trim()} onClick={save}>Guardar vista</button>
   </div>
   <div className={styles.presets}>
    <label>Vista guardada<select value={list.some(p=>p.name===choice)?choice:''} onChange={e=>setChoice(e.target.value)}><option value="">Elegí una vista</option>{list.map(p=><option key={p.name}>{p.name}</option>)}</select></label>
    <button type="button" disabled={!list.some(p=>p.name===choice)} onClick={apply}>Aplicar</button>
    <button type="button" disabled={!list.some(p=>p.name===choice)} onClick={remove}>Eliminar</button>
   </div>
   {notice&&<p role="status">{notice}</p>}
  </div>
 </details>;
}
