"use client";

import { useState, useEffect } from 'react';
import { Swords, Shield, Cpu, Activity, Zap, Crosshair, Search, X, Flame, Trash2, Target, ArrowLeftRight } from 'lucide-react';

type Role = 'TOP' | 'JNG' | 'MID' | 'BOT' | 'SUP';
type PickStats = { games: number; winRate: string; kda: string; fbRate: string; avgDragons: string; avgGoldDiff: number; avgTeamKills: string; avgTowers: string };
type Pick = { role: Role; player: string; champion: string | null; champId: string | null; locked: boolean; stats: PickStats | null };

const initialPicks: Pick[] = [
  { role: 'TOP', player: '', champion: null, champId: null, locked: false, stats: null },
  { role: 'JNG', player: '', champion: null, champId: null, locked: false, stats: null },
  { role: 'MID', player: '', champion: null, champId: null, locked: false, stats: null },
  { role: 'BOT', player: '', champion: null, champId: null, locked: false, stats: null },
  { role: 'SUP', player: '', champion: null, champId: null, locked: false, stats: null },
];

export default function DraftSimulator() {
  const [blueTeam, setBlueTeam] = useState<string | null>(null);
  const [redTeam, setRedTeam] = useState<string | null>(null);
  const [bluePicks, setBluePicks] = useState<Pick[]>(JSON.parse(JSON.stringify(initialPicks)));
  const [redPicks, setRedPicks] = useState<Pick[]>(JSON.parse(JSON.stringify(initialPicks)));

  const [teamsList, setTeamsList] = useState<string[]>([]);
  const [playersList, setPlayersList] = useState<string[]>([]); 
  const [showTeamModal, setShowTeamModal] = useState<'blue' | 'red' | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [lastUpdate, setLastUpdate] = useState<string>('Cargando...');

  const [activePlayerInput, setActivePlayerInput] = useState<{ side: 'blue' | 'red', index: number } | null>(null);

  const [patchVersion, setPatchVersion] = useState<string>('14.4.1');
  const [championsList, setChampionsList] = useState<any[]>([]);
  const [showChampModal, setShowChampModal] = useState<{ side: 'blue' | 'red', index: number } | null>(null);
  const [champSearchQuery, setChampSearchQuery] = useState('');

  useEffect(() => {
    fetch('/api/draft?action=teams').then(res => res.json()).then(data => setTeamsList(data || []));
    fetch('/api/draft?action=players').then(res => res.json()).then(data => setPlayersList(data || [])); 
    fetch('/api/draft?action=last_update').then(res => res.json()).then(data => setLastUpdate(data.date || 'Desconocida'));
    
    const fetchDDragon = async () => {
      try {
        const versionRes = await fetch('https://ddragon.leagueoflegends.com/api/versions.json');
        const latestVersion = (await versionRes.json())[0];
        setPatchVersion(latestVersion);
        const champRes = await fetch(`https://ddragon.leagueoflegends.com/cdn/${latestVersion}/data/es_AR/champion.json`);
        const champData = await champRes.json();
        const champsArray = Object.values(champData.data).map((c: any) => ({ id: c.id, name: c.name })).sort((a, b) => a.name.localeCompare(b.name));
        setChampionsList(champsArray);
      } catch (error) { console.error("Error DDragon:", error); }
    };
    fetchDDragon();
  }, []);

  const handleSelectTeam = async (teamName: string) => {
    const side = showTeamModal;
    if (!side) return;
    setShowTeamModal(null); setSearchQuery('');
    if (side === 'blue') setBlueTeam(teamName); else setRedTeam(teamName);

    const newPicks = initialPicks.map(p => ({ ...p, player: '', champion: null, champId: null, locked: false, stats: null }));
    if (side === 'blue') setBluePicks(newPicks); else setRedPicks(newPicks);
  };

  const handlePlayerNameChange = (side: 'blue' | 'red', index: number, name: string) => {
    const picks = side === 'blue' ? [...bluePicks] : [...redPicks];
    picks[index].player = name;
    picks[index].champion = null; picks[index].champId = null; picks[index].locked = false; picks[index].stats = null;
    if (side === 'blue') setBluePicks(picks); else setRedPicks(picks);
  };

  const handleLockChampion = async (champName: string, champId: string) => {
    if (!showChampModal) return;
    const { side, index } = showChampModal;
    const picks = side === 'blue' ? [...bluePicks] : [...redPicks];
    const pick = picks[index];

    if (pick.player.trim() === '') {
        alert("Escribe el nombre del jugador primero."); return;
    }

    setShowChampModal(null); setChampSearchQuery('');
    try {
      const res = await fetch(`/api/draft?action=stats&player=${encodeURIComponent(pick.player.trim())}&champion=${encodeURIComponent(champName)}`);
      const stats = await res.json();
      picks[index] = { ...pick, champion: champName, champId: champId, locked: true, stats };
      if (side === 'blue') setBluePicks(picks); else setRedPicks(picks);
    } catch (error) { console.error("Error", error); }
  };

  const handleReset = () => {
    setBlueTeam(null); setRedTeam(null);
    setBluePicks(JSON.parse(JSON.stringify(initialPicks))); setRedPicks(JSON.parse(JSON.stringify(initialPicks)));
  };

  const handleSwapSides = () => {
    setBlueTeam(redTeam); setRedTeam(blueTeam);
    setBluePicks([...redPicks]); setRedPicks([...bluePicks]);
  };

  const calculateMetrics = () => {
    let bWin = 0, bFb = 0, bDrag = 0, bGold = 0, bKills = 0, bTowers = 0, bCount = 0;
    let rWin = 0, rFb = 0, rDrag = 0, rGold = 0, rKills = 0, rTowers = 0, rCount = 0;

    bluePicks.forEach(p => { if (p.stats && p.stats.games > 0) { bWin += parseFloat(p.stats.winRate); bFb += parseFloat(p.stats.fbRate); bDrag += parseFloat(p.stats.avgDragons); bGold += p.stats.avgGoldDiff; bKills += parseFloat(p.stats.avgTeamKills); bTowers += parseFloat(p.stats.avgTowers); bCount++; } });
    redPicks.forEach(p => { if (p.stats && p.stats.games > 0) { rWin += parseFloat(p.stats.winRate); rFb += parseFloat(p.stats.fbRate); rDrag += parseFloat(p.stats.avgDragons); rGold += p.stats.avgGoldDiff; rKills += parseFloat(p.stats.avgTeamKills); rTowers += parseFloat(p.stats.avgTowers); rCount++; } });
    const blueAvgWin = bCount > 0 ? bWin / bCount : 50; const redAvgWin = rCount > 0 ? rWin / rCount : 50;
    
    return { 
      winProbBlue: bCount + rCount === 0 ? 50 : (blueAvgWin / (blueAvgWin + redAvgWin)) * 100, 
      fbBlue: bCount > 0 ? (bFb / bCount).toFixed(1) : '0', fbRed: rCount > 0 ? (rFb / rCount).toFixed(1) : '0', 
      dragBlue: bCount > 0 ? (bDrag / bCount).toFixed(1) : '0', dragRed: rCount > 0 ? (rDrag / rCount).toFixed(1) : '0', 
      goldBlue: bCount > 0 ? Math.round(bGold / bCount) : 0, goldRed: rCount > 0 ? Math.round(rGold / rCount) : 0,
      killsBlue: bCount > 0 ? (bKills / bCount).toFixed(1) : '0', killsRed: rCount > 0 ? (rKills / rCount).toFixed(1) : '0',
      towersBlue: bCount > 0 ? (bTowers / bCount).toFixed(1) : '0', towersRed: rCount > 0 ? (rTowers / rCount).toFixed(1) : '0',
    };
  };

  const metrics = calculateMetrics();
  const filteredTeams = teamsList.filter(t => t.toLowerCase().includes(searchQuery.toLowerCase()));
  const filteredChamps = championsList.filter(c => c.name.toLowerCase().includes(champSearchQuery.toLowerCase()));

  const CompareBar = ({ title, icon: Icon, valBlue, valRed, suffix = "", color = "blue" }: any) => {
    const numBlue = parseFloat(valBlue); const numRed = parseFloat(valRed); const total = numBlue + numRed; 
    const bluePct = total === 0 ? 50 : (numBlue / total) * 100; const redPct = total === 0 ? 50 : (numRed / total) * 100;
    return ( <div className="w-full"> <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-[#666] mb-2"> <span className="text-blue-500">{valBlue}{suffix}</span> <span className="flex items-center gap-1 text-white"><Icon size={12} className={`text-${color}-500`} /> {title}</span> <span className="text-red-500">{valRed}{suffix}</span> </div> <div className="w-full h-2 bg-[#111] rounded-full flex overflow-hidden border border-[#222]"> <div className="h-full bg-blue-600 transition-all duration-700" style={{ width: `${bluePct}%` }} /> <div className="h-full bg-red-600 transition-all duration-700" style={{ width: `${redPct}%` }} /> </div> </div> );
  };

  return (
    <main className="min-h-screen bg-black text-white p-4 md:p-8 pb-20 overflow-hidden relative">
      <div className="absolute top-0 left-0 w-1/3 h-full bg-blue-600 opacity-5 blur-[150px] pointer-events-none" />
      <div className="absolute top-0 right-0 w-1/3 h-full bg-red-600 opacity-5 blur-[150px] pointer-events-none" />

      <div className="max-w-[1400px] mx-auto space-y-8 relative z-10">
        <div className="flex flex-col items-center justify-center text-center border-b border-[#1a1a1a] pb-8 relative">
          
          <div className="absolute right-0 top-0 flex items-center gap-3">
            <button onClick={handleSwapSides} className="flex items-center gap-2 text-[#666] hover:text-blue-400 transition-colors text-[10px] font-black uppercase tracking-widest bg-[#111] px-4 py-2 rounded-xl border border-[#222] hover:border-blue-500/50">
              <ArrowLeftRight size={14} /> Cambiar Lado
            </button>
            <button onClick={handleReset} className="flex items-center gap-2 text-[#666] hover:text-red-500 transition-colors text-[10px] font-black uppercase tracking-widest bg-[#111] px-4 py-2 rounded-xl border border-[#222] hover:border-red-500/50"> 
              <Trash2 size={14} /> Limpiar Tablero 
            </button>
          </div>

          <div className="w-16 h-16 bg-[#1a1a1a] rounded-2xl flex items-center justify-center border border-[#333] mb-4 shadow-[0_0_30px_rgba(16,185,129,0.1)]"> <Cpu className="text-[#10b981]" size={32} /> </div>
          <h1 className="text-5xl md:text-7xl font-black italic uppercase tracking-tighter">Draft <span className="text-[#10b981]">Predictor</span></h1>
          
          {/* AQUÍ ESTÁ EL INDICADOR DE FECHA */}
          <p className="text-[#666] text-[10px] md:text-xs font-bold uppercase tracking-[0.4em] mt-2 flex items-center gap-2">
            <Activity size={14} className="text-[#10b981]" /> Motor de cálculo EV+ • BD AL: <span className="text-white">{lastUpdate}</span>
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* LADO AZUL */}
          <div className="lg:col-span-4 space-y-4">
            <div className="bg-blue-950/20 border border-blue-900/50 rounded-2xl p-4 flex items-center justify-between">
              <div> <p className="text-blue-500 text-[10px] font-black uppercase tracking-widest mb-1">Blue Side</p> <button onClick={() => setShowTeamModal('blue')} className="text-2xl font-black italic uppercase text-white hover:text-blue-400"> {blueTeam || '+ ELEGIR EQUIPO'} </button> </div>
            </div>
            <div className="space-y-2">
              {bluePicks.map((pick, i) => (
                <div key={i} className="h-24 bg-[#0a0a0a] border border-[#1a1a1a] border-l-4 border-l-blue-500 rounded-xl p-3 flex items-center gap-4 hover:border-blue-500/50 transition-colors relative group">
                  <div className="w-12 h-12 bg-[#111] rounded-lg border border-[#222] flex items-center justify-center shrink-0 overflow-hidden relative">
                    {pick.champId ? ( <img src={`https://ddragon.leagueoflegends.com/cdn/${patchVersion}/img/champion/${pick.champId}.png`} alt={pick.champion!} className="w-full h-full object-cover scale-110" /> ) : ( <span className="text-[9px] font-black text-[#444]">{pick.role}</span> )}
                  </div>
                  <div className="flex-1 w-full space-y-1 relative">
                    <input type="text" value={pick.player} onChange={(e) => handlePlayerNameChange('blue', i, e.target.value)} onFocus={() => setActivePlayerInput({side: 'blue', index: i})} onBlur={() => setTimeout(() => setActivePlayerInput(null), 200)} placeholder="Nombre jugador..." className="w-full bg-transparent text-[10px] font-bold text-gray-300 uppercase tracking-widest placeholder:text-[#333] outline-none border-b border-transparent focus:border-[#333]" />
                    {activePlayerInput?.side === 'blue' && activePlayerInput.index === i && pick.player.length > 1 && (
                      <div className="absolute top-6 left-0 w-full z-50 bg-[#111] border border-[#333] rounded-lg shadow-xl max-h-32 overflow-y-auto">
                        {playersList.filter(p => p.toLowerCase().includes(pick.player.toLowerCase()) && p !== pick.player).slice(0, 10).map(p => (
                          <div key={p} onClick={() => handlePlayerNameChange('blue', i, p)} className="p-2 hover:bg-[#222] cursor-pointer text-[10px] font-black uppercase text-gray-300 hover:text-[#10b981]">{p}</div>
                        ))}
                      </div>
                    )}
                    
                    <button onClick={() => setShowChampModal({side:'blue', index: i})} className="w-full text-left">
                      <p className={`text-lg font-black uppercase tracking-tight ${pick.locked ? 'text-blue-400' : 'text-gray-600 group-hover:text-blue-400'}`}>{pick.champion || '+ ELEGIR CHAMP'}</p>
                    </button>
                    {pick.stats && pick.stats.games > 0 && <p className="text-[9px] font-bold text-gray-500 pt-0.5">{pick.stats.winRate}% WR • {pick.stats.kda} KDA</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* CEREBRO CENTRAL */}
          <div className="lg:col-span-4 flex flex-col gap-6"> <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-3xl p-6 h-full flex flex-col items-center relative overflow-hidden"> <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-32 bg-[#10b981] opacity-10 blur-[50px] rounded-full" /> <h2 className="text-xl font-black uppercase tracking-tighter mb-8 text-center mt-2">Win Condition</h2> <div className="w-full h-8 bg-[#111] rounded-full flex overflow-hidden border border-[#222] relative mb-6 shadow-inner"> <div className="h-full bg-blue-600 transition-all duration-1000 flex items-center pl-4" style={{ width: `${metrics.winProbBlue}%` }}> <span className="text-[10px] font-black text-white">{metrics.winProbBlue.toFixed(1)}%</span> </div> <div className="h-full bg-red-600 transition-all duration-1000 flex items-center justify-end pr-4" style={{ width: `${100 - metrics.winProbBlue}%` }}> <span className="text-[10px] font-black text-white">{(100 - metrics.winProbBlue).toFixed(1)}%</span> </div> <div className="absolute left-1/2 top-0 bottom-0 w-1 bg-black -translate-x-1/2" /> </div> 
            
            <div className="w-full space-y-5"> 
              <CompareBar title="Potencial 1st Blood" icon={Crosshair} valBlue={metrics.fbBlue} valRed={metrics.fbRed} suffix="%" color="green" /> 
              <CompareBar title="Kills por Partido" icon={Swords} valBlue={metrics.killsBlue} valRed={metrics.killsRed} color="red" /> 
              <CompareBar title="Torres Destruidas" icon={Target} valBlue={metrics.towersBlue} valRed={metrics.towersRed} color="blue" /> 
              <CompareBar title="Dragones Previstos" icon={Flame} valBlue={metrics.dragBlue} valRed={metrics.dragRed} color="orange" /> 
              <div className="w-full bg-[#111] border border-[#222] rounded-xl p-3 flex justify-between items-center mt-2"> <div className="flex items-center gap-2 text-[#666]"> <Zap size={14} className="text-yellow-500" /> <span className="text-[10px] font-black uppercase tracking-widest">Oro @15 (Promedio)</span> </div> <div className="text-right"> <p className="text-xs font-black text-blue-500">{metrics.goldBlue > 0 ? '+' : ''}{metrics.goldBlue}</p> <p className="text-xs font-black text-red-500">{metrics.goldRed > 0 ? '+' : ''}{metrics.goldRed}</p> </div> </div> 
            </div> 
          </div> </div>

          {/* LADO ROJO */}
          <div className="lg:col-span-4 space-y-4">
            <div className="bg-red-950/20 border border-red-900/50 rounded-2xl p-4 flex items-center justify-between text-right"> <Shield size={24} className="text-red-500 opacity-50" /> <div> <p className="text-red-500 text-[10px] font-black uppercase tracking-widest mb-1">Red Side</p> <button onClick={() => setShowTeamModal('red')} className="text-2xl font-black italic uppercase text-white hover:text-red-400"> {redTeam || '+ ELEGIR EQUIPO'} </button> </div> </div>
            <div className="space-y-2">
              {redPicks.map((pick, i) => (
                <div key={i} className="h-24 bg-[#0a0a0a] border border-[#1a1a1a] border-r-4 border-r-red-500 rounded-xl p-3 flex items-center gap-4 hover:border-red-500/50 transition-colors flex-row-reverse text-right relative group">
                  <div className="w-12 h-12 bg-[#111] rounded-lg border border-[#222] flex items-center justify-center shrink-0 overflow-hidden relative">
                    {pick.champId ? ( <img src={`https://ddragon.leagueoflegends.com/cdn/${patchVersion}/img/champion/${pick.champId}.png`} alt={pick.champion!} className="w-full h-full object-cover scale-110" /> ) : ( <span className="text-[9px] font-black text-[#444]">{pick.role}</span> )}
                  </div>
                  <div className="flex-1 w-full space-y-1 relative">
                    <input type="text" value={pick.player} onChange={(e) => handlePlayerNameChange('red', i, e.target.value)} onFocus={() => setActivePlayerInput({side: 'red', index: i})} onBlur={() => setTimeout(() => setActivePlayerInput(null), 200)} placeholder="Nombre jugador..." className="w-full bg-transparent text-[10px] font-bold text-gray-300 uppercase tracking-widest placeholder:text-[#333] outline-none border-b border-transparent focus:border-[#333] text-right" dir="rtl" />
                    {activePlayerInput?.side === 'red' && activePlayerInput.index === i && pick.player.length > 1 && (
                      <div className="absolute top-6 right-0 w-full z-50 bg-[#111] border border-[#333] rounded-lg shadow-xl max-h-32 overflow-y-auto text-right">
                        {playersList.filter(p => p.toLowerCase().includes(pick.player.toLowerCase()) && p !== pick.player).slice(0, 10).map(p => (
                          <div key={p} onClick={() => handlePlayerNameChange('red', i, p)} className="p-2 hover:bg-[#222] cursor-pointer text-[10px] font-black uppercase text-gray-300 hover:text-[#10b981]">{p}</div>
                        ))}
                      </div>
                    )}

                    <button onClick={() => setShowChampModal({side:'red', index: i})} className="w-full text-right">
                      <p className={`text-lg font-black uppercase tracking-tight ${pick.locked ? 'text-red-400' : 'text-gray-600 group-hover:text-red-400'}`}>{pick.champion || '+ ELEGIR CHAMP'}</p>
                    </button>
                    {pick.stats && pick.stats.games > 0 && <p className="text-[9px] font-bold text-gray-500 pt-0.5">{pick.stats.winRate}% WR • {pick.stats.kda} KDA</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Modales quedan igual ocultos abajo */}
      {showTeamModal && ( <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"> <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-3xl w-full max-w-lg overflow-hidden"> <div className="p-4 border-b border-[#1a1a1a] flex justify-between bg-[#111]"> <h3 className="font-black italic uppercase">Seleccionar Equipo</h3> <button onClick={() => setShowTeamModal(null)}><X size={20} className="text-[#666] hover:text-white" /></button> </div> <div className="p-4 border-b border-[#1a1a1a]"> <input type="text" placeholder="Buscar..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="bg-[#111] border border-[#222] rounded-xl px-4 py-2 text-white w-full outline-none text-sm font-bold uppercase tracking-widest" autoFocus /> </div> <div className="max-h-96 overflow-y-auto p-2"> {filteredTeams.map(team => ( <button key={team} onClick={() => handleSelectTeam(team)} className="w-full text-left px-4 py-3 rounded-xl hover:bg-[#111] font-black uppercase text-gray-300 hover:text-white">{team}</button> ))} </div> </div> </div> )}
      {showChampModal && ( <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"> <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl border-t-4 border-t-[#10b981]"> <div className="p-4 border-b border-[#1a1a1a] flex justify-between bg-[#111]"> <h3 className="font-black italic uppercase tracking-tighter text-xl">Seleccionar Campeón</h3> <button onClick={() => { setShowChampModal(null); setChampSearchQuery(''); }}><X size={20} className="text-[#666] hover:text-white" /></button> </div> <div className="p-4 border-b border-[#1a1a1a] bg-[#0a0a0a]"> <div className="flex items-center gap-2 bg-[#111] border border-[#222] rounded-xl px-4 py-3"> <Search size={18} className="text-[#666]" /> <input type="text" placeholder="Escribe el nombre del campeón..." value={champSearchQuery} onChange={(e) => setChampSearchQuery(e.target.value)} className="bg-transparent text-white w-full outline-none text-base font-bold uppercase tracking-widest placeholder:text-[#444]" autoFocus /> </div> </div> <div className="max-h-[60vh] overflow-y-auto p-4 grid grid-cols-2 md:grid-cols-3 gap-3"> {filteredChamps.length > 0 ? ( filteredChamps.map(champ => ( <button key={champ.id} onClick={() => handleLockChampion(champ.name, champ.id)} className="flex items-center gap-3 p-3 rounded-xl hover:bg-[#111] border border-transparent hover:border-[#222] transition-all text-left group"> <img src={`https://ddragon.leagueoflegends.com/cdn/${patchVersion}/img/champion/${champ.id}.png`} alt={champ.name} className="w-10 h-10 rounded-md border border-[#333] group-hover:border-[#10b981]" /> <span className="font-black uppercase tracking-tight text-gray-300 group-hover:text-white">{champ.name}</span> </button> )) ) : ( <p className="col-span-full text-center text-[#666] text-xs font-bold uppercase tracking-widest p-8">No se encontró el campeón</p> )} </div> </div> </div> )}
    </main>
  );
}