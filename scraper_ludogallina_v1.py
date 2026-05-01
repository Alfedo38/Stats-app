import asyncio
import json
import os
import hashlib
from playwright.async_api import async_playwright

# Directorio de salida
FOLDER = "dumps_betano"
if not os.path.exists(FOLDER): os.makedirs(FOLDER)

async def handle_response(response):
    url = response.url.lower()
    # Capturamos el endpoint que trae la base de datos relacional del partido
    if "danae-webapi/api/live/event/" in url or "api/sports/event" in url:
        try:
            if response.status == 200:
                datos = await response.json()
                if "data" in datos:
                    hash_id = hashlib.md5(url.encode()).hexdigest()[:6]
                    nombre = f"{FOLDER}/PARTIDO_{hash_id}.json"
                    with open(nombre, "w", encoding="utf-8") as f:
                        json.dump({"URL": url, "DATOS": datos}, f, indent=4)
                    print(f"   [$$$] Cuotas capturadas: {nombre}")
        except: pass

async def run_ludo(urls):
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False) # Mantenelo visible para evitar bloqueos
        context = await browser.new_context(viewport={'width': 1280, 'height': 800})
        page = await context.new_page()
        page.on("response", handle_response)

        for target_url in urls:
            # Aplicamos el filtro de puntos para limpiar la carga de datos
            final_url = target_url + ("&" if "?" in target_url else "?") + "filter=points"
            
            print(f"[*] Navegando a: {final_url}")
            try:
                await page.goto(final_url, wait_until="domcontentloaded", timeout=60000)
                # ESPERA CRUCIAL: Tiempo para que la API responda y JS renderice
                await asyncio.sleep(7) 
                # Scroll para asegurar que se disparen todos los eventos de carga
                await page.mouse.wheel(0, 1200)
                await asyncio.sleep(3)
            except Exception as e:
                print(f"   [-] Error en {final_url}: {e}")
        
        await browser.close()
        print(f"\n[+] Proceso terminado. Archivos guardados en {FOLDER}/")

if __name__ == "__main__":
    # Links actualizados con IDs reales[cite: 16]
    partidos_nba = [
        "https://www.betano.bet.ar/cuotas-de-partido/atlanta-hawks-new-york-knicks/84210839/",
        "https://www.betano.bet.ar/cuotas-de-partido/philadelphia-76ers-boston-celtics/84210926/",
        "https://www.betano.bet.ar/cuotas-de-partido/minnesota-timberwolves-denver-nuggets/84210845/"
    ]
    asyncio.run(run_ludo(partidos_nba))