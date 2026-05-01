from DrissionPage import ChromiumPage
import json
import os
import time

FOLDER = "dumps_stake_final"
if not os.path.exists(FOLDER): os.makedirs(FOLDER)

def captura_desesperada():
    print("[*] Conectando al puerto 9222...")
    try:
        page = ChromiumPage('127.0.0.1:9222')
    except:
        print("[-] Navegador no detectado. Abrilo con el comando de debug.")
        return

    print("[+] Conectado. Iniciando escucha total de red...")
    # Escuchamos TODO el tráfico que contenga 'graphql' sin filtros previos
    page.listen.start('graphql')

    print("[!] Por favor, hacé clic en las pestañas de 'Puntos', 'Rebotes', etc., manualmente en el Chrome.")
    print("[*] Tenés 20 segundos para interactuar con la página...")
    
    # Le damos 20 segundos para que vos hagas clics y el bot capture los paquetes
    for i in range(20, 0, -1):
        print(f"Capturando... {i}s", end="\r")
        time.sleep(1)

    print("\n[*] Analizando paquetes capturados...")
    peticiones = page.listen.steps()
    
    encontrados = 0
    for res in peticiones:
        try:
            cuerpo = res.response.body
            if cuerpo and isinstance(cuerpo, dict):
                # Guardamos cualquier JSON que parezca tener mercados
                encontrados += 1
                nombre = f"{FOLDER}/paquete_{encontrados}_{int(time.time())}.json"
                with open(nombre, "w", encoding="utf-8") as f:
                    json.dump(cuerpo, f, indent=4)
        except: continue

    print(f"\n[+] Se guardaron {encontrados} archivos en {FOLDER}/")
    print("[?] Si estos archivos están vacíos o no tienen cuotas, Stake nos ganó esta batalla.")

if __name__ == "__main__":
    captura_desesperada()