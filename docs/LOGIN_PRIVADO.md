# MoskProps · Acceso privado v1

## Alcance

Usuario y contraseña sin correo ni registro público. Un administrador (el dueño)
crea cuentas de lectura, las desactiva, las elimina y genera contraseñas temporales. Todos los
usuarios, incluido el administrador inicial, deben cambiar su contraseña temporal.
Las contraseñas personales no se pueden consultar: únicamente restablecer.

Se protegen las 13 páginas existentes y los 17 endpoints de datos/lesiones,
además de las nuevas páginas y endpoints de cuentas. Los scripts Python siguen
usando su conexión habitual; no pasan por este login. No se modifican estadísticas,
modelos, cuotas ni procesos de actualización de la etapa 2.

## Instalación local

1. Detené `npm run dev` con Ctrl+C (o detené el servicio web que uses). No hace
   falta detener ni cambiar los procesos Python para instalar este parche.
2. Extraé `stats-app-login-v1.zip` en Descargas. Desde su carpeta ejecutá:

   ```bash
   python3 instalar.py --project /home/alfedo/stats-app --apply
   ```

   Verifica que los archivos a reemplazar coincidan con el paquete original.
   Si detecta cambios tuyos, se detiene antes de copiar nada: no lo fuerces.
   Crea un respaldo de los archivos afectados y registra los archivos nuevos.
   No borra archivos viejos ni copia `.env`.

3. En DBeaver o en el SQL Editor de Supabase, conectado como propietario de la
   base, ejecutá completo `sql/20260916_private_auth.sql` de tu proyecto.
   Crea solamente el esquema `app_private`, sus tres tablas e índices. No lo
   agregues a los esquemas expuestos por la API de Supabase. No uses
   `prisma db push`, `migrate reset` ni una sincronización completa del esquema.
4. Agregá esta línea a tu `.env.local` (conservando las demás variables):

   ```dotenv
   AUTH_ORIGIN=http://localhost:3000
   ```

   `DATABASE_URL` debe seguir apuntando a la misma base, con el usuario servidor
   que sea propietario de las tablas creadas. La contraseña nunca debe llevar
   el prefijo `NEXT_PUBLIC_`. No pegues claves ni contraseñas en el chat.
5. Desde `/home/alfedo/stats-app`, con las dependencias habituales instaladas:

   ```bash
   node scripts/auth-admin.mjs create maxi
   npm run dev
   ```

   El script muestra una contraseña temporal aleatoria UNA VEZ en tu terminal.
   Guardala en privado; no viene ninguna contraseña predeterminada en el parche.
6. Entrá en `http://localhost:3000/login`, usá `maxi` y esa contraseña. Elegí tu
   contraseña personal. Después abrí **Administrar usuarios** en la barra superior.
   Al crear cada cuenta, compartí su contraseña temporal únicamente con esa persona.

No se agregan dependencias de producción ni se cambia package-lock.json. Se usa
Next.js 16.1.6 y Prisma 5.22.0 del proyecto recibido. Si aún no tenés dependencias,
usá `npm ci` con tu lockfile y generá el cliente con `npx prisma generate`.

## Acceso desde otras computadoras

El login no publica la aplicación en Internet por sí solo. Para compartirla hace
falta un dominio/origen HTTPS que llegue a tu servidor. Configurá por ejemplo
`AUTH_ORIGIN=https://tu-dominio.example`, sin rutas ni credenciales, y reiniciá
Next.js. El origen debe coincidir exactamente con el que abren los usuarios.
HTTP está permitido solamente para localhost/127.0.0.1/::1, no para una IP de LAN.
Nunca publiques el servidor de desarrollo como instalación de producción.

Antes de compartir, revisar los permisos/RLS de las tablas deportivas y sus
vistas en Supabase. Este parche restringe las rutas de Next.js y el esquema de
cuentas; no puede certificar ni corregir permisos de tablas remotas que no estaban
incluidos en el paquete. El servidor existente usa claves de servicio/Prisma:
por eso el control de acceso se realiza antes de ejecutar cada endpoint.

## Operación

- Usuario: 3–32 caracteres, letras ASCII, números, punto, guion y guion bajo;
  no distingue mayúsculas/minúsculas. Sin correo.
