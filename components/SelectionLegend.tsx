export default function SelectionLegend({hasPush=false,hasMissing=false}:{hasPush?:boolean;hasMissing?:boolean}){
 return <div data-graph-legend aria-label="Leyenda del gráfico">
  <span><b style={{background:'#10b981'}}/>Cumplió la selección</span>
  <span><b style={{background:'#ef4444'}}/>No la cumplió</span>
  {hasPush&&<span><b style={{background:'#f59e0b'}}/>Nula · igualó la línea</span>}
  {hasMissing&&<span><b style={{background:'#64748b'}}/>Sin dato · fuera del cálculo</span>}
 </div>;
}
