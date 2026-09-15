# Modelo actual e invariantes

Inspeccionado el 2026-09-14 sobre la copia local elegida por el propietario.
Es documentacion descriptiva, no un esquema nuevo ni una propuesta de migracion.

## Documento y flujo

Proyecto `maleducados-leaderboard`, base `(default)`, documento `site/leaderboard`.
El documento REST tiene `name`, `createTime`, `updateTime` del servidor y
`fields`. Los campos de usuario observados son:

| Campo | Tipo | Uso |
| --- | --- | --- |
| `data` | map | Dataset completo consumido por la app |
| `updatedAt` | timestamp | `serverTimestamp()` en cada guardado |
| `updatedBy` | string | Email del usuario que guarda |

`app.js:1174` inicia un Firebase app llamado `leaderboard-public`, obtiene
`snapshot.data().data` mediante `getDocFromServer` y despues pinta la pagina.
Si falla, conserva `data.js` (base de mayo con seis jugadores y sin `tables`).
`mergeRemoteData` incorpora configuracion de YouTube del estado previo y limpia
la cache derivada. Por tanto, `window.getLeaderboardData()` no es un backup crudo.

`admin.js:1180` inicia otra instancia Firebase (default), Google Auth, `getDoc`
al arrancar y de nuevo al reconocer al admin. Ambas lecturas pueden terminar
en distinto orden. No hay listener realtime ni control de version al guardar.
`saveData` recalcula todos los jugadores, cambia la vista local y llama `setDoc`
sin merge, transaccion ni precondicion. Sustituye el documento completo.

## Dataset `data`

| Campo | Forma observada y dependencias |
| --- | --- |
| `season`, `lastUpdated` | strings; cabecera y formulario de resumen |
| `channelStats` | `subscribers` number/string, `subscribeUrl`, `youtubeApiKey`, `youtubeChannelId`; contador y autollenado de videos |
| `socials[]` | `{label,url}`; enlaces y `socials[0].url` como fallback de YouTube |
| `latestTable` | `{title,date,winner,deck,videoUrl,manualOverride?}` y opcionales `commanders`, `colors`, `cardImage`, `cardUrl`; resumen manual/derivado |
| `tables[]` | historial de mesas; fuente del ranking publico |
| `players[]` | directorio y acumulados persistidos; sugerencias, roles, tags, firmas, decks conocidos y edicion |

Mesas: `id`, `title`, `date`, `videoUrl`, `participants[]`, `winnerId`,
`winnerIds?`, `resultMode?`. El lector tambien admite `isTie: true` legacy.
`date` se maneja como string; las fechas ausentes son posibles. Los IDs de
ganadores apuntan a `participants[].id` dentro de la misma mesa, NO a players.

Participantes: `id`, `name`, `handle`, `commander`, `partnerCommander?`,
`commanders?`, `archetype`, `moxfield`, `colors[]`, `cardImage`, `cardUrl`.
Tambien se observo `collapsed` historico. No eliminarlo en esta fase.
Los campos adicionales futuros o desconocidos se deben conservar completos.

Jugadores: `id`, `name`, `handle`, `role`, `aliases?[]`, `signature`,
`latestAppearance`, `appearances`, `wins`, `losses`, `colors[]`, `decks[]`.
Deck persistido: `commander`, `commanders?[]`, `archetype`, `colors[]`, `wins`,
`losses`, `moxfield`, `videoUrl`, `cardImage`, `cardUrl`.
Carta estructurada: `{name,colors[],cardImage,cardUrl}`. Los lectores tambien
aceptan variantes `commander`, `image`, `url`; no hay Scryfall ID estable.

## Identidades y calculos actuales

