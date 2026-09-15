# Fase 1: auditoria, respaldo y preparacion

Fecha: 2026-09-14. Estado: **READY** para iniciar Prompt 2 como modelo derivado
de solo lectura desde mesas, con snapshot y baseline obligatorios. El proyecto
sigue **NOT READY para migraciones o nuevas escrituras en produccion** hasta
validar restauracion/editor en un entorno aislado y corregir los P1 de guardado.

## Alcance y version

Por confirmacion del propietario, la base es `App Code` en su computadora;
publica desde ahi a Firebase y posteriormente sincroniza GitHub.
No existe `.git` en esta carpeta ni en su padre. Se consulto y clono en una
carpeta temporal `HRadillo/maleducados-leaderboard`, rama `main`, commit
`ba95d77103c40c6b7300536e1191bb07b5be757a` (2026-05-13).
GitHub es anterior: difieren app.js, admin.js, index.html, styles.css y
service-worker.js; faltan firebase.json, .firebaserc, firestore.rules y 404.html.
No se sobrescribio, sincronizo, inicializo Git, publico ni hizo push.

Se leyeron completos los JS de aplicacion, HTML, CSS, datos base, README,
configuraciones, rules, manifest y service worker locales, y se contrasto el
arbol remoto y los cambios relevantes. Assets son imagenes de marca; las
carpetas Brand Assets/Channel Brief del padre no forman parte de Hosting.
No hay package.json, build, lint, typecheck, tests previos, CI, scripts previos
de backup ni automatizacion de deploy en ninguno de los dos arboles.
El README solo documentaba `firebase deploy --only hosting`.

La descarga HTTP de los siete archivos publicos principales dio 200 y
coincidencia byte por byte con los locales: app.js, admin.js, index.html,
styles.css, service-worker.js, data.js y firebase-config.js.
Hosting usa `public: "."`; routing por anchors/hash, sin router ni backend propio.
Firebase SDK 10.12.5 se importa desde CDN. Service worker v25 usa red primero
para recursos locales y no cachea Firestore, Scryfall o YouTube entre origenes.

## Respaldo y estado observado

Lectura REST anonima autorizada, sin tokens ni API keys en la peticion:

- Captura inicial: `.backups/snapshot-2026-09-14T19-26-26-389Z-04fb8ab9`.
- Captura final: `.backups/snapshot-2026-09-14T19-34-18-458Z-11eb395d`.
- Ambas tienen updateTime `2026-09-10T19:32:00.981853Z`.
- Hash de TODOS los campos de usuario:
  `159f86361ed470deeac8b8fd68afbba9e66fe8cceeb1bb631916eecbe3fe8a57`.
- **39 mesas, 156 participaciones, 41 registros de jugadores, 155 decks persistidos**.
- Comparacion inicial/final: campos, dataset, mesas y jugadores identicos,
  incluidos resultados, URLs, aliases, imagenes y metadata. Cero escrituras.
- Codigo anterior a esta fase: `.backups/code-before-phase1-20260914.tar.gz`,
  SHA-256 `714fddba8b162be68afe8a18a319d3e54c5ad0138f3487be00bf77484fc746d4`.
  Extraido a otra carpeta y comparado sin diferencias (excluyendo cache/DS_Store).

La captura no es una exportacion de todo Firebase. Alcance y limitaciones:
[BACKUP.md](BACKUP.md). Estructura exacta, dependencias y contratos:
[DATA-MODEL.md](DATA-MODEL.md).

## Riesgos

P0 = incidente critico confirmado; P1 = riesgo alto de integridad/seguridad;
P2 = deuda o inconsistencia que exige precaucion. **No se confirmo un P0**;
esto no certifica la configuracion remota que no se pudo inspeccionar.

