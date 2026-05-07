# Technical Guide: AI English Voice Coach

## 🎯 Objetivo Técnico
Desarrollar un sistema de tutoría lingüística asíncrono y proactivo, basado en arquitectura de microservicios lógicos. El sistema procesa inputs de voz nativos, realiza inferencia multimodal mediante LLMs para generar evaluaciones estructuradas, y mantiene la persistencia del estado cognitivo del usuario para adaptar dinámicamente la dificultad (CEFR).

## 🏗️ Arquitectura de Procesamiento (Pipeline)

El sistema implementa un pipeline de datos lineal y no bloqueante para el procesamiento de medios:
1. **Ingesta:** Recepción de audio nativo de Telegram (`.oga`).
2. **Transcodificación (FFmpeg):** Normalización de la onda de audio a `.mp3` (Mono, 16kHz) optimizado para latencia en modelos neuronales.
3. **Inferencia Multimodal (Gemini):** Análisis directo de la onda de sonido y texto en una sola pasada.
4. **Persistencia (Prisma):** Inserción transaccional de métricas y metadatos.
5. **Feedback Loop (TTS):** Síntesis de voz para corrección en shadowing.

## 🧩 Módulos Core del Sistema

### 1. Audio Processing Engine (FFmpeg)
Maneja la conversión de los códecs propietarios de Telegram. Se definió una tasa de muestreo de 16kHz en un solo canal (Mono) como estándar arquitectónico. Esto reduce el tamaño del payload enviado a la API de IA en un 70% sin perder fidelidad fonética, mitigando cuellos de botella en red.

### 2. Cognitive Engine & Prompt Engineering (Gemini 3.1 Flash)
En lugar de depender de una arquitectura en cascada clásica (STT -> LLM), el sistema utiliza inferencia multimodal nativa.
*   **Zero-Shot JSON Schema:** Se implementó un *system prompt* estricto que obliga a la IA a devolver un árbol JSON validable en runtime.
*   **Chat Memory Injector:** El módulo hidrata el prompt con los últimos N mensajes de la sesión actual, dotando al LLM de persistencia de contexto conversacional real.

### 3. Persistence & State Layer (Prisma + Supabase)
Diseño de base de datos relacional orientada a eventos de aprendizaje.
*   **Seguimiento Granular:** Se almacenan vectores de puntuación independientes (Gramática, Pronunciación, Fluidez, Vocabulario).
*   **WeakPoint Algorithm:** Motor estadístico que identifica y agrupa patrones de error sintáctico o fonético para ser explotados en el futuro.

### 4. Proactive Orchestration (Cron Engine)
Transición de un bot reactivo a un sistema proactivo. Un daemon (`node-cron`) barre la base de datos para recuperar perfiles inactivos y `WeakPoints`, inyectándolos en Gemini para generar y emitir retos conversacionales (Roleplay) no solicitados, aumentando el *engagement* del usuario.

## 📈 Sistema de Evaluación Dinámica (CEFR)
El motor calibra la dificultad de sus respuestas evaluando la desviación estándar del progreso del alumno, ajustando dinámicamente la variable **CEFR** (Common European Framework of Reference) desde A1 hasta C2 de forma autónoma en la base de datos.

## 🐳 Estrategia de Despliegue (Contenedorización)
Para garantizar la inmutabilidad de la infraestructura y resolver la dependencia binaria de FFmpeg en el sistema host, el proyecto está completamente dockerizado.
*   **Base Image:** `node:20-slim` (Minimiza superficie de ataque).
*   **Integración de SO:** Instalación de dependencias C++ y códecs de audio en tiempo de construcción del contenedor.
*   **Volume Mapping:** Aislamiento de la carpeta de procesamiento temporal (`/temp`) hacia el host para prevenir *memory leaks* y saturación del contenedor de aplicación.

---
*Documentación de Arquitectura de Software - Revisión: Fase 9 (Producción).*
