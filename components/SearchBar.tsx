"use client";
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Loader2, X, Users, User, ChevronRight } from 'lucide-react';

export default function SearchBar() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Cerrar al hacer clic afuera
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Búsqueda con Debounce
  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    const fetchResults = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setResults(data);
        setIsOpen(true);
      } catch (error) {
        setResults([]);
      }
      setLoading(false);
    };

    const timeoutId = setTimeout(fetchResults, 300);
    return () => clearTimeout(timeoutId);
  }, [query]);

  const handleSelect = (item: any) => {
    setQuery('');
    setResults([]);
    setIsOpen(false);
    
    // REDIRECCIÓN INTELIGENTE
    if (item.type === 'player') {
      router.push(`/players/${item.id}`);
    } else {
      router.push(`/teams/${item.id}`);
    }
  };

  return (
    <div ref={searchRef} className="relative w-full max-w-md z-[100]">
      <div className="relative">
        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
          {loading ? (
            <Loader2 size={18} className="text-[#10b981] animate-spin" />
          ) : (
            <Search size={18} className="text-[#444]" />
          )}
        </div>
        
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => query.length >= 2 && setIsOpen(true)}
          placeholder="BUSCAR JUGADOR O EQUIPO..."
          className="w-full bg-[#0a0a0a] border border-[#222] text-white rounded-2xl pl-12 pr-12 py-3.5 focus:border-[#10b981] focus:ring-1 focus:ring-[#10b981]/20 transition-all outline-none font-black uppercase tracking-widest text-[10px]"
        />

        {query && (
          <button 
            onClick={() => { setQuery(''); setResults([]); }}
            className="absolute inset-y-0 right-4 flex items-center text-[#444] hover:text-white transition-colors"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Resultados Mixtos */}
      {isOpen && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-[#0a0a0a] border border-[#222] rounded-2xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,1)] max-h-[400px] overflow-y-auto z-[110]">
          {results.map((item) => (
            <button 
              key={`${item.type}-${item.id}`} 
              onClick={() => handleSelect(item)}
              className="w-full flex items-center gap-4 p-4 hover:bg-[#111] border-b border-[#111] last:border-0 transition-colors group text-left"
            >
              <div className="w-10 h-10 rounded-full bg-[#1a1a1a] overflow-hidden shrink-0 border border-[#222] flex items-center justify-center">
                <img 
                  src={item.image} 
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    // Si falla la imagen, ponemos un icono genérico
                    e.currentTarget.style.display = 'none';
                  }}
                  alt=""
                />
                {item.type === 'player' ? <User size={16} className="text-[#333]" /> : <Users size={16} className="text-[#333]" />}
              </div>
              
              <div className="flex-1 flex flex-col">
                <span className="text-white font-black uppercase text-xs group-hover:text-[#10b981] transition-colors">
                  {item.display_name}
                </span>
                <span className="text-[#444] font-bold text-[8px] uppercase tracking-widest">
                  {item.subtitle}
                </span>
              </div>
              
              <ChevronRight size={14} className="text-[#222] group-hover:text-white transition-colors" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}