- `canonicalPlayerName` mantiene equivalencias legacy explicitas para Alan y
  Horacio. La capa derivada consume tambien `players[].aliases` declarados y
  resuelve su display al registro canonico del directorio; no infiere aliases.
  `canonicalPlayerKey` convierte a minusculas;
  el ID publico usa `slugify` que elimina acentos y signos. `nameKey` del editor
  tambien elimina acentos, mientras `findPlayerByName` solo ignora mayusculas
  y espacios exteriores. Son criterios distintos.
- `recordedDecks` agrupa por nombre canonical en minusculas + display del
  comandante en minusculas + Moxfield original (vacio es parte de la clave).
  Conserva referencias a mesas por ID o titulo en un Set; no elimina mesas.
  URLs equivalentes pero textualmente distintas separan decks. Orden de
  partners distinto tambien puede separarlos.
- `recordedPlayers` agrupa por slug publico; acumula decks, W/L y appearances.
  Lee rol/tag/firma de `players` por nombre, no por ID persistido. Un registro
  del directorio sin mesa no aparece en el ranking.
- Empate: `resultMode === "tie"` o `isTie === true`, cero W y cero L para todos.
  La mesa cuenta en el total y en appearances publicas, pero no en el
  denominador de WR ni en `guildStats.played`. `recomputePlayer` persistido
  usa W+L para appearances; `applyTableToAggregates` elimina decks con W+L=0.
- No empate: cada ganador recibe una W; cada otro participante recibe una L.
  `winnerIds` prevalece sobre `winnerId`, incluso si es un array vacio.
  Lectura admite varios ganadores; formulario solo uno o dos. La rivalidad
  hosts/invitados suma ganadores, no mesas (39 mesas actuales, 40 W, 116 L).
- WR = redondeo de 100*W/(W+L), o cero sin resultados. Ranking: WR descendente,
  appearances descendente, fecha reciente, W descendente, nombre localeCompare.
  Los filtros seleccionan jugadores/decks; no recalculan todos sus acumulados.
- La vista publica prefiere `commanders[]`; fallback separa `commander` por
  ` + `, ` & ` o `//`, pero ignora `partnerCommander` suelto. El editor concatena
  los dos campos y los separa. Se protege una sola excepcion con ampersand:
  `Minsc & Boo, Timeless Heroes`. `//` tambien puede ser una carta de dos caras.
- Colores: union WUBRG de registro/caras estructuradas y un mapa manual limitado.
  Scryfall usa `color_identity`, no `mana_cost`. Vacio/desconocido acaba como C;
  no hay estado separado "sin verificar". Backgrounds se muestran como Partner,
  sin tipado ni comprobacion de compatibilidad. `parsePlayerLine` elimina
  expresamente `+ Folk Hero`, por lo que el autollenado puede omitirlo.
- Moxfield vacio es admitido y mostrado mediante el perfil general del canal;
  `findDeck` del editor lo trata como comodin. YouTube vacio tiene fallback
  publico a `socials[0]`, pero el formulario de mesa lo marca required.
- Scryfall intenta exact y luego fuzzy. HTTP fallido produce metadatos vacios;
  error de red en editor se captura pero pierde `name`. El guardado reemplaza
  `commanders[]` aunque la consulta falle; en exito parcial puede reducir colores.
  Hover publico no captura el rechazo de red. No hay validacion de que fuzzy
  haya elegido la carta correcta ni timeout/reintento controlado de la app.

## Invariantes para Prompt 2

1. Dataset historico inmutable: conservar cada mesa, su ID, orden, participantes,
   IDs, nombres originales, resultados, fecha y todas las propiedades.
2. Conservar todos los strings de URLs exactamente, incluidos vacios, parametros
   y formatos legacy. No sustituirlos por fallbacks de presentacion al persistir.
3. Conservar jugadores, aliases, tags, decks, images, cartas y metadata desconocida.
   Un posible duplicado es una observacion; nunca una autorizacion para eliminar.
4. No identificar personas solo por slug, parecido o tag; cualquier mapa de
   equivalencias debe ser explicito y conservar trazabilidad al registro fuente.
