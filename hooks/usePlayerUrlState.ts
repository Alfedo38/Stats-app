"use client";

import { useCallback, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

type SplitScope = "FULL" | "Q1" | "H1" | "H2_REG";

interface UsePlayerUrlStateOptions {
  defaultStat?: string;
  defaultLine?: number;
  defaultN?: number;
  defaultScope?: SplitScope;
}

interface PlayerUrlState {
  activeStat: string;
  lineValue: number;
  lastN: number;
  activeScope: SplitScope;
  hasLineParam: boolean;
  setActiveStat: (v: string) => void;
  setLineValue: (v: number | ((prev: number) => number)) => void;
  setLastN: (v: number) => void;
  setActiveScope: (v: SplitScope) => void;
  shareUrl: () => Promise<boolean>;
  isPending: boolean;
}

const VALID_SCOPES: SplitScope[] = ["FULL", "Q1", "H1", "H2_REG"];
const VALID_N = [5, 10, 20, 30];
const STAT_ALIASES: Record<string, string> = {
  PTS: "pts",
  REB: "reb",
  AST: "ast",
  PRA: "pts+reb+ast",
  PR: "pts+reb",
  PA: "pts+ast",
  RA: "reb+ast",
  "3PT": "fg3m",
  "3PM": "fg3m",
  "3PTM": "fg3m",
  "3PA": "fg3a",
  "3PTA": "fg3a",
  FGM: "fgm",
  FGA: "fga",
  BLK: "blk",
  BLOCKS: "blk",
  STL: "stl",
  STEALS: "stl",
  "STL+BLK": "stl+blk",
  STOCKS: "stl+blk",
  PF: "pf",
  FOULS: "pf",
  USG: "usage_pct",
  "USG%": "usage_pct",
  USAGE: "usage_pct",
  TOUCHES: "touches",
  TO: "tov",
  TOV: "tov",
};

function parseScope(raw: string | null, fallback: SplitScope): SplitScope {
  const upper = (raw ?? "").toUpperCase() as SplitScope;
  return VALID_SCOPES.includes(upper) ? upper : fallback;
}

function parseN(raw: string | null, fallback: number): number {
  const n = Number(raw);
  return VALID_N.includes(n) ? n : fallback;
}

function parseLine(raw: string | null, fallback: number): number {
  const n = parseFloat(raw ?? "");
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function normalizeStat(raw: string | null, fallback: string) {
  const value = String(raw || fallback).trim();
  const upper = value.toUpperCase();
  return STAT_ALIASES[upper] || value.toLowerCase();
}

export function usePlayerUrlState({
  defaultStat = "pts",
  defaultLine = 18.5,
  defaultN = 30,
  defaultScope = "FULL",
}: UsePlayerUrlStateOptions = {}): PlayerUrlState {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // La URL solo inicializa el estado. Después NO se actualiza automáticamente para que la página sea rápida.
  const [activeStat, setActiveStatState] = useState(() => normalizeStat(searchParams.get("stat"), defaultStat));
  const [lineValue, setLineValueState] = useState(() => parseLine(searchParams.get("line"), defaultLine));
  const [lastN, setLastNState] = useState(() => parseN(searchParams.get("n"), defaultN));
  const [activeScope, setActiveScopeState] = useState<SplitScope>(() => parseScope(searchParams.get("scope"), defaultScope));

  const hasLineParam = useMemo(() => searchParams.has("line"), []);

  const setActiveStat = useCallback((v: string) => {
    const next = normalizeStat(v, defaultStat);
    setActiveStatState(next);
  }, [defaultStat]);

  const setLineValue = useCallback((v: number | ((prev: number) => number)) => {
    setLineValueState((prev) => {
      const next = typeof v === "function" ? v(prev) : v;
      if (!Number.isFinite(next) || next <= 0) return prev;
      return Number(next);
    });
  }, []);

  const setLastN = useCallback((v: number) => {
    const n = VALID_N.includes(Number(v)) ? Number(v) : defaultN;
    setLastNState(n);
  }, [defaultN]);

  const setActiveScope = useCallback((v: SplitScope) => {
    const next = VALID_SCOPES.includes(v) ? v : defaultScope;
    setActiveScopeState(next);
  }, [defaultScope]);

  const shareUrl = useCallback(async (): Promise<boolean> => {
    try {
      const params = new URLSearchParams();
      params.set("stat", activeStat);
      params.set("line", String(lineValue));
      params.set("n", String(lastN));
      if (activeScope !== "FULL") params.set("scope", activeScope);
      await navigator.clipboard.writeText(`${window.location.origin}${pathname}?${params.toString()}`);
      return true;
    } catch {
      return false;
    }
  }, [activeStat, lineValue, lastN, activeScope, pathname]);

  return {
    activeStat,
    lineValue,
    lastN,
    activeScope,
    hasLineParam,
    setActiveStat,
    setLineValue,
    setLastN,
    setActiveScope,
    shareUrl,
    isPending: false,
  };
}
