"use client";
import { useState, useEffect } from 'react';
import { Search } from 'lucide-react';
import Link from 'next/link';

export default function SearchBar() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (query.length < 2) { setResults([]); return; }

    const fetchPlayers = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setResults(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error("Error buscando:", error);
      }
      setLoading(false);
    };

    const timeoutId = setTimeout(fetchPlayers, 300);
    return () => clearTimeout(timeoutId);
  }, [query]);

  return (
    <div className="relative w-full max-w-xl mx-auto z-50">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search player (e.g. LeBron, Curry)..."
        className="w-full bg-[#0a0a0a] border border-[#222] text-white rounded-2xl pl-12 pr-4 py-4 focus:border-[#10b981] transition-all outline-none font-black uppercase tracking-widest text-sm"
      />
      <div className="absolute top-0 left-4 h-full flex items-center"><Search size={18} className="text-[#444]" /></div>

      {results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-[#0a0a0a] border border-[#222] rounded-2xl overflow-hidden shadow-2xl">
          {results.map((p) => (
            <Link key={p.id} href={`/players/${p.id}`} className="flex items-center gap-4 p-4 hover:bg-[#111] border-b border-[#111] no-underline">
              <img src={`https://cdn.nba.com/headshots/nba/latest/260x190/${p.id}.png`} className="w-10 h-10 rounded-full bg-[#1a1a1a]" />
              <span className="text-white font-black uppercase text-xs">{p.full_name}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}