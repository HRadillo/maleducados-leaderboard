# Verificacion de seguridad

Estas comprobaciones son manuales porque la configuracion efectiva vive en las consolas de Google Cloud y Firebase. El repositorio no permite confirmarlas por si solo.

## YouTube Data API

En Google Cloud Console, abrir **APIs y servicios > Credenciales** y seleccionar la clave que usa el editor para consultar YouTube. No crear ni copiar otra clave al repositorio.

Configurar:

1. **Restricciones de aplicacion: Sitios web (referentes HTTP)**.
2. Permitir `https://maleducados-leaderboard.web.app/*`.
3. Permitir `https://maleducados-leaderboard.firebaseapp.com/*` si ese dominio se usa.
4. Agregar cada dominio personalizado real, si existe.
5. Conservar `http://localhost:*/*` solo si se necesita la consulta durante desarrollo local.
6. **Restricciones de API: Restringir clave**, seleccionando unicamente **YouTube Data API v3**.

Despues de guardar, probar en produccion el autollenado de un video desde el editor. La clave sigue siendo visible para el navegador por diseño; las restricciones son la proteccion efectiva.

## Firestore Security Rules

`firestore.rules` esta versionado y permite escribir `site/leaderboard` unicamente cuando Firebase Authentication entrega el email autorizado. El chequeo equivalente de `admin.js` no reemplaza estas reglas.

Antes de publicar cambios de reglas:

1. Abrir **Firebase Console > Firestore Database > Rules**.
2. Comparar las reglas activas con `firestore.rules`.
3. Confirmar que no haya otra regla mas amplia que permita escrituras.
4. Probar desde Rules Playground una lectura sin autenticar, una escritura sin autenticar y una escritura con una cuenta distinta.
5. Publicar `firebase deploy --only firestore:rules` solo despues de revisar la diferencia y contar con autorizacion explicita.

El despliegue normal de Hosting (`firebase deploy --only hosting`) no actualiza las reglas.
