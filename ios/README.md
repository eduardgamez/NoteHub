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

En Ajustes, inicia sesión con el mismo correo que utilizas en la web. Correo y contraseña es la primera opción; el enlace por correo sigue disponible como alternativa. La app guarda la sesión en el llavero de iOS y renueva sus tokens automáticamente: cerrar la app, reiniciar el dispositivo o actualizar sobre la instalación existente no requiere volver a entrar. No fija una caducidad local; una revocación o una política de duración en Supabase puede exigir autenticarse de nuevo. Cerrar sesión elimina las credenciales guardadas de este dispositivo. Safari y la app tienen almacenamiento independiente: los datos no se copian automáticamente del navegador. La sincronización existente con Supabase comparte documentos, calendario, conversaciones, rutinas e historial. Los cambios realizados sin conexión permanecen pendientes hasta reconectar.

Ajustes también permite descargar el espacio actual y sus copias locales. Nunca se borran IndexedDB, sesiones ni documentos al actualizar el código o limpiar la caché de archivos de la aplicación.

## Avisos y pantalla bloqueada

Las notificaciones están siempre activas en NoteHub; el único interruptor es Ajustes del iPhone → NoteHub. La primera vez que se abre la app, iOS pide permiso. Si después se desactivan, cada vez que la app pasa a primer plano muestra un aviso con un acceso a Ajustes del iPhone. Se programan los siguientes 60 eventos y recordatorios; los eventos avisan al inicio y los recordatorios sin hora a las 09:00 locales. Abre NoteHub regularmente para recoger cambios de otros dispositivos y programar los avisos siguientes. No se necesita tener el Mac encendido para que suenen los avisos ya programados.

Los avisos de recordatorios muestran únicamente su título, junto al nombre e icono de NoteHub que añade iOS. No incluyen listas de tareas ni botones adicionales. Al pulsar el aviso, se abre la página principal con el recordatorio seleccionado y su editor abierto, incluso si NoteHub estaba cerrada o mostraba otra sección. Si ya se ha eliminado, se abre la página principal. Los avisos de eventos conservan sus acciones; las acciones nativas se guardan aunque la web no esté ejecutándose y se aplican al abrir la app. Quitar un aviso del centro de notificaciones no borra los datos.

La pantalla bloqueada muestra una sola actividad: un evento mientras transcurre, o un recordatorio cuando llega su hora. El recordatorio tiene prioridad. La tarjeta se retira deslizando, sin borrar los datos. Al quitar el aviso de un recordatorio del centro de notificaciones también se retira de la actividad y se recupera el evento en curso, si lo hay. La retirada corresponde a la hora del aviso: una notificación antigua no oculta un recordatorio reprogramado. Si iOS comunica la retirada del widget mientras la app está activa, se recupera el evento sin esperar a la siguiente revisión de la agenda. Los recordatorios anteriores a la primera activación de esta función no se recuperan como avisos atrasados. La app registra las retiradas que iOS comunica mientras está ejecutándose; no trata una actividad ausente tras actualizar o caducar como una retirada manual. Cambiar la fecha permite que un aviso retirado vuelva a aparecer en su nueva hora.

En iOS 26 o posterior se programa el inicio del siguiente aviso si no hay otro visible, para que pueda aparecer con la app cerrada. En iOS 17–18 el inicio automático requiere que la app esté ejecutándose en primer plano. Las casillas de eventos y recordatorios funcionan con la app cerrada mediante LiveActivityIntent. Usan controles Toggle para reflejar visualmente el toque. Cada acción guarda el estado antes de terminar, y la actualización de ActivityKit se procesa después, agrupando las actualizaciones pendientes para conservar el estado más reciente. La app solicita tiempo de ejecución en segundo plano para completar esa actualización. La respuesta y admisión de toques consecutivos también depende de iOS; las pruebas de acciones nativas no acreditan latencia cero en el dispositivo. La cabecera y el contenido quedan alineados arriba; la tarjeta crece hacia abajo según el contenido, sin reservar una altura fija. Las tareas usan una columna mientras caben; solo pasan a dos si hace falta para respetar la altura máxima. Mantienen texto de 16 puntos y casillas de 22. El título ocupa una franja de ancho completo, con 12 puntos de espacio arriba y abajo; ambas columnas de tareas empiezan debajo de esa franja. Los recordatorios no muestran la etiqueta RECORDATORIO. Antes de omitir tareas, la tarjeta intenta mostrar todas en una columna, luego en dos y finalmente con espacios más compactos, manteniendo el tamaño del texto y las casillas. Solo si ninguna distribución cabe en la altura máxima de 160 puntos muestra un contador breve de las restantes junto al título; la lista completa se mantiene en la app. Sin APNs no se garantiza la sustitución a la hora exacta de un aviso ya visible, la retirada de un evento al terminar ni la recuperación inmediata del evento al deslizar: se actualizan cuando la app vuelve a ejecutarse. La app revisa la agenda cada cinco segundos mientras está abierta. Apple limita la duración de las actividades; no se puede mantener un recordatorio indefinidamente hasta retirarlo. Debes permitir Actividades en directo en los ajustes del iPhone.

## IA desde la app

En Ajustes de NoteHub, configura **Servidor de IA** con la dirección accesible desde el iPhone. `localhost` en el teléfono no es tu Mac. Fuera de la red local usa HTTPS. Si el servidor utiliza `NOTEHUB_WEB_ORIGIN`, añade `capacitor://localhost` a esa lista. No se incluyen claves privadas del servidor en la app.

Codex permanece local por defecto. Para usar la sesión de Codex del Mac desde el iPhone, añade **tu correo de NoteHub** a `NOTEHUB_CODEX_REMOTE_EMAILS` en el `.env` del Mac y reinicia el servidor. Inicia sesión con ese mismo correo en la app: el servidor comprueba el token de Supabase y el correo confirmado antes de permitir cada solicitud. Otros usuarios autenticados no pueden usar tu sesión. El inicio de sesión de ChatGPT se hace únicamente en el Mac. El Mac y su servidor deben estar encendidos y accesibles; no se transfiere su sesión a la app.

## Comprobaciones

```sh
npm run ios:build
```

Genera una compilación de simulador sin firma. `scripts/prepare-ios.mjs` descarga los frameworks oficiales de Capacitor y verifica sus SHA-256; permanecen fuera de Git. La capa nativa utiliza el mismo color de marca e icono de NoteHub. Las acciones usan una cola con confirmación sólo después de guardar en IndexedDB, para evitar perder un tick o repetirlo como un toggle al volver a abrir.

Las actividades interactivas utilizan [LiveActivityIntent](https://developer.apple.com/documentation/AppIntents/LiveActivityIntent), que ejecuta las acciones en el proceso de la app sin abrir su pantalla. Para ejecutar las pruebas nativas, selecciona el simulador en Xcode y usa Product → Test.