| Nivel | Evidencia local | Riesgo y criterio para siguiente fase |
| --- | --- | --- |
| P1 | admin.js:1132, saveData | setDoc sustituye el documento sin revision/transaccion. Dos sesiones pueden perder cambios; fallo de carga puede dejar una base vieja editable. La UI cambia antes del await; un rechazo deja un estado local no confirmado. |
| P1 | admin.js:920, 954, 1590 | playerDirectory suma decks guardados y resultados de mesas; savePlayer vuelve a agregar los guardados. Fixture de 1 W produce 2 W en directorio y 3 W al combinar. Repetir guardado acumula. No usar merge de jugadores hasta corregirlo y validar por mesa. |
| P1 | admin.js:1544, 1531, 932, 1634 | nextTable reconstruye solo campos conocidos; el guardado sustituye commanders; fusion toma un basePlayer y campos limitados de decks. Puede perder metadata extra, aliases de otras fuentes o normalizar historicos. Preservacion estructural debe probarse antes de reutilizar estas rutas. |
| P1 | admin.js:239, 256, 1524 | Fallo Scryfall de red pierde name; el guardado puede enviar undefined (rechazo) o sustituir cartas verificadas por metadatos vacios. Exito parcial puede reducir colores. No permitir que enriquecimiento fallido reescriba historia. |
| P1 | admin.js:397, 667; app.js:172, 191 | Se elimina + Folk Hero al importar; hidratar legacy A & B puede formar A & B & B. // se interpreta como pareja aun si representa caras de una carta. Necesita representacion derivada trazable, no limpieza in-place. |
| P1 | app.js:1008, 1082; admin.js:895, 700 | Algunos nombres/titulos/tags y URLs se interpolan en innerHTML sin escape/validacion de protocolo. Riesgo de HTML/XSS persistente si llega contenido malicioso desde JSON/importaciones. No se ejecuto un exploit; no hay evidencia de ataque actual. |
| P2 | app.js:435, 613; admin.js:463, 907 | Canonicalizacion distinta entre editor/publico; aliases no resuelven identidad publica. Slugs pueden colisionar y metadata elegir el primer registro. No fusionar por semejanza. |
| P2 | app.js:454, 574, 705; admin.js:562, 625, 1117 | Empates no entran en WR/metajuego, pero si en appearances publicas; acumulados borran decks 0-0. isTie legacy no hidrata resultado del formulario. UI de ganadores solo admite dos. |
| P2 | app.js:238, 246; admin.js:555 | Colores desconocidos tratados como C, hints manuales limitados y Moxfield vacio tratado distinto entre lectura y editor. URLs equivalentes y orden de partners separan grupos. |
| P2 | app.js:1174; admin.js:1150, 1180 | Dos lecturas independientes, sin realtime; fallback viejo y estado mezclado con config previa. Datos visuales o JSON del editor no sustituyen una captura cruda de servidor. |
| P2 | firebase.json, firestore.rules, data.js:6 | Key de YouTube visible, restricciones desconocidas. Rules locales presentes pero no en main; release/rules/auth remotos y backups administrados sin verificar. Sin CI previo ni baseline versionado. |

Los numeros persistidos ya divergen: 12 registros coincidentes por nombre tienen
W/L distintos de los derivados publicos. Ejemplos: Alan V. 30/79 vs 10/27;
Horacio R. 55/198 vs 7/32; Daniel E. 0/124 vs 0/4. La ruta de doble conteo
esta reproducida; no se atribuye automaticamente todo delta a una sola causa.
No se corrigio ningun acumulado ni se trato como historico inventado/eliminable.

## Calidad de datos

- Sin IDs repetidos de mesa, jugador o participante dentro de una mesa, ni
  triples exactos titulo/fecha/URL repetidos. No prueba ausencia de duplicados
  semanticos, mismos videos en formatos URL distintos o historial faltante.
- 32 mesas single, una two y seis legacy; cero empates en esta captura.
  Todos los ganadores apuntan a participantes existentes. Todas las mesas
  tienen titulo, fecha y URL de video, y participantes con ID/nombre/comandante.
- 17 participaciones sin Moxfield, 23 sin handle; seis sin imagen/cardUrl y
  siete con colors vacio. Esto ultimo significa desconocido O incoloro, no error
  probado. No se consultaron todas las cartas ni URLs para corregir estos casos.
- 14 entradas del directorio sin handle. Cuatro registros de nombre con tag
  incrustado no aparecen textualmente en mesas y tienen cero decks/resultados:
  Horacio R. (@hradillo), Alan V. (@alan.vica), Uriel R. (@huriel19),
  Chris R. (@critical.cris). Son candidatos a revision, NO bajas autorizadas.
- Hay Oscar Z. y Oscar con acento (Óscar Z.) en mesas; ambos colisionan en el
  slug publico oscar-z. No se decidio si esa unificacion es correcta.
- Los campos aliases existentes permanecen intactos. La fecha de cabecera
  lastUpdated es 2026-05-08 aunque el documento se actualizo en septiembre.
  Es metadata manual desactualizada, no evidencia de cache corrupta.
- Modelo publico actual: 36 jugadores, 148 decks agrupados; 40 W, 116 L y
  156 appearances. Snapshot del modelo generado con el app.js real:
  `public-baseline.json` dentro de la captura inicial, hash de resultado
  `2f91e5b70253feb3d33d5f7073355c8d5d88ba35606c6fb3ed256a213c448387`.

## Seguridad comprobada y pendiente

Las rules LOCALES permiten read publico de site/leaderboard; write exige auth
y email exactamente losmaleducadosdelmagic@gmail.com; el resto se deniega.
El frontend oculta el editor con chequeo de email, pero eso no es la barrera
de seguridad. Las peticiones cliente se autorizan en Firestore Security Rules.
La lectura publica se comprobo; la denegacion de escritura remota no se probo
escribiendo en vivo y no se obtuvo la rules release activa. Un firestore.rules
servido como archivo web tampoco demostraria que esas reglas estan desplegadas.
Operaciones administrativas con OAuth/IAM siguen permisos de IAM.

No se puede confirmar ninguna restriccion de la YouTube key en este arbol.
Verificar manualmente HTTP referrers, API permitida y cuotas en Google Cloud
Console. La key Firebase de firebase-config.js no equivale a una credencial de
administrador; no se agregaron secretos ni se extrajeron tokens existentes.

## Cambios minimos realizados

