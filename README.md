# Los Maleducados del Magic Leaderboard

Sitio estático para publicar el leaderboard de invitados, resultados y decks jugados en el canal.

## Estructura

- `index.html`: página principal.
- `styles.css`: línea visual dark y responsive.
- `data.js`: jugadores, decks, records y links a Moxfield.
- `app.js`: filtros, rankings, podium y perfiles.
- `assets/brand/`: logo e isotipo optimizados para web.
- La interfaz usa Montserrat desde Google Fonts; el logotipo conserva su arte original.

## Publicación en GitHub Pages

1. Sube estos archivos al repositorio.
2. En GitHub ve a `Settings > Pages`.
3. En `Build and deployment`, elige `Deploy from a branch`.
4. Selecciona la rama principal y la carpeta `/root`.
5. Guarda los cambios.

## Edición segura con Google

La app está preparada para usar Firebase Authentication + Firestore. Esta es la opción recomendada sobre un password en el frontend, porque un password dentro de GitHub Pages se puede encontrar leyendo el código.

1. Crea un proyecto en Firebase.
2. Activa `Authentication > Sign-in method > Google`.
3. En `Authentication > Settings > Authorized domains`, agrega el dominio de GitHub Pages cuando ya lo tengas.
4. Crea una base `Firestore Database`.
5. Copia la configuración web de Firebase en `firebase-config.js`.
6. Cambia `enabled` a `true`.
7. Usa estas reglas de Firestore:

```txt
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /site/leaderboard {
      allow read: if true;
      allow write: if request.auth != null
        && request.auth.token.email == "losmaleducadosdelmagic@gmail.com";
    }
  }
}
```

Con eso, cualquiera puede ver el leaderboard, pero sólo `losmaleducadosdelmagic@gmail.com` puede guardar cambios.

## Actualizar invitados y decks

Puedes editar desde el panel admin cuando Firebase esté configurado. Como respaldo, también puedes editar `data.js`. Cada jugador tiene:

- `wins` y `losses` para el record general.
- `appearances` para apariciones en el canal.
- `decks` con `commander`, `archetype`, `colors`, record del deck y `moxfield`.
- `videoUrl` para ligar cada deck/mesa al video de YouTube.

Los colores usan letras de Magic: `W`, `U`, `B`, `R`, `G`.

## Suscriptores en vivo

El sitio incluye el espacio de suscriptores y el link de suscripción. Para que el conteo sea live en GitHub Pages, agrega en `data.js` un `youtubeApiKey` y `youtubeChannelId` dentro de `channelStats`; si no están configurados, se muestra el valor manual de `subscribers`.

Si la API key está restringida por sitio web, agrega estos referrers permitidos:

```txt
https://maleducados-leaderboard.web.app/*
https://maleducados-leaderboard.firebaseapp.com/*
```

Si sigues usando GitHub Pages como respaldo, agrega también:

```txt
https://hradillo.github.io/*
```

## Imágenes de comandantes

Al guardar un deck desde el editor, el sitio busca la carta en Scryfall usando el nombre del comandante y guarda la imagen en `cardImage`. Si un deck viejo todavía no tiene imagen, la página intenta buscarla automáticamente cuando alguien hace hover sobre el nombre del comandante.
