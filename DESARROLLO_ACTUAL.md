# Inkfinity - Estado de Desarrollo y Arquitectura del Proyecto (Contexto para IA)

Este documento contiene el contexto completo, arquitectónico y técnico del desarrollo actual de **Inkfinity**. Está diseñado específicamente para que cualquier Inteligencia Artificial o nuevo desarrollador que asuma tareas en este repositorio comprenda rápidamente las reglas del sistema, el estado actual y el flujo de los datos.

## 1. Visión General del Proyecto

**Inkfinity** es una plataforma integral (Marketplace + Red Social + Ecosistema Web3) orientada a la industria del tatuaje. Conecta a cuatro perfiles clave de usuarios: **Clientes, Artistas Tatuadores, Estudios y Proveedores (Supply Stores)**. 

La plataforma permite explorar portafolios, realizar reservas (bookings), establecer comunicaciones en tiempo real (chat), y gestionar pagos o depósitos mediante integraciones Web3 en redes descentralizadas.

## 2. Stack Tecnológico (Tech Stack)

*   **Frontend / Framework:** [Next.js v15+](https://nextjs.org/) (App Router), React 18, TypeScript.
*   **Estilos y UI:** [Tailwind CSS](https://tailwindcss.com/) y [ShadCN UI](https://ui.shadcn.com/) (Radix Primitives).
*   **Base de Datos y Backend:** Firebase Realtime Database (Nodos JSON estructurados) y Firebase Authentication. *Nota: Firebase Storage fue eliminado por completo. Las imágenes de perfil y obras de arte se almacenan en la cuenta de Google Drive de cada usuario (carpeta "Inkfinity Artworks"), y las obras NFT se suben a IPFS. El módulo de almacenamiento se encuentra en `src/lib/google-drive.ts`.*
*   **Inteligencia Artificial (Server-Side):** Google AI & Genkit (`@genkit-ai/google-genai`). Se usa para generación de biografías, tagging automático de imágenes, moderación de contenido y validación de 2FA facial (comparación de frames).
*   **Inteligencia Artificial (Client-Side):** MediaPipe Tasks Vision (detección facial y liveness) y face-api.js (embeddings faciales) consumidos desde `/public/models/`.
*   **Web3 y Blockchain:** Ethers.js (`^6.17.0`) y Reown AppKit (`@reown/appkit`) para conexión a wallets descentralizadas y manejo de depósitos en redes como Polygon (Amoy testnet).

## 3. Arquitectura de Datos (Firebase Realtime Database)

Toda la persistencia ocurre en Firebase Realtime Database. La seguridad está controlada férreamente a través de `database.rules.json`.

### Nodos Principales:
1.  **`users/$uid`**: Perfiles de usuario. Incluye roles (User, Artist, Studio, Administrator, Super-Administrator), credenciales, wallets asociadas y configuraciones.
2.  **`usernames/$username`**: Mapa inverso de alias de usuario a UID para búsquedas rápidas (Ej. `@inkmaster -> uid123`).
3.  **`artworks/$artworkId`**: El portafolio de tatuajes y diseños. Campos clave: `title`, `imageUrl` (URL pública de Google Drive o IPFS gateway), `artistId`, `ownerId`, `likesCount`, `isForSale`, `storageType` (`google-drive` | `ipfs`), `googleDriveFileId`, `googleDriveFolderId`.
4.  **`comments/$artworkId/$commentId`**: Comentarios anidados por obra de arte.
5.  **`bookings/$bookingId`**: Sistema de citas. Relaciona `clientId` y `artistId` con fechas, estados (Pendiente, Confirmado, Completado) y pagos Web3.
6.  **`chats` & `messages` & `userChats`**: Sistema de mensajería en tiempo real. **Restringido exclusivamente a comunicación Administración ↔ Usuarios** por diseño de seguridad. Los usuarios normales no pueden chatear entre sí; se contactan a través de sus redes sociales (Instagram, WhatsApp, Telegram) visibles en su perfil.
7.  **`reviews`**: Calificaciones cruzadas tras completar una reserva (`authorId` -> `revieweeId`).
8.  **`platform_settings`**: Configuración global de la aplicación modificable solo por un Super-Administrador.

## 4. Estructura del Directorio de la App (`src/`)

*   **`src/app/`**: Rutas de Next.js (Server & Client Components).
    *   `/auth`: Flujos de login, registro (email/password, OAuth).
    *   `/verify-face`: Módulo avanzado de autenticación 2FA usando la cámara web (detección de liveness (parpadeo) + validación de IA).
    *   `/dashboard`: Panel principal segmentado según el Rol del usuario (estadísticas de artista vs historial de cliente).
    *   `/artwork` y `/upload`: Visor de arte y módulo para subir nuevas piezas al portafolio (con auto-tagging de IA).
    *   `/chat`: Mensajería en tiempo real embebida.
    *   `/[username]`: Página pública del perfil del artista/estudio.
    *   `/admin` y `/admin/cleanup`: Dashboard de super-administrador, incluye herramientas de limpieza y purga de base de datos.
*   **`src/components/`**: 
    *   `/ui`: Componentes puros de ShadCN.
    *   `/auth`, `/bookings`, `/charts`, `/chat`, `/home`, `/layout`: Componentes modulares y específicos de dominio de negocio.
*   **`src/lib/`**: Archivos de configuración de dependencias (instancias de Firebase, helpers `cn` de Tailwind, configuraciones Web3, módulo de Google Drive `google-drive.ts` para almacenamiento de imágenes, módulo IPFS `ipfs.ts` para obras NFT).
*   **`src/ai/`**: Lógica de inicialización y flujos de Genkit.

## 5. Módulo Reciente: Limpieza y Mantenimiento de BD (Admin)

Recientemente se integraron capacidades administrativas para sanear la base de datos de manera automatizada:
1.  **Herramienta Web:** Ubicada en `/admin/cleanup`. Permite al Administrador sincronizar el nodo de `/usernames` con usuarios válidos y eliminar notificaciones/likes de entidades que ya no existen (registros huérfanos). Las imágenes se gestionan externamente en Google Drive de cada usuario.
2.  **Herramientas Offline de Terminal:** 
    *   Se crearon `cleanup-script.mjs` y `run-cleanup.sh` en el entorno raíz. Permiten hacer mantenimiento invocando directamente la REST API/SDK de Firebase desde una shell, inyectando variables desde `.env.local` y requiriendo credenciales de administrador (Email/Password) para no violar las reglas de Firebase.

## 6. Instrucciones Directivas para IAs Colaboradoras

Si vas a desarrollar o modificar características en este proyecto, DEBES adherirte a las siguientes normativas:

1.  **Componentes y CSS:** USA EXCLUSIVAMENTE Tailwind CSS. NO crees archivos `.css` separados (a excepción del import en `globals.css`). No uses `style={{}}` inline a menos que sea un cálculo de canvas dinámico.
2.  **Next.js Server vs Client:** Recuerda que los componentes en `app/` son *Server Components* por defecto. Solo usa `"use client"` cuando haya interactividad (Hooks, eventos de clic, listeners en tiempo real de Firebase).
3.  **Seguridad y Reglas DB:** Si alteras la estructura de datos que se lee o se guarda en Firebase (`push()`, `update()`), ASEGÚRATE de que estas acciones no rompan `database.rules.json`. Si agregas un nuevo nodo de datos, deberás prever actualizar las reglas.
4.  **Imágenes y Almacenamiento:** Firebase Storage está **eliminado**. Todas las imágenes se suben a Google Drive del usuario (vía `src/lib/google-drive.ts`) o a IPFS para obras NFT (`src/lib/ipfs.ts`). No hay fallback a almacenamiento local. El archivo `src/lib/firebase/storage.ts` ya no existe.
5.  **Web3:** Todo contrato o envío de tokens se hace por Reown AppKit + Ethers. Asegúrate de verificar las firmas.
6.  **IA:** Todas las llamadas al modelo (Gemini) se deben realizar mediante **Server Actions** o **API Routes** (`/api/`) del lado del servidor para proteger la clave `GEMINI_API_KEY`. Nunca filtres esta clave al cliente.

---
*Documento autogenerado para el contexto de Agentes de Programación de IA en el entorno Google AI Studio.*