| Archivo | Motivo |
| --- | --- |
| maintenance/snapshot.mjs | GET crudo, backup privado, checksums, inventario, comparacion y plan local de rollback con precondicion |
| maintenance/baseline.mjs | Ejecutar calculos actuales en VM aislada sobre una copia y guardar referencia |
| maintenance/checks.test.mjs | Seis pruebas focalizadas sin dependencias; integridad, no sobrescritura y casos actuales peligrosos |
| maintenance/preflight.mjs | Detener Prompt 2 si cambiaron produccion, app.js o resultados derivados frente al baseline aprobado |
| maintenance/AUDIT.md | Evidencias, riesgos y decision de preparacion |
| maintenance/DATA-MODEL.md | Modelo y contratos de preservacion |
| maintenance/BACKUP.md | Procedimiento reproducible y acciones manuales |
| .gitignore | Excluir .backups y .firebase |
| firebase.json | Excluir maintenance/** de Hosting; sin cambiar public, rules o rutas |
| README.md | Enlazar mantenimiento y comandos |

Sin cambios en app.js, admin.js, data.js, estilos, HTML, Auth, reglas, assets,
service worker o esquema. Los backups generados no son archivos para commit.

## Validacion ejecutada

- `node --test maintenance/checks.test.mjs`: 6/6 OK. Un primer intento detecto
  un stub de DOM incompleto; corregido solo en el test y repetido con exito.
- `node --check` en app.js, admin.js, data.js, firebase-config.js,
  service-worker.js y los tres .mjs nuevos: OK.
- Parse JSON de firebase.json, .firebaserc y manifest; existencia de referencias
  estaticas locales del HTML: OK.
- `node maintenance/snapshot.mjs backup`: dos lecturas reales OK. Primer intento
  sin permiso de red fallo sin inventar captura; lectura permitida posterior OK.
- `verify`/`compare`: checksums correctas y todos los campos iguales antes/despues.
- `node maintenance/baseline.mjs CAPTURA`: OK, modelo sin modificar la fuente.
- `plan-restore CAPTURA CAPTURA`: plan local sin cambio, no se envio. Fixture
  prueba tipos Firestore, campo desconocido, int64, corrupcion y version guardia.
- `tar` extraccion aislada + `diff -qr`: rollback de codigo reproducido sin deltas.
- `git check-ignore --no-index` usando metadata Git temporal y el arbol local:
  .backups/.firebase excluidos. No se inicializo Git local.
- `diff -qr` y diff textual contra copia previa: solo los archivos listados;
  el nucleo publico/editor y configuracion de acceso siguen identicos.
- Navegador sobre produccion: carga 39 mesas, ranking/top, abre perfil con tag,
  filtro Horacio muestra 7 W/32 L/18%; boton Google disponible y editor cerrado.
  Se registro un warning de red de YouTube en una carga; el contador tambien
  llego a mostrar 1600. No se atribuye a restricciones de la key sin evidencia.
- CLI autenticada como hradillo7@gmail.com: proyecto ACTIVE y correcto. Rules
  activas recuperadas con la herramienta oficial: coinciden exactamente con
  firestore.rules y la validacion devuelve cero errores. Una escritura anonima
  con precondicion imposible devolvio 403 y no pudo modificar el documento.
- Firestore: Standard/free tier, PITR desactivado, proteccion de borrado
  desactivada y sin schedules de backup. Hosting live conserva el release
  FINALIZED del 2026-07-03, desplegado por hradillo7@gmail.com.
- YouTube key: peticion sin referrer 403, desde example.com 403 y desde el
  dominio publico 200. La restriccion efectiva por referrer funciona; la lista
  exacta de APIs permitidas todavia requiere Google Cloud Console.
- Identity Toolkit respondio 200 y genero sesion de autenticacion; esto prueba
  que el servicio responde, no que se completo Google Sign-In del admin.
- No se hizo login ni guardado real, prueba completa mobile, prueba de rules
  remotas, deploy o restauracion real de Firestore. No hay build/lint/typecheck
  del proyecto para ejecutar. VM no sustituye navegador ni Emulator.

## Limite de Prompt 2

1. Prompt 2 puede crear y probar un modelo derivado separado, consumiendo mesas
   de una copia en memoria. No puede llamar setDoc, recomputeAll, savePlayer,
   cambiar schemas de Firestore ni normalizar registros fuente.
2. Antes de cada bloque, tomar snapshot fresco y ejecutar preflight contra la
   referencia aprobada. Cualquier delta detiene el trabajo hasta revisarlo.
3. Antes de desplegar escrituras o una migracion posterior: copiar snapshots a
   almacenamiento privado independiente, ensayar restauracion y editor en un
   entorno aislado, completar Google Sign-In admin y corregir/probar los P1.
4. Verificar en Cloud Console la lista exacta de APIs de la YouTube key. Las
   restricciones de referrer ya tienen evidencia positiva.
5. Sincronizar a GitHub la version local aprobada, incluidas rules/config y estos
   archivos de mantenimiento, sin backups. Registrar release de Hosting.

No se hicieron migraciones ni cambios al comportamiento de la app. READY aplica
solo al trabajo derivado de lectura; no autoriza escrituras ni despliegue.