5. El modelo derivado debe construirse aparte, sin `setDoc` ni `recomputeAll`
   sobre la fuente. No usar acumulados de players como verdad de resultados.
6. Comparar snapshot antes/despues: mismos 39 registros de mesa y 156
   participaciones en esta captura, mismos resultados y URLs; comparar TODO el
   array, no solo cantidades. Si hay ediciones legitimas posteriores, renovar
   la referencia y no forzar estos numeros viejos.
7. Conservar el resultado publico actual de referencia (36 jugadores derivados,
   148 decks, sus ordenes y estadisticas). Cualquier correccion semantica futura
   requiere explicar el delta y autorizacion, aunque parezca arreglar un bug.
8. Verificar carga publica, ranking, filtros, perfiles, links, mobile y editor.
   Login y guardar/releer deben ensayarse en entorno aislado, sin una escritura
   de prueba sobre produccion. Preservar Google Auth, rules y despliegue.
9. No actualizar el fallback `data.js` desde un estado mezclado o parcial.
10. Fallo de red o datos incompletos debe detener una futura escritura, no
    convertirla en una sustitucion del historial por la base antigua.

## Capa derivada de fase 2

`derived-data.js` es una capa pura y de solo lectura. No importa Firebase, no
llama `setDoc`, no modifica `data` y no sustituye ningun campo persistido.
`window.getLeaderboardDerivedData()` la expone al frontend. El ranking y el
perfil usan `playerProfiles`; el metajuego conserva `recordedDecks()` legacy.

Jerarquia disponible:

1. `tables[]`: registro historico persistido y fuente de verdad.
2. `recordedAppearances(data)`: una fila por participante de cada mesa, con
   identidad visible/canonica, resultado, comandantes, colores, URLs y copia de
   la metadata fuente.
3. `recordedDeckVariants(appearances)`: agrupa por jugador + commander group +
   Moxfield. Conserva las distintas listas y repeticiones historicas.
4. `recordedCommanderGroups(appearances)`: agrupa solo por la configuracion
   canonica de comandantes; agrega apariciones, jugadores, resultados,
   decklists, mesas, videos, colores y metadata de cartas.
5. `recordedPlayerProfiles(appearances)`: una entidad publica por identidad
   canonica con resultados, commander groups unicos, historial e insights.
6. `playerAliasCandidates(data)`: inventario preparatorio de IDs/nombres/aliases;
   no aplica merges nuevos ni cambia la identidad persistida de jugadores.

`canonicalCommanderKey` limpia mayusculas, acentos, espacios y puntuacion, y
ordena las partes de un grupo. Por ello `Tana & Tymna` y `Tymna + Tana` comparten
identidad. El display conserva el primer orden legible. `commanders[]` y
`partnerCommander` tienen prioridad para no perder Backgrounds, Doctor's
Companion o Partner. Duplicados exactos dentro de `commanders[]` se condensan
solo en la lectura derivada y su metadata se combina; el registro fuente queda
intacto.

El leaderboard y el modal de jugador consumen ahora `playerProfiles`. Un alias
declarado que coincide con un nombre canonico ajeno, o declarado por dos
jugadores, no produce merge visual. Los dos aliases legacy de Horacio/Alan
siguen hardcodeados por compatibilidad; moverlos al directorio persistido
requiere una futura migracion aprobada. Nombres distintos que solo difieren
por acentos o puntuacion pueden compartir la clave publica actual: antes de
fusionar personas reales, revisar explicitamente esos casos con el propietario.

Validacion reproducible:

```sh
node --test maintenance/checks.test.mjs maintenance/derived-data.test.mjs
node maintenance/validate-derived.mjs .backups/SNAPSHOT_DIRECTORY
```

El segundo comando compara la capa nueva con los calculos publicos anteriores,
comprueba conteos/resultados/URLs y requiere un snapshot autenticado real. No
usa `data.js` como sustituto de produccion.
