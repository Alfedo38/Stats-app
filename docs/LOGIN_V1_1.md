# Login privado v1.1

Actualización sobre v1 ya instalada. No requiere SQL, dependencias nuevas ni
recrear cuentas. Conserva contraseñas y sesiones existentes. El mínimo nuevo
aplica al elegir/cambiar una contraseña, sin obligar a cambiar las actuales.

## Cambios

- Mínimo de 6 caracteres (máximo 128) validado tanto en la pantalla como en el servidor.
- Mostrar/Ocultar en login, contraseña actual, nueva y confirmación. Ocultas por defecto.
- Eliminar cuenta desde el administrador, además de desactivar/habilitar.
- Confirmación escrita del usuario antes de eliminar. El servidor verifica también
  el ID de la cuenta, para no borrar por accidente otra cuenta recreada con el mismo nombre.
- No es posible eliminar al administrador. Los usuarios comunes no pueden eliminar cuentas.
- El borrado retira la cuenta y sus sesiones mediante la relación ya existente.
  No modifica estadísticas NBA/WNBA y no se puede deshacer.
- Copiar datos de acceso temporales; informa si el navegador no permite copiar.
- Presentación: “Estadísticas de jugadores” y “De los pibes para los pibes.”

## Instalar

Con la web detenida, extraé el ZIP y ejecutá el instalador de v1.1:

```bash
python3 /home/alfedo/Descargas/stats-app-login-v1.1/instalar.py --project /home/alfedo/stats-app --apply
cd /home/alfedo/stats-app
npm run dev
```

El instalador comprueba los archivos contra v1 y guarda un respaldo de los
afectados. Si detecta otros cambios, se detiene sin sobrescribirlos.
El script de creación del administrador no forma parte del parche: se conserva
la corrección de importación CommonJS que ya aplicaste en tu computadora.

## Comprobar

1. Abrí `/login` en una ventana de incógnito para ver la presentación nueva.
2. Probá Mostrar/Ocultar: conserva lo escrito y no envía el formulario.
3. En una cuenta de prueba, cambiá la contraseña por una de seis caracteres.
4. Desde el administrador, eliminá esa cuenta escribiendo su nombre exacto.
   Al recargar su ventana, no debe tener acceso. Tu administrador no muestra Eliminar.

Las verificaciones automáticas cubren el mínimo de seis, rechazo de cinco,
borrado autorizado, confirmación incorrecta, ID obsoleto, protección del dueño
y eliminación de sesiones. Se mantienen los 12 diagnósticos anteriores de
TypeScript en componentes de estadísticas, ajenos a estos cambios.
No se hicieron operaciones en tu Supabase real ni un despliegue en Vercel.

## Revertir los archivos

Detené la web y usá `--restore` con la ruta exacta de respaldo que informó el
instalador, igual que en v1. Esto revierte el código; NO recupera cuentas que
hayas eliminado desde el panel.
