"use client";

import { useCallback, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const hasLineParam = searchParams.has("line");

  const activeStat = normalizeStat(searchParams.get("stat"), defaultStat);
  const lineValue = parseLine(searchParams.get("line"), defaultLine);
  const lastN = parseN(searchParams.get("n"), defaultN);
  const activeScope = parseScope(searchParams.get("scope"), defaultScope);

  const updateParams = useCallback(
    (
      updates: Partial<
        Record<"stat" | "line" | "n" | "scope", string | null | undefined>
      >
    ) => {
      const params = new URLSearchParams(searchParams.toString());

      for (const [key, val] of Object.entries(updates)) {
        if (val === null || val === undefined || val === "") {
          params.delete(key);
        } else {
          params.set(key, val);
        }
      }

      const query = params.toString();
      const nextUrl = query ? `${pathname}?${query}` : pathname;

      startTransition(() => {
        router.replace(nextUrl, { scroll: false });
      });
    },
    [router, pathname, searchParams]
  );

  const setActiveStat = useCallback(
    (v: string) => {
      updateParams({ stat: normalizeStat(v, defaultStat), line: null });
    },
    [updateParams, defaultStat]
  );

  const setLineValue = useCallback(
    (v: number | ((prev: number) => number)) => {
      const next = typeof v === "function" ? v(lineValue) : v;
      if (!Number.isFinite(next) || next <= 0) return;
      updateParams({ line: String(next) });
    },
    [updateParams, lineValue]
  );

  const setLastN = useCallback(
    (v: number) => {
      updateParams({ n: String(v) });
    },
    [updateParams]
  );

  const setActiveScope = useCallback(
    (v: SplitScope) => {
      updateParams({ scope: v, line: null });
    },
    [updateParams]
  );

  const shareUrl = useCallback(async (): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      return true;
    } catch {
      return false;
    }
  }, []);

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
    isPending,
  };
}
