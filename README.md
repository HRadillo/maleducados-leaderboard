# Los Maleducados del Magic Leaderboard

Leaderboard oficial de **Los Maleducados del Magic**, creado para compartir con la comunidad el historial de mesas, invitados, decks, victorias, derrotas y estadísticas del canal.

La app pertenece al proyecto **Los Maleducados del Magic**, llevado por Alan Villegas y Horacio Radillo.

## Qué Es

Este sitio reúne en un solo lugar:

- Ranking de jugadores e invitados.
- Wins, losses y win rate.
- Estadística de hosts vs invitados.
- Estadísticas por guild/identidad de color: más jugadas, más ganadoras y más derrotadas.
- Decks jugados en mesas guardadas.
- Links a Moxfield para consultar listas.
- Links a videos de YouTube de las partidas.
- Imágenes de comandantes usando Scryfall.
- Conteo de suscriptores del canal.

## Sitio

URL pública:

```txt
https://maleducados-leaderboard.web.app
```

Canal:

```txt
https://www.youtube.com/@losmaleducadosdelmagic
```

## Instalar Como App

La página puede instalarse en el celular como app web:

- En iPhone: abrir el sitio en Safari, tocar Compartir y elegir "Agregar a pantalla de inicio".
- En Android: abrir el sitio en Chrome, tocar el menú de tres puntos y elegir "Instalar app" o "Agregar a pantalla principal".

## Modo Editor

El sitio tiene un modo editor para mantener actualizado el historial sin tocar código.

Sólo la cuenta autorizada puede editar:

```txt
losmaleducadosdelmagic@gmail.com
```

Desde el modo editor se puede:

- Agregar mesas completas con nombre y link de YouTube.
- Agregar cualquier cantidad de jugadores por mesa.
- Registrar comandante, username opcional y link de Moxfield por jugador.
- Seleccionar quién ganó la mesa.
- Editar o borrar mesas guardadas desde el editor.
- Completar automáticamente colores, imagen y link de carta usando Scryfall.
- Actualizar la última mesa.
- Actualizar datos generales del canal.

## Datos

Los datos viven en Firebase Firestore. La app pública puede leerlos, pero sólo la cuenta autorizada puede escribir cambios.

Como respaldo inicial, existe `data.js`, que contiene datos base para que el sitio pueda cargar aunque Firestore todavía no tenga información.

## Tecnologías

- HTML, CSS y JavaScript.
- Firebase Hosting.
- Firebase Authentication con Google.
- Firebase Firestore.
- YouTube Data API.
- Scryfall API.

## Archivos Principales

- `index.html`: estructura de la página.
- `styles.css`: diseño visual.
- `app.js`: leaderboard, filtros, estadísticas y vista pública.
- `admin.js`: modo editor.
- `data.js`: datos base y configuración de YouTube.
- `firebase-config.js`: conexión con Firebase.
- `assets/brand/`: logo e isotipo optimizados para web.

## Mantenimiento

Después de cambiar archivos del sitio, publicar en Firebase Hosting con:

```bash
firebase deploy --only hosting
```

También conviene subir los cambios a GitHub para mantener el respaldo actualizado.
