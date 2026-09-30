# IA en la web y en iPhone

GitHub Pages publica la interfaz; el servidor Express se publica por separado.
`render.yaml` prepara un servicio gratuito en Render con autenticación de NoteHub
obligatoria y acceso desde GitHub Pages y Capacitor.

1. Publicar estos cambios en GitHub.
2. Iniciar sesión en Render y crear un Blueprint desde `eduardgamez/NoteHub`.
3. Configurar `SUPABASE_PUBLISHABLE_KEY` con la clave pública del proyecto.
   Las claves de IA se configuran en Ajustes de NoteHub en cada dispositivo. No publicar claves privadas en Git.
4. Al terminar, guardar la URL HTTPS del servicio como variable de GitHub Actions
   `NOTEHUB_API_ORIGIN` y ejecutar el workflow Publish NoteHub.
5. Para iPhone, configurar `VITE_API_ORIGIN` con esa misma URL antes de `npm run
   ios:sync` y reinstalar sobre la app existente, o guardar la URL en Ajustes →
   Servidor de IA.
6. Iniciar sesión en NoteHub en cada dispositivo y comprobar una respuesta real.

El servidor debe responder en `/api/health`; las peticiones de IA requieren el
JWT de la sesión de NoteHub. La web y el iPhone no necesitan el Mac encendido.
El plan gratuito de Render se suspende tras 15 minutos sin peticiones, por lo
que la primera respuesta puede tardar más. El consumo de OpenAI se factura por
separado. Esta instalación no incluye la sesión local de Codex del Mac.
