# Roadmap Técnico: AI English Voice Coach

## Fase 1: Pipeline Arquitectónico (Bot + FFmpeg) ✅
- [x] Configuración de Node.js + TypeScript + Telegraf.
- [x] Middleware de procesamiento de audio con FFmpeg.
- [x] Transcodificación automática .oga -> .mp3 (16kHz, Mono).

## Fase 2: MVP de Inteligencia Multimodal (Gemini 3.1) ✅
- [x] Integración nativa con Google Generative AI.
- [x] Prompt Engineering para análisis de audio sin STT externo.
- [x] Generación de respuesta estructurada en JSON pedagógico.

## Fase 3: Feedback Auditivo (TTS Service) ✅
- [x] Integración de Google TTS para correcciones de voz.
- [x] Implementación de Shadowing Feedback (Audio + Texto).
- [x] Utilidad de limpieza de archivos temporales (Cleanup Util).

## Fase 4: Capa de Datos y Memoria (Supabase + Prisma) ✅
- [x] Configuración de Infraestructura: Supabase + Prisma 6.
- [x] Registro de sesiones y tracking de 4 métricas de aprendizaje.
- [x] Implementación del algoritmo de detección de WeakPoints.
- [x] Inclusión de Justificación cualitativa para cada puntaje.

## Fase 5: Motor Proactivo (Cron-Engine) ✅
- [x] Orquestación de tareas programadas con `node-cron`.
- [x] Generación de retos dinámicos con IA basados en historial.
- [x] Personalización del comando `/start` con nivel CEFR.

## Fase 6: Analytics y Dashboard ✅
- [x] **Tarea 6.1:** Implementar comando `/stats` con promedios históricos.
- [x] **Tarea 6.2:** Generación de reporte visual de "Puntos Críticos".
- [x] **Tarea 6.3:** Implementación de UX sin comandos (Menú Nativo y Botones Inline).


## Fase 7: Escalabilidad y Monetización (Estratégico)
*(Pausada: Prioridad actual orientada a fines académicos y exhibición en portafolio)*
- [ ] **Tarea 7.1:** Upgrade auditivo con ElevenLabs (Premium Voices).
- [ ] **Tarea 7.2:** Expansión omnicanal a WhatsApp Cloud API.
- [ ] **Tarea 7.3:** Implementación de modelo SaaS y suscripciones.
- [ ] **Tarea 7.4:** Resiliencia y colas asíncronas con BullMQ + Redis.
- [ ] **Tarea 7.5:** Sistema de Gamificación (XP y rachas de práctica).
- [ ] **Tarea 7.6:** Generación de Reportes Semanales en formato PDF.

## Fase 8: Tutor Proactivo y Conversacional (V2) ✅
- [x] **Tarea 8.1:** Modificar esquema Prisma (Tabla de Mensajes, CEFR dinámico).
- [x] **Tarea 8.2:** Actualizar prompt de IA y formato JSON (Mini-Lecciones y Preguntas).
- [x] **Tarea 8.3:** Refactorizar bot para enviar respuestas humanas (sin mostrar notas).
- [x] **Tarea 8.4:** Implementar inyección de historial de chat a Gemini (Memoria).
- [x] **Tarea 8.5:** Conectar cron job a WeakPoints para retos personalizados.

---

## Fase 9: Despliegue y Exhibición en Portfolio (Producción)
- [/] **Tarea 9.1:** Configurar PM2 y Node.js en el VPS de DigitalOcean.
  - [x] Preparar build local con `tsc-alias`.
  - [ ] Inicializar Git y subir a repositorio remoto.
  - [ ] Configurar entorno en VPS (Node, PM2).
- [ ] **Tarea 9.2:** Desplegar base de datos de producción (Supabase) y ejecutar migraciones de Prisma.
- [ ] **Tarea 9.3:** Integrar el proyecto en el frontend de `architect-hub` (Angular).
- [ ] **Tarea 9.4:** Crear Ficha Técnica (Arquitectura, Diagramas y enlace "Prueba el Bot") en el Portfolio.

*Roadmapping de Alta Fidelidad - Sincronizado con Blueprint v2.0.0*
