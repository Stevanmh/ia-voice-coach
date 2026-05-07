import { prisma } from '@lib/prisma';
import { Telegraf } from 'telegraf';
import { generateAIChallenge } from '@services/ai.service';
import { saveMessage } from '@services/user.service';

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