- Contraseña personal: 6–128 caracteres, admite frases y espacios.
- Botón Mostrar/Ocultar en cada campo de contraseña.
- Eliminar exige escribir el nombre de la cuenta y cierra sus sesiones; no se puede deshacer.
- La contraseña temporal la genera el servidor. El usuario la reemplaza al entrar.
- Desactivar una cuenta cierra inmediatamente sus sesiones. Habilitarla no las restaura.
- Restablecer contraseña cierra sesiones y exige cambiar la nueva temporal.
- No se permite desactivar ni eliminar al único administrador ni crear administradores desde la web.
- Para recuperar tu acceso de administrador desde tu computadora:

  ```bash
  cd /home/alfedo/stats-app
  node scripts/auth-admin.mjs reset maxi
  ```

  Invalida tus sesiones, genera una nueva temporal y reinicia el límite global de
  intentos. El script requiere acceso local a DATABASE_URL; no existe un endpoint
  público de recuperación ni de creación del administrador.

## Sesiones y carga

Cookie HttpOnly, SameSite=Strict, Secure con HTTPS, sin acceso desde JavaScript.
Tokens aleatorios de 256 bits; solo se guarda SHA-256 del token en PostgreSQL.
Sesión absoluta de 12 horas, como máximo cinco sesiones por cuenta. Cerrar sesión,
cambiar contraseña, restablecerla o desactivar la cuenta revoca las sesiones
correspondientes en el servidor.

Una consulta por índice valida cada API; React reutiliza la consulta de sesión
dentro de una misma renderización. No hay escritura de `last_seen` en cada visita,
ni sondeo periódico. La limpieza de sesiones vencidas ocurre al iniciar sesión;
las vencidas nunca autorizan aunque aún no se hayan limpiado.

Contraseñas con scrypt N=32768, r=8, p=3 y sal aleatoria de 128 bits. El cálculo
ocurre en el servidor Node, no en Supabase. Límite persistente de cinco intentos
por cuenta por 15 minutos y 60 intentos totales de login por 15 minutos. Este
último protege recursos y limita las escrituras, pero un ataque podría agotar
el cupo para todos temporalmente; una publicación pública necesitará además
límites en el proxy de entrada. No se confía en una IP enviada por el cliente.

Se mantienen los cachés de datos compartidos en memoria del servidor, detrás
de la autorización. Las respuestas HTTP privadas usan `private, no-store`;
se elimina el caché HTTP público de rutas protegidas. Un usuario no puede borrar
de su memoria información que ya vio: desactivar impide nuevas solicitudes.

## Cambio de compatibilidad

`/injuries/sync` pasa de GET a POST exclusivo de administrador, con comprobación
de Origin. Abrir el enlace ya no dispara escrituras. Si lo llamabas manualmente
o desde un proceso externo, habrá que adaptar ese uso; el script de lesiones
Python no depende de esta ruta. La lógica interna de esa sincronización queda
para la etapa de datos (incluido el borrado previo con `force=1`).

## Validación y límites

- Pruebas de hash, nombres de usuario y tokens: `node --test tests/auth-password.test.mjs`.
- Pruebas de integración en una base PostgreSQL local descartable, nunca tu base:
  aplicar el SQL en esa base, crear roles de prueba `anon` y `authenticated`, y ejecutar:

  ```bash
  AUTH_TEST_DISPOSABLE=yes AUTH_TEST_DATABASE_URL='postgresql://usuario:clave@127.0.0.1:55432/base_de_pruebas' node --test tests/auth-integration.test.mjs
  ```

  Las pruebas insertan cuentas de prueba; usar una base nueva para cada corrida.
- La compilación de tipos global aún señala errores anteriores en
  `app/players/[playerId]/page.tsx`, `PlayerChartContainer.tsx` y
  `PlayerPageSkeleton.tsx`. No se cambió la configuración que los ignora.
- No se consultó ni modificó tu Supabase real. La activación final requiere el
  SQL y la cuenta administradora en tu instalación.
- No se hizo una auditoría integral de seguridad del proyecto heredado.

## Revertir

Con la web detenida, usá el respaldo que informó el instalador:

```bash
python3 instalar.py --project /home/alfedo/stats-app --restore /ruta/exacta/al/respaldo
```

Verifica que los archivos instalados no hayan sido modificados desde entonces.
Restaura los anteriores y retira solamente los archivos nuevos de este parche.
No borra tablas ni usuarios de la base. Quitar el parche vuelve al acceso anterior
sin login: no dejes publicada la web durante la reversión.

## Referencias técnicas

- https://nextjs.org/docs/app/guides/authentication
- https://nextjs.org/docs/app/api-reference/file-conventions/proxy
- https://nodejs.org/api/crypto.html
- https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
