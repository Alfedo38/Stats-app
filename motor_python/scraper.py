#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
scraper_stake_altlines_dom_v3.py

Objetivo:
- Capturar props NBA de Stake desde el DOM.
- Capturar líneas principales y líneas alternativas reales.
- No depende del parser GQL para cuotas.
- Funciona con el método validado manualmente:
  lee el bloque visible: Jugador | Mercado | Línea | Sobre | Debajo.

Modo probe:
    MAX_PARTIDOS = 1
    MAX_JUGADORES = 2

Modo full:
    MAX_PARTIDOS = 1
    MAX_JUGADORES = 2

Requisitos:
    pip install DrissionPage

Chrome:
    chrome --remote-debugging-port=9222 --user-data-dir="$HOME/chrome_debug"
"""

from DrissionPage import ChromiumPage
from datetime import datetime
from pathlib import Path
import csv
import json
import math
import os
import random
import re
import time
import unicodedata
from typing import Optional


# ══════════════════════════════════════════════════════════════
# CONFIG
# ══════════════════════════════════════════════════════════════

DEBUG_PORT = 9222
BASE_URL = "https://stake1017.com"
NBA_URL = f"{BASE_URL}/es/sports/basketball/usa/nba"
OUTPUT_DIR = Path("stake_props")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
(OUTPUT_DIR / "raw").mkdir(parents=True, exist_ok=True)

# Cambiá esto para producción:
MAX_PARTIDOS = 1       # None = todos
MAX_JUGADORES = 2      # None = todos
MAX_MERCADOS_POR_JUGADOR = None

# Cuántas líneas alrededor de la principal intenta.
# Ej: 6 = toma hasta 6 arriba y 6 abajo si existen.
ALT_STEPS_ABAJO = 8
ALT_STEPS_ARRIBA = 8

PAUSA_CARGA = 3.5
PAUSA_TAB = 2.0
PAUSA_JUGADOR = (0.25, 0.55)
PAUSA_CLICK = (0.12, 0.25)
PAUSA_PARTIDO = (3.5, 7.0)

# Para evitar capturar props raros que todavía no usás, podés limitar:
MERCADOS_PERMITIDOS = None
# Ej:
# MERCADOS_PERMITIDOS = {"Puntos", "Rebotes", "Asistencias", "Triples realizados", "Puntos + Rebotes"}

SIGUIENTES_MERCADOS_RE = (
    r"Rebotes|Triples realizados|Triples|Robos|Bloqueos|Tapones|"
    r"Pérdidas(?: de balón)?(?: \(turnovers\))?|Puntos \+ Rebotes|"
    r"Puntos \+ Asistencias|PRA|Asistencias|Asistencias \+ Rebotes|"
    r"Tiros libres|Goles de campo|Faltas"
)

MERCADO_MAP = {
    "Puntos": "Puntos",
    "Rebotes": "Rebotes",
    "Asistencias": "Asistencias",
    "Triples realizados": "Triples",
    "Triples": "Triples",
    "Robos": "Robos",
    "Bloqueos": "Tapones",
    "Tapones": "Tapones",
    "Pérdidas de balón (turnovers)": "Pérdidas",
    "Pérdidas": "Pérdidas",
    "Puntos + Rebotes": "Puntos+Rebotes",
    "Puntos + Asistencias": "Puntos+Asistencias",
    "PRA": "PRA",
    "Asistencias + Rebotes": "Asistencias+Rebotes",
    "Tiros libres": "TirosLibres",
    "Goles de campo": "GolesCampo",
    "Faltas": "Faltas",
}


# ══════════════════════════════════════════════════════════════
# UTILS
# ══════════════════════════════════════════════════════════════

def pausa(rango):
    time.sleep(random.uniform(*rango))


def norm(txt: str) -> str:
    txt = str(txt or "").replace("\xa0", " ")
    txt = unicodedata.normalize("NFKD", txt)
    txt = "".join(c for c in txt if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", txt).strip()


def to_float(x) -> Optional[float]:
    if x is None:
        return None
    try:
        return float(str(x).replace(",", ".").strip())
    except Exception:
        return None


def fmt_line(v) -> str:
    f = to_float(v)
    if f is None:
        return str(v)
    if abs(f - int(f)) < 1e-9:
        return str(int(f))
    return f"{f:.1f}"


def conectar():
    print(f"[*] Conectando a Chrome en puerto {DEBUG_PORT}...")
    page = ChromiumPage(f"127.0.0.1:{DEBUG_PORT}")
    try:
        page.run_js("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
    except Exception:
        pass
    print("[+] Conectado.\n")
    return page


def scroll_suave(page, n=2, dy=450):
    for _ in range(n):
        try:
            page.run_js(f"window.scrollBy({{top:{dy + random.randint(-80, 120)}, behavior:'smooth'}})")
        except Exception:
            pass
        time.sleep(random.uniform(0.35, 0.75))


def leer_texto_pagina(page) -> str:
    try:
        return page.run_js("return document.body.innerText || document.documentElement.innerText || '';") or ""
    except Exception:
        return ""


# ══════════════════════════════════════════════════════════════
# NAVEGACIÓN
# ══════════════════════════════════════════════════════════════

def obtener_partidos(page):
    print(f"[*] Navegando a {NBA_URL}")
    page.get(NBA_URL)
    time.sleep(PAUSA_CARGA)
    scroll_suave(page, 2)

    partidos = []
    vistos = set()

    for el in page.eles("css:a[href*='/sports/basketball/usa/nba/']"):
        href = el.attr("href") or ""
        if not href or href in vistos:
            continue
        slug = href.rstrip("/").split("/")[-1]
        if not re.match(r"^\d+", slug):
            continue
        vistos.add(href)
        pid = re.match(r"^(\d+)", slug).group(1)
        url = href if href.startswith("http") else BASE_URL + href
        nombre = re.sub(r"^\d+-", "", slug).replace("-", " ").title()
        partidos.append({"id": pid, "url": url, "nombre": nombre[:80]})

    partidos = list({p["id"]: p for p in partidos}.values())
    if MAX_PARTIDOS:
        partidos = partidos[:MAX_PARTIDOS]

    print(f"[+] {len(partidos)} partidos NBA encontrados:")
    for p in partidos:
        print(f"    • {p['nombre']} (id: {p['id']})")
    return partidos


def clickear_tab_jugadores(page):
    textos = ["Apuestas al Jugador", "Player Props", "Players", "Jugadores", "Jugador"]
    for texto in textos:
        for sel in [
            f"xpath://button[contains(normalize-space(),'{texto}')]",
            f"xpath://span[contains(normalize-space(),'{texto}')]/ancestor::button",
            f"xpath://a[contains(normalize-space(),'{texto}')]",
            f"xpath://*[@role='tab' and contains(normalize-space(),'{texto}')]",
        ]:
            try:
                el = page.ele(sel, timeout=1)
                if el:
                    try:
                        el.scroll.to_see()
                    except Exception:
                        pass
                    try:
                        page.actions.move_to(el).click()
                    except Exception:
                        el.click()
                    time.sleep(PAUSA_TAB)
                    print("    [✓] Tab de jugadores activado")
                    return True
            except Exception:
                pass

    print("    [!] No encontré tab jugadores; sigo igual")
    return False


# ══════════════════════════════════════════════════════════════
# ACCORDIONS / FILAS
# ══════════════════════════════════════════════════════════════

ACC_SEL = [
    "css:div.secondary-accordion.level-2",
    "css:div[class*='secondary-accordion'][class*='level-2']",
    "xpath://div[contains(@class,'accordion') and contains(@class,'level-2')]",
]

FILA_SEL = [
    "xpath:.//div[contains(@class,'content') and contains(@class,'is-open')]//div[contains(@class,'items-center') and contains(@class,'border-b')]",
    "xpath:.//div[contains(@class,'content')]//div[contains(@class,'flex-wrap') and contains(@class,'items-center')]",
    "xpath:.//div[contains(@class,'content')]//div[./button[@data-testid='fixture-outcome']]",
    "xpath:.//div[.//*[@data-testid='fixture-outcome']]",
]

MERCADO_TXT_SEL = [
    "css:span.ds-body-md-strong",
    "css:span[data-ds-text][class*='ds-body-md']",
    "xpath:.//span[contains(@class,'ds-body-md') and @data-ds-text]",
    "xpath:.//span[contains(@class,'ds-body-md-strong')]",
    "xpath:.//span[string-length(normalize-space())>3 and not(contains(@class,'odds'))]",
]

DROPDOWN_SEL = [
    "xpath:.//button[@aria-label='Open Dropdown']",
    "xpath:.//button[contains(@aria-label,'Dropdown')]",
    "xpath:.//button[contains(@aria-label,'dropdown')]",
    "xpath:.//button[contains(@aria-label,'Desplegable')]",
    "xpath:.//button[contains(@aria-label,'Abrir')]",
    "xpath:.//button[not(@data-testid='fixture-outcome') and .//*[contains(text(),'.') or string-length(normalize-space())<=5]]",
]


def buscar_accordions(page):
    for sel in ACC_SEL:
        try:
            accs = page.eles(sel)
            if accs:
                return accs
        except Exception:
            pass
    return []


def nombre_accordion(acc):
    for sel in [
        "css:div.header span[data-ds-text]",
        "css:div.header span",
        "xpath:.//div[contains(@class,'header')]//span[@data-ds-text]",
        "xpath:.//div[contains(@class,'header')]//span",
    ]:
        try:
            el = acc.ele(sel, timeout=0.2)
            if el and el.text:
                t = norm(el.text)
                if len(t) > 2:
                    m = re.match(r"^(.+?)\s*\((?:C|PF|SF|SG|PG|F|G|C/F|F/C|G/F)\)", t)
                    return m.group(1).strip() if m else t
        except Exception:
            pass
    return ""


def abrir_accordion(page, acc):
    try:
        cls = acc.attr("class") or ""
        if "is-open" in cls:
            return True
    except Exception:
        pass

    for sel in [
        "css:div.header",
        "css:div[class*='header']",
        "xpath:.//div[contains(@class,'header')]",
        "xpath:.//button[contains(@class,'header')]",
    ]:
        try:
            h = acc.ele(sel, timeout=0.2)
            if not h:
                continue
            try:
                acc.scroll.to_see()
            except Exception:
                pass
            time.sleep(0.1)
            try:
                page.actions.move_to(h).click()
            except Exception:
                h.click()
            time.sleep(0.25)
            return True
        except Exception:
            pass
    return False


def filas_de_acc(acc):
    for sel in FILA_SEL:
        try:
            filas = acc.eles(sel)
            if filas:
                return filas
        except Exception:
            pass
    return []


def mercado_de_fila(fila):
    for sel in MERCADO_TXT_SEL:
        try:
            el = fila.ele(sel, timeout=0.15)
            if el and el.text:
                t = norm(el.text)
                if t and not re.match(r"^\d+[.,]?\d*$", t):
                    return t
        except Exception:
            pass
    return ""


def leer_linea_boton(fila):
    for sel in DROPDOWN_SEL:
        try:
            btn = fila.ele(sel, timeout=0.15)
            if btn and btn.text:
                m = re.search(r"\b(\d{1,3}(?:[.,]\d+)?)\b", btn.text)
                if m:
                    return m.group(1).replace(",", ".")
        except Exception:
            pass
    return ""


def buscar_boton_dropdown(fila, linea_actual=""):
    """
    Busca el botón real de línea dentro de la fila.
    Stake no siempre usa aria-label="Open Dropdown"; a veces es solo un
    button/div con texto "26.5" + SVG.
    """
    linea_actual = fmt_line(linea_actual) if linea_actual else ""

    for sel in DROPDOWN_SEL:
        try:
            btn = fila.ele(sel, timeout=0.15)
            if btn:
                return btn
        except Exception:
            pass

    candidatos = []
    try:
        botones = fila.eles("xpath:.//button")
    except Exception:
        botones = []

    for btn in botones:
        try:
            testid = btn.attr("data-testid") or ""
            if testid == "fixture-outcome":
                continue

            txt = norm(btn.text or "")
            m = re.search(r"\b(\d{1,3}(?:[.,]\d+)?)\b", txt)
            if not m:
                continue

            linea_btn = fmt_line(m.group(1))
            if linea_actual and linea_btn == linea_actual:
                return btn

            candidatos.append(btn)
        except Exception:
            continue

    return candidatos[0] if candidatos else None


# ══════════════════════════════════════════════════════════════
# LECTURA VALIDADA POR TEXTO
# ══════════════════════════════════════════════════════════════

def snapshot_visible(page, jugador, mercado):
    texto = leer_texto_pagina(page)
    texto = texto.replace("\xa0", " ")

    idx = texto.lower().find(jugador.lower())
    if idx < 0:
        return None

    bloque = texto[idx:idx + 5000]

    m_mercado = re.search(rf"(?im)^\s*{re.escape(mercado)}\s*$", bloque)
    if not m_mercado:
        return None

    sub = bloque[m_mercado.end():m_mercado.end() + 1000]
    sub = re.split(rf"(?im)^\s*({SIGUIENTES_MERCADOS_RE})\s*$", sub)[0]
    flat = re.sub(r"\s+", " ", sub).strip()

    m = re.search(
        r"(?P<linea>\d{1,3}(?:[.,]\d+)?)\s+Sobre\s+(?P<over>\d+[.,]\d+)\s+Debajo\s+(?P<under>\d+[.,]\d+)",
        flat,
        re.IGNORECASE,
    )
    if not m:
        return None

    return {
        "linea": m.group("linea").replace(",", "."),
        "over": m.group("over").replace(",", "."),
        "under": m.group("under").replace(",", "."),
        "raw": flat[:500],
    }


# ══════════════════════════════════════════════════════════════
# DROPDOWN REAL
# ══════════════════════════════════════════════════════════════

def abrir_dropdown(page, fila, linea_actual=""):
    """
    Abre el dropdown de línea de UNA fila.
    FIX: si no encuentra botón por selector, usa JS y toma el número más a la
    derecha de la fila que no sea cuota de outcome.
    """
    try:
        fila.scroll.to_see()
    except Exception:
        pass
    time.sleep(0.08)

    btn = buscar_boton_dropdown(fila, linea_actual)
    if btn:
        try:
            page.actions.move_to(btn).click()
            time.sleep(0.25)
            return True
        except Exception:
            try:
                btn.click()
                time.sleep(0.25)
                return True
            except Exception:
                pass

    js = r"""
        const fila = arguments[0];
        const wantedRaw = String(arguments[1] || '').replace(',', '.').trim();

        function clean(t) {
            return String(t || '')
                .replace(/\u00a0/g, ' ')
                .replace(/[↑↓▲▼▾▴⌄⌃]/g, '')
                .trim();
        }

        function numericText(el) {
            const txt = clean(el.innerText || el.textContent || '');
            const m = txt.match(/\b(\d{1,3}(?:[.,]\d+)?)\b/);
            if (!m) return '';
            return m[1].replace(',', '.');
        }

        function visible(el) {
            const r = el.getBoundingClientRect();
            const cs = window.getComputedStyle(el);
            return r.width >= 8 && r.height >= 8 &&
                   r.bottom > 0 && r.top < window.innerHeight &&
                   r.right > 0 && r.left < window.innerWidth &&
                   cs.visibility !== 'hidden' && cs.display !== 'none';
        }

        function isOutcome(el) {
            return !!el.closest('button[data-testid="fixture-outcome"], [data-testid="fixture-outcome"]');
        }

        const nodes = Array.from(fila.querySelectorAll('button, [role="button"], div, span'));
        const candidates = [];

        for (const el of nodes) {
            if (!visible(el) || isOutcome(el)) continue;

            const num = numericText(el);
            if (!num) continue;

            const r = el.getBoundingClientRect();
            const exact = wantedRaw && (String(parseFloat(num)) === String(parseFloat(wantedRaw)));

            candidates.push({ el, num, exact, left: r.left });
        }

        if (!candidates.length) return false;

        candidates.sort((a, b) => {
            if (a.exact !== b.exact) return a.exact ? -1 : 1;
            return b.left - a.left;
        });

        const targetEl = candidates[0].el.closest('button, [role="button"]') || candidates[0].el;
        const r = targetEl.getBoundingClientRect();
        const x = r.left + r.width / 2;
        const y = r.top + r.height / 2;

        targetEl.dispatchEvent(new PointerEvent('pointerdown', {bubbles:true, clientX:x, clientY:y}));
        targetEl.dispatchEvent(new MouseEvent('mousedown', {bubbles:true, clientX:x, clientY:y}));
        targetEl.dispatchEvent(new MouseEvent('mouseup', {bubbles:true, clientX:x, clientY:y}));
        targetEl.dispatchEvent(new MouseEvent('click', {bubbles:true, clientX:x, clientY:y}));
        return true;
    """

    try:
        ok = page.run_js(js, fila, str(linea_actual or ""))
        time.sleep(0.25)
        return bool(ok)
    except Exception:
        return False


def opciones_visibles_dropdown(page, fila, linea_principal):
    """
    Lee SOLO opciones visibles del dropdown abierto para esta fila.
    Usa la X del selector de línea como ancla para no mezclar últimos 5,
    otras stats ni cuotas Over/Under.
    """
    lp = to_float(linea_principal)
    if lp is None:
        return []

    js = r"""
        const fila = arguments[0];
        const principalRaw = String(arguments[1] || '').replace(',', '.').trim();
        const principal = parseFloat(principalRaw);

        function clean(t) {
            return String(t || '')
                .replace(/\u00a0/g, ' ')
                .replace(/[↑↓▲▼▾▴⌄⌃]/g, '')
                .trim();
        }

        function visible(el) {
            const r = el.getBoundingClientRect();
            const cs = window.getComputedStyle(el);
            return r.width >= 6 && r.height >= 6 &&
                   r.bottom > 0 && r.top < window.innerHeight &&
                   r.right > 0 && r.left < window.innerWidth &&
                   cs.visibility !== 'hidden' && cs.display !== 'none';
        }

        function numOf(el) {
            const txt = clean(el.innerText || el.textContent || '');
            if (!/^\d{1,3}(?:[.,]\d+)?$/.test(txt)) return null;
            return txt.replace(',', '.');
        }

        function isOutcome(el) {
            return !!el.closest('button[data-testid="fixture-outcome"], [data-testid="fixture-outcome"]');
        }

        let anchors = [];
        for (const el of Array.from(fila.querySelectorAll('*'))) {
            if (!visible(el) || isOutcome(el)) continue;
            const raw = clean(el.innerText || el.textContent || '');
            const m = raw.match(/\b(\d{1,3}(?:[.,]\d+)?)\b/);
            if (!m) continue;
            const n = parseFloat(m[1].replace(',', '.'));
            const r = el.getBoundingClientRect();
            const exact = Math.abs(n - principal) < 0.001;
            anchors.push({el, exact, left:r.left, cx:r.left + r.width/2, cy:r.top + r.height/2});
        }

        if (!anchors.length) return '[]';

        anchors.sort((a,b) => {
            if (a.exact !== b.exact) return a.exact ? -1 : 1;
            return b.left - a.left;
        });

        const ax = anchors[0].cx;
        const ay = anchors[0].cy;

        const out = [];
        for (const el of Array.from(document.querySelectorAll('*'))) {
            if (!visible(el) || isOutcome(el)) continue;

            const num = numOf(el);
            if (num === null) continue;

            const val = parseFloat(num);
            if (!Number.isFinite(val)) continue;

            const r = el.getBoundingClientRect();
            const cx = r.left + r.width / 2;
            const cy = r.top + r.height / 2;

            if (Math.abs(cx - ax) > 120) continue;
            if (Math.abs(cy - ay) > 700) continue;
            if (Math.abs(val - principal) > Math.max(12, principal * 0.55)) continue;

            out.push({
                text: String(val % 1 === 0 ? val.toFixed(0) : val.toFixed(1)),
                x: cx,
                y: cy
            });
        }

        return JSON.stringify(out);
    """

    try:
        data = json.loads(page.run_js(js, fila, str(linea_principal)) or "[]")
    except Exception:
        data = []

    vistos = {}
    for item in data:
        v = to_float(item.get("text"))
        if v is None:
            continue
        key = fmt_line(v)
        if key not in vistos:
            vistos[key] = {
                "linea": key,
                "x": float(item.get("x", 0)),
                "y": float(item.get("y", 0)),
            }

    vals = list(vistos.values())
    vals.sort(key=lambda d: to_float(d["linea"]) or 9999)
    return vals


def click_coord(page, x, y):
    try:
        page.actions.move_to_location(int(x), int(y)).click()
        return True
    except Exception:
        try:
            page.run_js("""
                const x = arguments[0], y = arguments[1];
                const el = document.elementFromPoint(x, y);
                if (!el) return false;
                el.dispatchEvent(new PointerEvent('pointerdown', {bubbles:true, clientX:x, clientY:y}));
                el.dispatchEvent(new MouseEvent('mousedown', {bubbles:true, clientX:x, clientY:y}));
                el.dispatchEvent(new MouseEvent('mouseup', {bubbles:true, clientX:x, clientY:y}));
                el.dispatchEvent(new MouseEvent('click', {bubbles:true, clientX:x, clientY:y}));
                return true;
            """, int(x), int(y))
            return True
        except Exception:
            return False


def seleccionar_linea(page, fila, linea_target, jugador, mercado, linea_actual):
    """
    Abre dropdown y selecciona una línea exacta por coordenada visible.
    Luego valida con snapshot_visible().
    """
    if not abrir_dropdown(page, fila, linea_actual):
        return None

    opciones = opciones_visibles_dropdown(page, fila, linea_actual)
    target = fmt_line(linea_target)

    cand = None
    for op in opciones:
        if fmt_line(op["linea"]) == target:
            cand = op
            break

    if not cand:
        # cerrar dropdown
        try:
            page.actions.move_to_location(20, 20).click()
        except Exception:
            pass
        return None

    ok = click_coord(page, cand["x"], cand["y"])
    time.sleep(random.uniform(0.20, 0.40))

    if not ok:
        return None

    # validar lectura; repetir poco, sin colgar
    for _ in range(5):
        snap = snapshot_visible(page, jugador, mercado)
        if snap and fmt_line(snap["linea"]) == target:
            return snap
        time.sleep(0.12)

    return None


def orden_altlines(opciones, principal):
    lp = to_float(principal)
    if lp is None:
        return []

    vals = []
    for op in opciones:
        v = to_float(op["linea"])
        if v is None:
            continue
        if abs(v - lp) < 1e-9:
            continue
        vals.append(v)

    abajo = sorted([v for v in vals if v < lp], reverse=True)[:ALT_STEPS_ABAJO]
    arriba = sorted([v for v in vals if v > lp])[:ALT_STEPS_ARRIBA]

    # alterna cerca: 25.5, 27.5, 24.5, 28.5...
    out = []
    for i in range(max(len(abajo), len(arriba))):
        if i < len(abajo):
            out.append(abajo[i])
        if i < len(arriba):
            out.append(arriba[i])
    return [fmt_line(v) for v in out]


# ══════════════════════════════════════════════════════════════
# SCRAPING
# ══════════════════════════════════════════════════════════════

def agregar_registro(regs, partido, fecha, jugador, mercado, snap, fuente):
    mercado_norm = MERCADO_MAP.get(mercado, mercado)
    linea = fmt_line(snap["linea"])
    regs.append({
        "partido": partido,
        "jugador": jugador,
        "mercado": mercado_norm,
        "linea": linea,
        "tipo": "Sobre",
        "cuota": snap["over"],
        "fuente": fuente,
        "fecha": fecha,
    })
    regs.append({
        "partido": partido,
        "jugador": jugador,
        "mercado": mercado_norm,
        "linea": linea,
        "tipo": "Debajo",
        "cuota": snap["under"],
        "fuente": fuente,
        "fecha": fecha,
    })


def dedup(regs):
    out = []
    seen = set()
    for r in regs:
        key = (
            r.get("partido"), r.get("jugador"), r.get("mercado"),
            fmt_line(r.get("linea")), r.get("tipo"), r.get("cuota")
        )
        if key in seen:
            continue
        seen.add(key)
        out.append(r)
    return out


def extraer_fecha(page):
    try:
        html = page.html
        m = re.search(r"(\d{4}-\d{2}-\d{2})", html)
        if m:
            return m.group(1)
    except Exception:
        pass
    return datetime.now().strftime("%Y-%m-%d")


def capturar_partido(page, partido):
    print(f"\n{'─'*60}")
    print(f"[→] {partido['nombre']}")
    print(f"    {partido['url']}")

    page.get(partido["url"])
    time.sleep(PAUSA_CARGA)
    clickear_tab_jugadores(page)
    scroll_suave(page, 2)

    fecha = extraer_fecha(page)
    nombre_partido = partido["nombre"]

    regs = []
    accs = buscar_accordions(page)
    print(f"    [·] {len(accs)} accordions encontrados")

    jugador_count = 0

    for acc in accs:
        abrir_accordion(page, acc)
        jugador = nombre_accordion(acc)
        if not jugador:
            continue

        jugador_count += 1
        if MAX_JUGADORES and jugador_count > MAX_JUGADORES:
            print(f"       [modo prueba] límite jugadores: {MAX_JUGADORES}")
            break

        print(f"       [jugador] {jugador}", flush=True)

        filas = filas_de_acc(acc)
        mercado_count = 0
        jugador_regs_ini = len(regs)

        for fila in filas:
            mercado = mercado_de_fila(fila)
            if not mercado:
                continue

            if MERCADOS_PERMITIDOS and mercado not in MERCADOS_PERMITIDOS:
                continue

            if mercado not in MERCADO_MAP:
                # Mercado visible no mapeado, se puede sumar después.
                continue

            mercado_count += 1
            if MAX_MERCADOS_POR_JUGADOR and mercado_count > MAX_MERCADOS_POR_JUGADOR:
                break

            snap_main = snapshot_visible(page, jugador, mercado)
            if not snap_main:
                continue

            linea_principal = fmt_line(snap_main["linea"])
            agregar_registro(regs, nombre_partido, fecha, jugador, mercado, snap_main, "dom_main")

            # abrir dropdown una vez para listar opciones
            if not abrir_dropdown(page, fila, linea_principal):
                print(f"          [main only] {mercado} {linea_principal} sin dropdown")
                continue

            opciones = opciones_visibles_dropdown(page, fila, linea_principal)

            # cerrar antes de empezar clicks individuales
            try:
                page.actions.move_to_location(20, 20).click()
            except Exception:
                pass
            time.sleep(0.1)

            if len(opciones) <= 1:
                print(f"          [main only] {mercado} {linea_principal} sin alt visibles")
                continue

            targets = orden_altlines(opciones, linea_principal)
            print(f"          [alt] {mercado}: principal={linea_principal} targets={targets}", flush=True)

            # En cada target, se parte de la línea actual visible.
            for target in targets:
                snap_actual = snapshot_visible(page, jugador, mercado)
                linea_actual = fmt_line(snap_actual["linea"]) if snap_actual else linea_principal

                snap_alt = seleccionar_linea(page, fila, target, jugador, mercado, linea_actual)
                if not snap_alt:
                    print(f"             [skip] {mercado} {target} no confirmado")
                    continue

                agregar_registro(regs, nombre_partido, fecha, jugador, mercado, snap_alt, "dom_alt")
                print(
                    f"             [ok] {mercado} {snap_alt['linea']} "
                    f"O={snap_alt['over']} U={snap_alt['under']}",
                    flush=True,
                )

            # devolver a principal si se puede, para no contaminar la siguiente lectura
            seleccionar_linea(page, fila, linea_principal, jugador, mercado, fmt_line(snapshot_visible(page, jugador, mercado)["linea"]))

        jugador_regs = len(regs) - jugador_regs_ini
        print(f"       {jugador:<30} → {jugador_regs} cuotas")

        pausa(PAUSA_JUGADOR)

    regs = dedup(regs)
    print(f"    [✓] Total único partido: {len(regs)} cuotas")
    return regs


def guardar(regs):
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    json_path = OUTPUT_DIR / f"props_nba_{ts}.json"
    csv_path = OUTPUT_DIR / f"props_nba_{ts}.csv"

    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(regs, f, ensure_ascii=False, indent=2)

    campos = ["partido", "jugador", "mercado", "linea", "tipo", "cuota", "fuente", "fecha"]
    with open(csv_path, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=campos)
        w.writeheader()
        for r in regs:
            w.writerow({k: r.get(k, "") for k in campos})

    print("\n" + "═" * 60)
    print(f"[✓] {len(regs)} cuotas guardadas")
    print(f"    JSON → {json_path}")
    print(f"    CSV  → {csv_path}")

    # Resumen
    resumen = {}
    for r in regs:
        if r["tipo"] == "Sobre":
            resumen[r["mercado"]] = resumen.get(r["mercado"], 0) + 1
    print("\n  Por mercado/línea:")
    for k, v in sorted(resumen.items(), key=lambda x: x[1], reverse=True):
        print(f"    {v:5d}  {k}")

    print("\nPrimeras filas:")
    for r in regs[:20]:
        print(
            f"{r['partido'][:26]:<26} {r['jugador'][:22]:<22} "
            f"{r['mercado'][:18]:<18} {r['linea']:>5} {r['tipo']:<6} {r['cuota']}"
        )


def main():
    page = conectar()
    partidos = obtener_partidos(page)
    todos = []

    for i, partido in enumerate(partidos, 1):
        regs = capturar_partido(page, partido)
        todos.extend(regs)
        if i < len(partidos):
            pausa(PAUSA_PARTIDO)

    todos = dedup(todos)
    guardar(todos)


if __name__ == "__main__":
    main()