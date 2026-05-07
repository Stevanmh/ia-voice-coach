# Walkthrough - Construcción del AI Voice Coach

## Fase 1: Cimientos y Telegram ✅
- Configuración inicial de Node.js y TypeScript.
- Integración con Telegraf para recibir audios (.oga).
- Conversión de audio con FFmpeg a MP3 (16kHz Mono).

## Fase 2: El Cerebro Multimodal (Gemini 3.1) ✅
- Implementación de `google-generative-ai`.
- Uso del modelo `gemini-3-flash-preview` para procesamiento directo de audio (sin STT externo).
- Prompting bilingüe: Transcripción en Inglés, explicaciones en Español.

## Fase 3: Respuesta de Voz (TTS) ✅
- Integración de `google-tts-api` para generar audios de corrección.
- Flujo completo: Audio Usuario -> Análisis IA -> Texto -> Audio Pro -> Respuesta Telegram.

## Fase 4: Memoria y Persistencia (Supabase + Prisma) ✅
- **Decisión Crítica:** Se intentó usar Prisma 7, pero debido a inestabilidades con el motor local en Node.js, se realizó un **downgrade a Prisma 6.19.3**.
- Configuración de `schema.prisma` con modelos de `User`, `Session` y `WeakPoint`.
- Conexión exitosa a Supabase usando el Connection Pooler (puerto 6543) para la app y Direct URL (puerto 5432) para migraciones.
- **Resultado:** El bot ahora persiste cada interacción, rastrea 4 métricas (Grammar, Pronunciation, Fluency, Vocab) y detecta errores recurrentes.

## Fase 9: Despliegue y Exhibición en Portfolio (Producción) 🚧
- **Pausa de Fase 7:** Se decidió congelar la monetización para priorizar la exhibición académica del proyecto.
- **Preparación de Build:** Se instaló `tsc-alias` y se actualizó el script de build en `package.json` para asegurar que los "Path Aliases" (`@services/`, `@config/`, etc.) se resuelvan correctamente al transpilar a JavaScript para el servidor VPS. Se verificó la compilación exitosa localmente.

---
*Última actualización: Build local verificado. Iniciando preparación de Git para despliegue.*
