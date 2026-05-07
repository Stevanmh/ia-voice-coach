# Blueprint Arquitectónico — AI English Voice Coach (Telegram Edition)
Versión: 1.1.0 | Fecha: 2026-04-25 | Estado: Fase 5 Completada / Iniciando Fase 6

## 1. Descripción del Sistema
Un backend orientado a servicios que actúa como tutor personal de inglés a través de Telegram. Recibe notas de voz, las transcodifica con FFmpeg, y genera una evaluación pedagógica estructurada y proactiva (sin depender de STT externo, usando directamente Gemini Multimodal).

**Meta central:** Baja fricción + feedback inmediato + alta precisión pedagógica + proactividad.

## 2. Pipeline Arquitectónico
[Telegram User]
     │  voice note (.oga)
     ▼
[Telegraf Bot Handler]          ← Capa de Interfaz (controllers/)
     │
     ▼
[Audio Service]                 ← FFmpeg: .oga → .mp3 (mono, 16kHz)
     │
     ▼
[AI Service (Gemini 3.1)]       ← Inferencia Multimodal Nativa (Análisis + Notas)
     │
     ▼
[Database Layer]                ← Prisma 6 + Supabase (Sessions/WeakPoints)
     │
     ▼
[TTS Service]                   ← Google TTS: Feedback auditivo de corrección
     │
     ▼
[Telegraf Reply]                ← Mensaje al usuario (Markdown + Voice)
     │
     ▼
[Cleanup Util]                  ← Eliminar archivos temporales

## 3. Stack Tecnológico
| Categoría | Tecnología | Justificación |
|-----------|------------|---------------|
| Lenguaje | TypeScript 5.x | Tipado fuerte para objetos JSON de IA. |
| Runtime | Node.js 20 LTS | Async/await nativo; ideal para I/O-bound. |
| Bot Framework | Telegraf 4.x | Typing nativos; Long Polling local. |
| Multimedia | FFmpeg + fluent-ffmpeg | Estándar de industria para .oga → .mp3. |
| STT + LLM | Google Gemini 3.1 Flash | Modelo multimodal nativo; elimina latencia de usar Whisper separado. |
| Validación | Zod | Valida JSON de Gemini en runtime (Configuración env). |
| ORM (Fase 4) | Prisma 6 + PostgreSQL | Integridad relacional, compatibilidad local perfecta. |
| Scheduling | node-cron (Fase 5) | Bucle proactivo ligero integrado en Node. |

## 4. Estructura del Proyecto
telegram-voice-coach/
├── src/
│   ├── config/
│   │   └── env.ts              # Valida variables de entorno con Zod
│   ├── controllers/
│   │   └── telegram.controller.ts
│   ├── interfaces/
│   │   └── tutor.interface.ts  # DTOs y contratos TypeScript (Actualizado)
│   ├── lib/
│   │   └── prisma.ts           # Instancia Singleton de DB
│   ├── services/
│   │   ├── audio.service.ts    # FFmpeg: descarga, conversión
│   │   ├── ai.service.ts       # Gemini Multimodal
│   │   ├── tts.service.ts      # Google TTS
│   │   ├── user.service.ts     # Lógica DB
│   │   └── challenge.service.ts # Cron de retos
│   ├── utils/
│   │   └── cleanup.util.ts
│   └── app.ts                  # Entry point
├── temp/                       # Almacenamiento volátil (gitignored)
├── docs/                       # Blueprints
├── prisma/                     # Schema y migraciones
├── .env / .env.example
├── tsconfig.json
└── package.json

## 5. Contrato de Datos Central
```typescript
// src/interfaces/tutor.interface.ts
export interface TutorFeedback {
  original_transcript:  string;
  corrected_version:    string;
  grammar_errors:       GrammarError[];
  pronunciation_tips:   PronTip[];
  grammar_score:        number;
  pronunciation_score:  number;
  fluency_score:        number;
  vocabulary_score:     number;
  score_justifications: ScoreJustification;
  encouragement_message: string;
}

export interface ScoreJustification {
  grammar:       string;
  pronunciation: string;
  fluency:       string;
  vocabulary:    string;
}
```

