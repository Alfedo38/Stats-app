# Player page DVP fix v17

Corrige el panel "Defensa vs posición".

## Causa

`public.team_dvp` no tiene `team_abbreviation`; usa `team`.
Además, la tabla agrupa posiciones como `G`, `F`, `C`, `G-F`, `F-C`, pero la página enviaba `PG`, `SG`, etc.

## Cambios

- `app/api/dvp/route.ts`: consulta `public.team_dvp.team` y mapea PG/SG → G, SF/PF → F, C → C.
- `components/DvpPanel.tsx`: muestra cards compactas PTS/REB/AST/3PM vs promedio de liga.

## Instalación

```bash
cd ~/Descargas
unzip player-page-dvp-fix-v17.zip -d player-page-dvp-fix-v17
cp -r player-page-dvp-fix-v17/* ~/stats-app/
cd ~/stats-app
rm -rf .next
npm run dev
```
