# Backup y rollback

La herramienta de esta fase SOLO hace GET de produccion y escribe archivos
locales. No tiene comando apply/restore remoto. Node.js >=20, sin npm install,
cuentas de servicio, claves nuevas ni cambios en `data.js`.

## Captura reproducible

Desde `App Code` (en GitHub los archivos de esa carpeta estan en la raiz):

```bash
node maintenance/snapshot.mjs backup
node maintenance/snapshot.mjs verify .backups/SNAPSHOT
node maintenance/baseline.mjs .backups/SNAPSHOT
```

Reemplazar SNAPSHOT por el directorio que imprime backup. Cada ejecucion crea
una carpeta distinta con permisos privados; no sobrescribe archivos existentes.
El destino esta fijado a `maleducados-leaderboard/(default)/site/leaderboard`.
Si se cambia de proyecto, revisar el codigo; no es una herramienta multiproyecto.

- `document.json`: respuesta REST original completa, incluidos campos ajenos al
  dataset y tipos Firestore. Esta es la fuente autoritativa de restauracion.
- `dataset.json`: preview legible de `fields.data`. Tipos especiales e enteros
  grandes se conservan etiquetados; no usarlo para restaurar ni importarlo en UI.
- `audit.json`: campos, cantidades, rutas faltantes y posibles duplicados.
- `manifest.json`: origen, fecha de captura, updateTime, SHA-256 de archivos y
  de todos los campos. Si falta el manifest, la captura esta incompleta.
- `public-baseline.json`: salida de los calculos reales de app.js sobre esa
  captura, con hash de codigo y resultado. No ejecuta DOM, Auth ni fetch.

Una checksum detecta cambios accidentales, no autentica un archivo frente a
alguien que tambien pueda modificar el manifest. Guardar una segunda copia
privada del directorio y su hash en almacenamiento independiente y protegido.
`.backups/` se ignora en Git y Hosting. `maintenance/**` se excluye de Hosting.
El snapshot contiene los datos y la API key frontend YA existentes: no subirlo
a GitHub ni adjuntarlo en incidencias. No contiene credenciales nuevas.

El GET sin credenciales funciono en esta fase: la lectura es publica y esta
autorizada por las rules desplegadas. No se ha comprobado una sesion autenticada
de escritura. Si devuelve 401/403/404, o falla la red, no hay fallback inventado:
el comando termina con error. El operador debe comprobar proyecto, existencia,
rules, App Check y acceso en Firebase Console antes de reintentar.

## Comparacion despues de cambios

```bash
node maintenance/snapshot.mjs backup
node maintenance/snapshot.mjs compare .backups/ANTES .backups/DESPUES
```

Exit 0: todos los campos de usuario son iguales, preservando arrays y tipos.
Exit 2: hay diferencias; revisar y detener despliegue/migracion. Exit 1: error
de integridad, acceso o uso. updateTime/createTime de sistema no se comparan
como datos de usuario: una restauracion genera nuevos tiempos de sistema.
Los hashes de tablas incluyen participantes, resultados y todas las URLs.

## Restauracion de datos: procedimiento de operador, NO ejecutado

1. Elegir el snapshot objetivo y verificar checksums. Pausar ediciones en todas
   las sesiones/dispositivos. No continuar si hay duda sobre que version recuperar.
2. Hacer una captura nueva del estado a sustituir (GUARDIA), incluso si contiene
   errores, para poder deshacer la restauracion. Guardar ambas copias fuera de
   esta computadora antes de escribir.
3. Crear el plan local y revisar `review.json` y `request.json`:

```bash
node maintenance/snapshot.mjs plan-restore .backups/OBJETIVO .backups/GUARDIA
```

4. Ensayar primero en Firestore Emulator o un proyecto aislado autorizado. Para
   un proyecto aislado hay que adaptar el nombre de documento SOLO en una copia
   del request y usar su updateTime, nunca editar el backup. Validar el mismo
   conjunto de campos despues de leerlo. La prueba de esta fase es local de
   serializacion/precondicion, no una restauracion real de servidor.