## 6. Decisiones Técnicas Clave (Desvíos Evolutivos)
| Decisión | Justificación Arquitectónica y de Producto |
|----------|------------------------------------------|
| **La Poda de Whisper (Gemini Multimodal)** | Ahorramos una API, bajamos la latencia casi a la mitad y reducimos el costo operativo. Movimiento maestro de ingeniería. |
| **De Texto a Voz Real (Google TTS)** | No puedes llamarte "Voice Coach" si el bot es mudo. Esto cambió por completo la calidad de la app, dándole al usuario un ejemplo de pronunciación nativa. |
| **De Reactivo a Proactivo (node-cron)** | Resuelve el problema número 1 del aprendizaje de idiomas: la falta de constancia. El bot ahora envía retos a las 9am, 2pm y 9pm. |
| **Prisma 6 vs Prisma 7** | Rollback estratégico a v6 para evitar conflictos de `engineType` locales y errores P1012. |
| **Mono 16kHz para audio** | Formato óptimo para IA neuronal; menor tamaño de archivo, procesamiento más rápido. |
| **Desacoplar controllers de services** | Permite WhatsApp (Fase 7) sin tocar lógica de negocio. |

## 7. Riesgos y Mitigaciones
| Riesgo | Mitigación |
|--------|------------|
| JSON inválido de Gemini | Instrucciones estrictas en el prompt + Fallback estructurado en el `ai.service.ts`. |
| Archivos temp huérfanos | `cleanup.util.ts` en bloque `finally`, siempre se ejecuta. |
| Saturación API (Status 503) | Loop de reintentos con "Delay progresivo" implementado en `ai.service.ts`. |
| Fuga de conexiones a DB | Uso del patrón Singleton en `src/lib/prisma.ts`. |
| Múltiples usuarios simultáneos | Arquitectura asíncrona no bloqueante (Preparación para colas futuras). |

## 8. Fases de Evolución (Roadmap Detallado)

### Fase 1: Pipeline Arquitectónico (Bot + FFmpeg)
**Estado:** ✅ Completado
**Objetivo Arquitectónico:** Establecer el canal de entrada/salida asíncrono vía Long Polling de Telegraf y garantizar la ingesta de audio en formato compatible para la IA (transcodificación de .oga a .mp3 mono 16kHz usando FFmpeg).

### Fase 2: MVP de Inteligencia Multimodal (Gemini 3.1)
**Estado:** ✅ Completado
**Objetivo Arquitectónico:** Reemplazar el STT tradicional (Whisper) inyectando el archivo de audio directamente al LLM (Gemini 3.1 Flash). Asegurar un contrato de datos estricto (`TutorFeedback`) validado mediante System Prompts.

### Fase 3: Feedback Auditivo (TTS Service)
**Estado:** ✅ Completado
**Objetivo Arquitectónico:** Cerrar el ciclo de feedback multimodal. El sistema recibe texto corregido del LLM, invoca a Google TTS para generar un archivo de audio de salida, lo envía al usuario y ejecuta rutinas de limpieza (`cleanup.util.ts`) para evitar saturación de disco.

### Fase 4: Capa de Datos y Memoria (Supabase + Prisma)
**Estado:** ✅ Completado
**Objetivo Arquitectónico:** Dotar al bot de estado y memoria a largo plazo. Implementación de una base de datos relacional (PostgreSQL) gestionada por Prisma ORM. Persistencia de métricas granulares (Gramática, Pronunciación, etc.) y un algoritmo para identificar `WeakPoints` recurrentes.

### Fase 5: Motor Proactivo (Cron-Engine)
**Estado:** ✅ Completado
**Objetivo Arquitectónico:** Evolucionar el sistema de reactivo a proactivo. Integración de `node-cron` en el hilo principal de Node.js para ejecutar barridos diarios sobre la DB, extrayendo WeakPoints e inyectándolos en Gemini para generar retos lingüísticos hiper-personalizados.

### Fase 6: Analytics y Dashboard
**Estado:** ✅ Completado
**Objetivo Arquitectónico:** Transformar los datos crudos acumulados en la Fase 4 en información accionable para el usuario final mediante promedios y detección de patrones de error.
* **Componentes:**
  * **Motor de Agregación:** Comando `/stats` y cálculo histórico en Prisma.
  * **Extracción de Puntos Críticos:** Top 3 errores frecuentes.
  * **Refactorización UX:** Eliminación de fricción de comandos mediante Menú Nativo (`setMyCommands`) y Botones de Acción Inline (`Markup.inlineKeyboard`).

### Fase 7: Escalabilidad y Monetización (Estratégico)
**Estado:** ⏸️ Pausada (Prioridad académica)
**Objetivo Arquitectónico:** Transformar el MVP en una solución Enterprise/SaaS.
* **Componentes Tecnológicos:**
  * **BullMQ + Redis:** Colas asíncronas para procesamiento masivo.
  * **ElevenLabs API:** Voces neuronales ultra-realistas.
  * **WhatsApp Cloud API:** Expansión omnicanal.
  * **SaaS:** Pasarela de pagos y tiers Premium.
  * **Gamificación:** Sistema de XP y rachas para retención de usuarios.
  * **Reportes PDF:** Documentos formales de progreso semanal.

