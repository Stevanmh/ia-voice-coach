# Guía Técnica: AI English Voice Coach

## 🎯 Objetivo Técnico
Sistema de tutoría de voz basado en IA con persistencia de datos para el seguimiento del progreso del alumno, enfocado en feedback multimodal inmediato.

## 🏗️ Arquitectura General
El sistema sigue un patrón de **Controladores y Servicios** para desacoplar la lógica de negocio del canal de comunicación (Telegram).

### Componentes Clave:
1. **Telegram Controller:** Gestiona la interfaz de usuario, botones inline y comandos nativos.
2. **AI Service (Gemini 3.1 Flash):** Motor multimodal que procesa audio directamente (.mp3/16kHz) y genera evaluaciones pedagógicas en JSON.
3. **User Service:** Capa de persistencia que gestiona perfiles, sesiones y métricas en Supabase.
4. **TTS Service (Google Cloud):** Genera audio de alta fidelidad para la práctica de *shadowing* y correcciones.
5. **Challenge Service (Proactivo):** Motor basado en `node-cron` que analiza los `WeakPoints` del usuario para generar retos lingüísticos personalizados.
6. **Chat Memory Engine:** Sistema de gestión de contexto que inyecta el historial de mensajes a la IA para mantener conversaciones coherentes.

## 📊 Sistema de Evaluación y Progreso
El sistema no solo entrega puntajes, sino que justifica pedagógicamente cada métrica:
- **Grammar & Vocabulary:** Basado en errores detectados vs. nivel **CEFR** dinámico (A1-C2).
- **Pronunciation & Fluency:** Análisis del ritmo y fonética mediante el modelo multimodal.

### Algoritmo de WeakPoints
- Identifica patrones de error recurrentes (ej. "pronombres personales", "pasado simple").
- Estos puntos alimentan al `Challenge Service` para sesiones de refuerzo dirigidas.

## ⚙️ Stack Tecnológico
- **Runtime:** Node.js 20 LTS
- **Lenguaje:** TypeScript 5.x (con Path Aliases `@services/*`, etc.)
- **ORM:** Prisma 6 (Rollback estratégico desde v7 para estabilidad local)
- **DB:** PostgreSQL (Supabase)
- **Multimedia:** FFmpeg (Transcodificación de .oga a .mp3)

## ⚠️ Lecciones Aprendidas (Troubleshooting)
### Gestión de Aliases en Producción
Para el despliegue en VPS, se implementó `tsc-alias` para resolver las rutas de TypeScript en el código compilado final, evitando errores de módulo no encontrado en Node.js nativo.

---
*Documento vivo - Actualizado tras Fase 8: Tutor Proactivo y Conversacional.*
