# Player Page v24 — Bajas / W-O compacto

## Cambios

- Convierte el bloque de Bajas activas en un panel compacto.
- Muestra al inicio solo los nombres de bajas activas.
- Al seleccionar una baja, muestra el detalle W/O con PTS/REB/AST/PRA.
- Agrega sección **Compañeros** con buscador para analizar rumores o ausencias no confirmadas.
- Agrega endpoint `/api/wo-teammates` para buscar muestras W/O por compañero.
- Mantiene `Ver partidos` y `Aplicar W/O`.
- Quita el Injury Report viejo de la columna izquierda de la player page para evitar contradicciones.

## Instalación

```bash
cd ~/Descargas
unzip player-page-active-injury-compact-v24.zip -d player-page-active-injury-compact-v24
cp -r player-page-active-injury-compact-v24/* ~/stats-app/
cd ~/stats-app
rm -rf .next
npm run dev
```

## Pruebas rápidas

```txt
/api/wo-teammates?playerId=1628983&q=Jalen
/api/wo-games?playerId=1628983&absentTeammate=Jalen%20Williams
```

En la página de Shai:

- Filtros → Bajas / W-O
- Click en Jalen Williams
- Ver partidos
- Aplicar W/O
- Buscar Chet / Ajay / Dort en Compañeros
