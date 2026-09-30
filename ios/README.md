# NoteHub para iPhone

La app utiliza la misma interfaz React que la web. Portada y documentos conservan su diseño. La web del iPad sigue funcionando sin instalar nada desde Xcode.

## Preparar y renovar la instalación

Desde la raíz del proyecto:

```sh
npm install
npm run ios:sync
npm run ios:open
```

En Xcode, selecciona el proyecto **App** y tu **Personal Team** en **Signing & Capabilities**, tanto para **App** como para **NoteHubLive**. Conecta el iPhone, elígelo como destino y pulsa Run. En la primera instalación, sigue las indicaciones de confianza de Xcode y activa Modo de desarrollador en Ajustes del iPhone → Privacidad y seguridad si te lo solicita. Se requiere iOS 17 o posterior. No es necesario activar App Groups ni Push Notifications: se usan avisos locales y una actividad interactiva sin servidor push.

Con cuenta gratuita la firma dura siete días. Repite la compilación/instalación **sobre la misma app**, manteniendo el identificador y el equipo; no borres la app para renovar la firma. De ese modo conservas los datos locales. La app y su extensión usan dos identificadores. La instalación y las capacidades de la cuenta deben comprobarse en tu dispositivo; la compilación sin firma en simulador no acredita que Apple haya emitido los perfiles de tu cuenta.

## Datos y sincronización

En Ajustes, inicia sesión con el mismo correo que utilizas en la web. Safari y la app tienen almacenamiento independiente: los datos no se copian automáticamente del navegador. La sincronización existente con Supabase comparte documentos, calendario, conversaciones, rutinas e historial. Los cambios realizados sin conexión permanecen pendientes hasta reconectar.

Ajustes también permite descargar el espacio actual y sus copias locales. Nunca se borran IndexedDB, sesiones ni documentos al actualizar el código o limpiar la caché de archivos de la aplicación.

## Avisos y pantalla bloqueada

Activa **Notificaciones del iPhone** en Ajustes de NoteHub. Se programan los siguientes 60 eventos y recordatorios; los eventos avisan al inicio y los recordatorios sin hora a las 09:00 locales. Abre NoteHub regularmente para recoger cambios de otros dispositivos y programar los avisos siguientes. No se necesita tener el Mac encendido para que suenen los avisos ya programados.

Mantén pulsada una notificación para ver sus acciones: hasta tres tareas pendientes y Borrar. Al marcar o borrar, la acción se guarda de forma nativa aunque la web no esté ejecutándose. Cuando abres NoteHub se aplica a los datos, se guarda y se sincroniza con los demás dispositivos. Quitar una notificación del centro de notificaciones no borra el recordatorio.

Abre un recordatorio ya guardado y pulsa **Mostrar en pantalla bloqueada** para iniciar su actividad en directo. Muestra hasta ocho tareas con casillas interactivas y un botón de papelera, también en Dynamic Island donde esté disponible. La actividad debe iniciarse desde la app; no aparece por sí sola con cada aviso. Apple limita su duración y presentación (no es un widget permanente de inicio). El teléfono y sus ajustes determinan si requiere desbloqueo para una acción.

## IA desde la app

En Ajustes de NoteHub, configura **Servidor de IA** con la dirección accesible desde el iPhone. `localhost` en el teléfono no es tu Mac. Fuera de la red local usa HTTPS. Si el servidor utiliza `NOTEHUB_WEB_ORIGIN`, añade `capacitor://localhost` a esa lista. No se incluyen claves privadas del servidor en la app.

Codex permanece local por defecto. Para usar la sesión de Codex del Mac desde el iPhone, añade **tu correo de NoteHub** a `NOTEHUB_CODEX_REMOTE_EMAILS` en el `.env` del Mac y reinicia el servidor. Inicia sesión con ese mismo correo en la app: el servidor comprueba el token de Supabase y el correo confirmado antes de permitir cada solicitud. Otros usuarios autenticados no pueden usar tu sesión. El inicio de sesión de ChatGPT se hace únicamente en el Mac. El Mac y su servidor deben estar encendidos y accesibles; no se transfiere su sesión a la app.

## Comprobaciones

```sh
npm run ios:build
```

Genera una compilación de simulador sin firma. `scripts/prepare-ios.mjs` descarga los frameworks oficiales de Capacitor y verifica sus SHA-256; permanecen fuera de Git. La capa nativa utiliza el mismo color de marca e icono de NoteHub. Las acciones usan una cola con confirmación sólo después de guardar en IndexedDB, para evitar perder un tick o repetirlo como un toggle al volver a abrir.

Las actividades interactivas utilizan [LiveActivityIntent](https://developer.apple.com/documentation/AppIntents/LiveActivityIntent), que ejecuta las acciones en el proceso de la app sin abrir su pantalla. Para ejecutar las pruebas nativas, selecciona el simulador en Xcode y usa Product → Test.
