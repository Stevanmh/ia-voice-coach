# Guía Técnica: AI English Voice Coach

## 🎯 Objetivo Técnico
Sistema de tutoría de voz basado en IA con persistencia de datos para el seguimiento del progreso del alumno.

## 🏗️ Arquitectura General
El sistema sigue un patrón de **Controladores y Servicios** para mantener la lógica de negocio separada del canal de comunicación (Telegram).

### Componentes Clave:
1. **Telegram Controller:** Gestiona la interfaz de usuario en el chat.
2. **AI Service (Gemini 3.1):** Motor multimodal que procesa audio directamente y devuelve JSON estructurado con métricas y justificaciones.
3. **User Service:** Capa de persistencia que gestiona el perfil del alumno en Supabase.
4. **TTS Service:** Genera feedback auditivo para práctica de *shadowing*.

## 📊 Sistema de Evaluación Detallado
El sistema ahora no solo entrega un número, sino que justifica cada métrica:
- **Grammar:** Basado en errores detectados vs correcciones sugeridas.
- **Pronunciation:** Basado en el análisis fonético de palabras clave.
- **Fluency:** Basado en el ritmo, pausas y velocidad del habla.
- **Vocabulary:** Basado en la riqueza léxica comparada con el nivel CEFR del usuario.

### WeakPoint
- Identifica patrones de error recurrentes (ej. "it is" vs "it's").
- Permite al tutor enfocarse en los puntos más débiles del alumno en futuras sesiones.

## ⚠️ Lecciones Aprendidas (Troubleshooting)
### Prisma 7 vs 6
- **Problema:** Prisma 7 requiere adaptadores complejos para ejecución local en Node.js estándar.
- **Solución:** Se utilizó Prisma 6 para garantizar estabilidad en el entorno de desarrollo y compatibilidad nativa con Supabase Connection Pooler.

---
*Documento vivo - Actualizado tras Fase 4.*
