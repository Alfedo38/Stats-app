# Actualización NBA — 22/09/2026

## Cambios aplicados

- Planteles oficiales 2026-27: 30 equipos y 573 jugadores, con ID NBA,
  dorsal, posición y datos biográficos disponibles.
- Las páginas de jugador/equipo y la búsqueda usan el roster actual; el último
  partido histórico ya no decide el equipo de un jugador.
- La ficha de jugador muestra el headshot NBA, roster actualizado, posición y
  dorsal; los controles de estadísticas y splits se adaptan mejor al ancho.
- `On Fire` usa los últimos cinco partidos y calcula PRA como PTS + REB + AST.
- Radar Social y sus rutas/componentes fueron retirados. El SQL incluido archiva
  la tabla anterior sin borrar sus datos.
- Dependencias fijadas a versiones exactas y build sin Google Fonts remotas.
- TypeScript vuelve a bloquear errores de build; `npm run lint` y `npm run build`
  pasan correctamente.
- Se eliminaron componentes frontend sin referencias y copias duplicadas de los
  scripts de lesiones.

## Operación

1. Configurar las variables del archivo `.env.example`.
2. Ejecutar `npm ci`.
3. Opcional: reflejar el snapshot en PostgreSQL con `npm run rosters:sync`.
4. Validar con `npm run lint && npm run build`.
5. Desplegar.

## Limpieza del paquete entregable

El paquete limpio no contiene secretos `.env`, `node_modules`, `.next`, cachés,
logs, datos crudos generados ni la copia binaria duplicada `modelos_ai_v35`.
Se conserva el código fuente, el modelo canónico `modelos_ai`, los activos del
laboratorio que no son regenerables y la instantánea de rosters.
