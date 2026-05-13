import { prisma } from '@lib/prisma';
import { Telegraf } from 'telegraf';
import { generateAIChallenge } from '@services/ai.service';
import { saveMessage } from '@services/user.service';
import { EmbeddingService } from './embedding.service';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '@config/env';

/**
 * Servicio encargado de enviar misiones proactivas y PERSONALIZADAS a los alumnos
 */
export const sendDailyChallenges = async (bot: Telegraf) => {
    console.log("⏰ [Cron] Iniciando generación de retos personalizados con IA...");
    
    try {
        // 1. Buscamos usuarios incluyendo sus puntos débiles
        const users = await prisma.user.findMany({
            include: {
                weakPoints: {
                    take: 3,
                    orderBy: { frequency: 'desc' }
                }
            }
        });

        if (users.length === 0) return;

        for (const user of users) {
            const points = user.weakPoints.map(wp => wp.pattern);

            const aiChallenge = await generateAIChallenge(
                user.name || 'estudiante',
                user.level,
                points
            );
            
            try {
                // Enviamos el mensaje
                await bot.telegram.sendMessage(user.telegramId, aiChallenge, { parse_mode: 'Markdown' });
                
                // IMPORTANTE: Guardamos el reto en la memoria del bot para que la próxima 
                // respuesta del usuario tenga contexto.
                await saveMessage(user.id, 'model', aiChallenge);
                
                console.log(`✨ Reto IA enviado y guardado en memoria para ${user.name}`);
            } catch (sendError) {
                console.error(`❌ Falló envío a ${user.telegramId}:`, sendError);
            }
        }
    } catch (error) {
        console.error("❌ Error en sendDailyChallenges:", error);
    }
}

/**
 * REFLEXIÓN NOCTURNA: Consolida los mensajes del día en memorias semánticas
 */
export const consolidateDailyMemories = async () => {
    console.log("🌙 [Cron] Iniciando Reflexión Nocturna (Consolidación de Memoria)...");
    
    try {
        const users = await prisma.user.findMany();
        const model = new GoogleGenerativeAI(env.GEMINI_API_KEY).getGenerativeModel({ model: "gemini-1.5-flash" });

        for (const user of users) {
            // Buscamos mensajes de las últimas 24h
            const messages = await prisma.messageLog.findMany({
                where: {
                    userId: user.id,
                    createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
                },
                orderBy: { createdAt: 'asc' }
            });

            if (messages.length < 3) continue; // No hay suficiente chicha para resumir

            const transcript = messages.map(m => `${m.role === 'user' ? 'Student' : 'Coach'}: ${m.content}`).join('\n');
            
            const prompt = `Analyze this day's chat transcript and extract 1 or 2 key pedagogical insights 
                            about the student's progress or persistent errors. 
                            Format: Short English sentences. Transcript:\n${transcript}`;
            
            const result = await model.generateContent(prompt);
            const insight = result.response.text().trim();

            if (insight) {
                await EmbeddingService.saveMemory(user.id, insight);
                console.log(`🧠 [Memory] Nueva memoria consolidada para ${user.name}`);
            }
        }
    } catch (error) {
        console.error("❌ Error en consolidateDailyMemories:", error);
    }
}