5. Para produccion, un operador autenticado y autorizado revisa el plan y obtiene
   aprobacion explicita de la version a reemplazar. Usar el
   [API Explorer de documents.commit](https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.documents/commit)
   con `database = projects/maleducados-leaderboard/databases/(default)` y el
   cuerpo exacto de `request.json`. Revisar los permisos de la cuenta seleccionada
   antes de Execute. El Explorer usa OAuth/IAM; no presume la sesion del editor.
   Alternativamente, un cliente REST autenticado con Firebase ID token aplica
   Security Rules. No copiar tokens a archivos, logs, GitHub o este chat.
6. El request contiene una sola escritura de todos los campos y la precondicion
   `currentDocument.updateTime` de GUARDIA. Si alguien escribio despues, el
   servidor debe rechazarla: volver a capturar y revisar, NUNCA quitar la
   precondicion para forzarla. No hay delete, transform ni updateMask.
7. Verificar respuesta de commit y volver a ejecutar backup + compare contra
   OBJETIVO. Deben coincidir todos los campos de usuario (incluidos `updatedAt`
   y `updatedBy` historicos); updateTime del sistema cambia. Documentar quien
   ejecuto la restauracion en un registro externo, sin alterar el snapshot.
8. Recargar las sesiones del editor antes de reanudar ediciones, para que un
   cliente viejo no sobrescriba la restauracion. Comprobar UI publica y editor.

NO restaurar con "Guardar JSON" del editor: llama recomputeAll y no conserva el
documento original exacto. `firebase deploy --only hosting` tampoco restaura
Firestore. La consola de Firestore no importa este JSON como si fuera un export
administrado. Si se borro el documento, la precondicion updateTime no sirve:
detenerse y preparar un procedimiento de recuperacion especifico, no forzarlo.

Fundamento: [Write y precondiciones](https://firebase.google.com/docs/firestore/reference/rest/v1/Write),
[autenticacion REST y rules/IAM](https://firebase.google.com/docs/firestore/use-rest-api).

## Codigo y Hosting

Antes de futuras fases, crear copia del codigo fuera del arbol publicado:

```bash
tar -czf ../leaderboard-code-before-change.tar.gz --exclude=.backups --exclude=.firebase --exclude=.git --exclude=.DS_Store .
shasum -a 256 ../leaderboard-code-before-change.tar.gz
```

Para revisar rollback, extraer en una carpeta nueva, comparar con la actual y
recuperar solo la version aprobada. No extraer encima de cambios pendientes.
Cuando el propietario sincronice GitHub, versionar tambien firebase.json,
.firebaserc y firestore.rules, crear commit/tag de referencia y comprobar que
el diff no incluye .backups, .firebase ni credenciales.

Firebase Console > Hosting permite revisar el historial de releases y elegir
la version de rollback disponible. Esa disponibilidad no se verifico. Registrar
el release actual antes del siguiente deploy. El service worker v25 usa red
primero; comprobar tambien clientes instalados despues del rollback.

## Lo que requiere Console o un operador autorizado

- Firestore > Rules: el 2026-09-14 se recuperaron las rules activas y coincidieron
  exactamente con `firestore.rules`; la lectura anonima funciono y una escritura
  anonima protegida por una precondicion imposible devolvio 403. Sigue pendiente
  probar otro usuario y el admin en Rules Playground/Emulator, sin escribir en
  el documento real.
- Authentication: verificar proveedor Google, cuenta permitida y dominios.
- Google Cloud > APIs & Services > Credentials: revisar la key de YouTube,
  HTTP referrers autorizados y restriccion a YouTube Data API v3; cuotas y uso.
  No es posible confirmar restricciones mirando la key en JavaScript.
- Firestore reporto cero schedules de backup, PITR desactivado y proteccion de
  borrado desactivada. Revisar si se habilitaran y revisar IAM/exportaciones;
  este JSON no cubre toda la base.
- Este respaldo solo cubre site/leaderboard: no exporta subcolecciones, usuarios
  de Authentication, rules desplegadas, indices, Storage ni otras colecciones.