### Fase 9: Despliegue y Exhibición en Portfolio (Producción)
**Estado:** 🚧 En Planificación
**Objetivo Arquitectónico:** Desplegar el bot en un entorno estable (DigitalOcean VPS) para demostrar las capacidades técnicas en un portafolio profesional.
* **Componentes Tecnológicos:**
  * **Hosting Backend:** VPS DigitalOcean (Ubuntu) gestionado con PM2.
  * **Base de Datos:** Entorno de Producción en Supabase con migraciones de Prisma aplicadas.
  * **Integración Frontend:** Creación de un componente de "Ficha Técnica" dentro del monorepo NX `architect-hub` (Angular), detallando la arquitectura y permitiendo la redirección al bot en vivo.

---

# 🚀 PROPUESTA: Fase 8 - Tutor Proactivo y Conversacional (V2)

**Objetivo Arquitectónico:** Transformar el bot de un "generador de calificaciones reactivo" a un coach personal interactivo con memoria, lecciones dinámicas y capacidad de dirigir la conversación basándose en las debilidades del usuario.

> [!IMPORTANT]
> **User Review Required**
> Esta fase representa el salto definitivo de calidad de la aplicación. Cambiará drásticamente la forma en que el bot interactúa contigo. Por favor revisa los cambios propuestos y responde a las preguntas abiertas antes de proceder.

## ❓ Open Questions
1. **¿Qué hacemos con las calificaciones?** Actualmente el bot envía un bloque gigante con notas (Gramática 78/100, etc.) en cada mensaje. En un chat natural, esto corta la fluidez. ¿Prefieres que el bot te hable como un humano y solo puedas ver tus notas en `/stats`, o prefieres mantener un pequeño resumen de las notas al final de cada corrección?
2. **Memoria de la Conversación:** Para que el bot recuerde el contexto, necesitamos enviarle a Gemini los últimos 5-10 mensajes de la conversación. ¿Estás de acuerdo con esto? (Consumirá un poco más de tokens de la API, pero el resultado será increíble).

## 🛠️ Proposed Changes

### Capa de Datos (Prisma)
- **Modificar `Session` o crear `MessageLog`**: Necesitamos guardar el historial de la conversación (qué te dijo el bot y qué le respondiste) para pasarlo como contexto a la IA.
- **Nivel Dinámico**: La IA actualizará tu nivel `CEFR` (A1 -> A2, etc.) automáticamente en tu perfil de la base de datos según tu progreso real.

### Capa de Inteligencia (`ai.service.ts` & `tutor.interface.ts`)
- **Evolución del Prompt (Mini-Lecciones)**: Obligaremos a Gemini a devolver una estructura mucho más rica:
  - `grammatical_rule`: Explicación sencilla de la regla que rompiste.
  - `examples`: Ejemplos de uso correcto e incorrecto de tu error.
  - `follow_up_question`: El bot SIEMPRE te hará una pregunta de seguimiento obligándote a usar la regla que acabas de fallar, manteniendo la conversación viva.

### Capa de Presentación (`telegram.controller.ts`)
- **Refactorización Visual**: En lugar de un reporte frío, el bot enviará dos mensajes separados:
  1. **El Coach Conversando**: Responderá a lo que le dijiste de forma natural y te hará la pregunta de seguimiento (incluye audio TTS).
  2. **La Pizarra del Profesor**: Un mensaje visualmente limpio con la "Mini-Lección" de tus errores, la regla gramatical y los ejemplos.

### Capa Proactiva (`challenge.service.ts`)
- **Retos Quirúrgicos**: El `node-cron` ya no enviará retos genéricos. Leerá tu peor `WeakPoint` de la base de datos (ej. "Past Tense") y le dirá a Gemini: *"Inicia una conversación con Sergio obligándolo a usar el pasado simple"*.

## 🚦 Verification Plan
1. Modificar el esquema de Prisma y hacer `npx prisma db push`.
2. Actualizar las interfaces de TypeScript.
3. Modificar el mega-prompt en `ai.service.ts`.
4. Hablar con el bot durante 5 turnos para comprobar que "recuerda" la conversación y que sus respuestas fluyen naturalmente como un profesor de verdad.
