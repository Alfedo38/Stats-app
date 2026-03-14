"use client";
import { useState, useEffect, useRef } from 'react';
import { Search, Loader2 } from 'lucide-react';
import Link from 'next/link';

export default function SearchBar() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setResults([]);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (query.length < 2) { setResults([]); return; }
    const fetchPlayers = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setResults(Array.isArray(data) ? data : []);
      } catch (error) { setResults([]); }
      setLoading(false);
    };
    const timeoutId = setTimeout(fetchPlayers, 300);
    return () => clearTimeout(timeoutId);
  }, [query]);

  return (
    <div ref={searchRef} className="relative w-full max-w-xl mx-auto z-[100]">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="SEARCH PLAYER (E.G. LEBRON, CURRY)..."
          className="w-full bg-[#0a0a0a] border border-[#222] text-white rounded-2xl pl-12 pr-12 py-4 focus:border-[#10b981] transition-all outline-none font-black uppercase tracking-widest text-xs"
        />
        <div className="absolute top-0 left-4 h-full flex items-center">
          {loading ? <Loader2 size={18} className="text-[#10b981] animate-spin" /> : <Search size={18} className="text-[#444]" />}
        </div>
      </div>

      {results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-[#0a0a0a] border border-[#222] rounded-2xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,1)] max-h-[400px] overflow-y-auto no-scrollbar z-[110]">
          {results.map((p) => (
            <Link 
              key={p.id} 
              href={`/players/${p.id}`} 
              onClick={() => { setQuery(''); setResults([]); }}
              className="flex items-center gap-4 p-4 hover:bg-[#111] border-b border-[#111] last:border-0 no-underline group"
            >
              <div className="w-12 h-12 rounded-full bg-[#1a1a1a] overflow-hidden shrink-0 border border-[#333]">
                <img 
                  src={p.image} 
                  className="w-full h-full object-cover object-top"
                  onError={(e) => { e.currentTarget.src = 'https://cdn.nba.com/headshots/nba/latest/260x190/logoman.png'; }}
                  alt=""
                />
              </div>
              <div className="flex flex-col text-left">
                <span className="text-white font-black uppercase text-[13px] group-hover:text-[#10b981] transition-colors">
                  {p.display_name}
                </span>
                <span className="text-[#555] font-bold text-[9px] uppercase tracking-widest">NBA Player</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}