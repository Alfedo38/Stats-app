"use client";
import { useState, useEffect } from 'react';
import { Search } from 'lucide-react';
import Link from 'next/link';

export default function SearchBar() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }

    const fetchPlayers = async () => {
      setLoading(true);
      try {
        // Reemplaza el localhost con tu ruta real si es diferente
        const res = await fetch(`http://127.0.0.1:8000/search_players.php?q=${query}`);
        const data = await res.json();
        setResults(data);
      } catch (error) {
        console.error("Error buscando:", error);
      }
      setLoading(false);
    };

    // Le ponemos un pequeño retraso (debounce) para no saturar tu base de datos si tecleas muy rápido
    const timeoutId = setTimeout(() => {
      fetchPlayers();
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [query]);

  return (
    <div className="relative w-full max-w-xl mx-auto z-50">
      <div className="relative group">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
          <Search size={18} className="text-[#666] group-focus-within:text-[#10b981] transition-colors" />
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search player (e.g. LeBron, Curry)..."
          className="w-full bg-[#0a0a0a] border border-[#222] text-white text-sm rounded-2xl pl-12 pr-4 py-4 focus:outline-none focus:border-[#10b981] focus:ring-1 focus:ring-[#10b981] transition-all shadow-lg placeholder:text-[#444] font-black uppercase tracking-widest"
        />
      </div>

      {/* RESULTADOS FLOTANTES */}
      {query.length >= 2 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-[#0a0a0a] border border-[#222] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
          {loading && <div className="p-4 text-center text-[#666] text-xs font-bold uppercase tracking-widest animate-pulse">Buscando...</div>}
          
          {!loading && results.length === 0 && (
            <div className="p-4 text-center text-[#666] text-xs font-bold uppercase tracking-widest">No se encontraron jugadores</div>
          )}

          {!loading && results.map((player) => (
            <Link 
              href={`/players/${player.id}`} 
              key={player.id}
              className="flex items-center gap-4 p-4 hover:bg-[#111] border-b border-[#1a1a1a] last:border-0 transition-colors group no-underline"
            >
              {/* Mini foto del jugador */}
              <div className="w-10 h-10 bg-[#1a1a1a] rounded-full overflow-hidden border border-[#333] group-hover:border-[#10b981] transition-colors flex-shrink-0">
                <img 
                  src={`https://cdn.nba.com/headshots/nba/latest/260x190/${player.id}.png`} 
                  alt={player.first_name}
                  className="w-full h-full object-cover object-top pt-1"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              </div>
              <div>
                <span className="text-white font-black uppercase tracking-wider text-sm group-hover:text-[#10b981] transition-colors">
                  {player.first_name} {player.last_name}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}