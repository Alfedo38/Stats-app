# Verificación del login privado v1

Fecha: 2026-09-16. Trabajo sobre la copia recibida; sin acceder a Supabase real.

## Resultado

16 pruebas automáticas aprobadas: tres de contraseñas/tokens, diez escenarios
de integración más su caso principal, y dos controles de cobertura de rutas.
La integración utilizó PostgreSQL embebido (PGlite) aislado, accedido mediante
Prisma 5.22.0, con el SQL entregado. El adaptador local se configuró sin caché
de sentencias preparadas; no se alteró DATABASE_URL del proyecto del usuario.

Se verificaron contra Next.js 16.1.6 por HTTP:

- Renderizado de login, cuenta, administración y directorio de equipos.
- Redirección de visitantes en páginas privadas.
- Rechazo 401 en los 16 endpoints de datos bajo `/api` sin sesión.
- Rechazo de login y cambios de contraseña desde un Origin externo.
- Cookie HttpOnly y SameSite=Strict en la configuración local HTTP.
- Una contraseña temporal impide acceder a estadísticas o APIs hasta cambiarla.
- El usuario común no puede listar/crear cuentas ni sincronizar lesiones.
- La sincronización de lesiones no admite GET; su POST exige administrador.
- Respuestas de datos autorizadas con `private, no-store`.
- Logout revoca la sesión tanto para páginas como para APIs.

En la integración se verificaron además contraseñas incorrectas, duplicados,
roles no escalables desde el formulario, bloqueo del administrador frente a su
desactivación, restablecimiento, desactivación/reactivación, expiración, máximo
cinco sesiones, límites persistentes de intentos y falta de permisos del esquema
privado para los roles anon/authenticated.

Instalador probado sobre una copia temporal: comprobación sin cambios,
instalación con respaldo, segunda instalación idempotente, rechazo de archivos
modificados, reversión y preservación de `.env`.

## Pendientes ajenos al login

TypeScript reporta 12 diagnósticos en el proyecto original y los mismos 12 tras
los cambios, en estos tres archivos:

- `app/players/[playerId]/page.tsx`: propiedades de una variable inferida como never.
- `components/PlayerChartContainer.tsx`: parámetros con any implícito.
- `components/PlayerPageSkeleton.tsx`: prop style no declarada.

No se afirma que el build global esté libre de errores. No se modificó la
configuración existente `ignoreBuildErrors` ni se instalaron nuevas versiones
de Next/React/Prisma. El informe corresponde a pruebas de desarrollo HTTP y
servicio, no a una prueba de carga ni a una certificación del despliegue productivo.

No se realizó una revisión visual en navegador ni se validaron las credenciales,
RLS deportivas, tareas programadas, dominio o datos de la instalación real.
Las sesiones HTTPS llevan Secure por configuración; debe comprobarse también
en el dominio definitivo al publicar. No se entregan cuentas de prueba activas.
