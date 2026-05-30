# Player Page Active Injury Compact v25

Cambios:

- El bloque Bajas / W-O ahora es desplegable.
- Al estar cerrado muestra solo nombres compactos de bajas activas.
- Al abrir, muestra Activas hoy + Compañeros.
- Compañeros carga todos los jugadores con muestra W/O para el player actual.
- La lista de compañeros se ordena por mayor promedio de minutos (`avg_min DESC`).
- Al seleccionar un compañero recién aparece el detalle W/O.
- Se elimina el botón Ver partidos; queda solo Aplicar W/O.
- El endpoint `/api/wo-teammates` también ordena por `avg_min DESC`.

Instalación:

```bash
cd ~/Descargas
unzip player-page-active-injury-compact-v25.zip -d player-page-active-injury-compact-v25
cp -r player-page-active-injury-compact-v25/* ~/stats-app/
cd ~/stats-app
rm -rf .next
npm run dev
```
