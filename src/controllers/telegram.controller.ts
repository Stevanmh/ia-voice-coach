import { Context, Telegraf, Markup } from 'telegraf';
import { cleanupFiles } from '@utils/cleanup.util';
import { downloadAndConvertAudio } from '@services/audio.service';
import { analyzeVoiceAndProvideFeedback } from '@services/ai.service';
import { generateTTSAudio } from '@services/tts.service';
import { getOrCreateUser, saveUserSession, getUserStats, getTopWeakPoints, getChatHistory, saveMessage, updateUserLevel } from '@services/user.service';

export const setupTelegramRoutes = (bot: Telegraf) => {
    // Lógica reutilizable para mostrar estadísticas
    const handleStats = async (ctx: Context) => {
        // Si viene de un botón, quitamos el estado de "cargando"
        if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => {});
        
        console.log("📊 Comando /stats o botón recibido de:", ctx.from?.first_name);
        try {
            if (!ctx.from) return;
            
            // 1. Buscamos al usuario y sus datos agregados
            const user = await getOrCreateUser(ctx.from.id.toString(), ctx.from.first_name);
            const stats = await getUserStats(user.id);
            
            // 2. Buscamos sus puntos débiles
            const weakPoints = await getTopWeakPoints(user.id);
            
            if (stats.totalSessions === 0) {
                return await ctx.reply(
                    "¡Aún no tienes estadísticas! 🤷‍♂️\n\nMándame tu primer audio para empezar a medir tu progreso."
                );
            }

            // 3. Formateamos los Puntos Críticos en texto
            let weakPointsText = "✅ ¡Sin errores graves detectados aún!";
            if (weakPoints.length > 0) {
                weakPointsText = weakPoints
                    .map((wp, i) => `${i + 1}. *${wp.pattern}* (${wp.frequency} veces)`)
                    .join('\n');
            }

            // 4. Formateamos el Dashboard Visual
            const message = 
                `📊 *Tu Dashboard de Progreso - ${user.name}*\n\n` +
                `🔢 Sesiones totales: *${stats.totalSessions}*\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `✍️ *Gramática:* ${stats.grammarAvg}/100\n` +
                `🗣️ *Pronunciación:* ${stats.pronAvg}/100\n` +
                `🌊 *Fluidez:* ${stats.fluencyAvg}/100\n` +
                `📚 *Vocabulario:* ${stats.vocabAvg}/100\n` +
                `━━━━━━━━━━━━━━━━━━━━\n\n` +
                `⚠️ *Puntos a reforzar (Top 3):*\n` +
                `${weakPointsText}\n\n` +
                `💪 ¡Sigue practicando para mejorar tus promedios!`;

            await ctx.reply(message, { parse_mode: 'Markdown' });

        } catch (error) {
            console.error("❌ Error en comando /stats:", error);
            ctx.reply("Hubo un problema al obtener tus estadísticas.");
        }
    };

    // Escuchar tanto el comando como el botón
    bot.hears(/^\/stats/, handleStats);
    bot.action('show_stats', handleStats);

    // Comando secreto para probar el Cron Manualmente
    bot.hears(/^\/test_cron/, async (ctx) => {
        const from = ctx.from;
        if (!from) return;
        console.log("🛠️ Forzando ejecución de cron para pruebas...");
        await ctx.reply("🛠️ Iniciando motor proactivo manualmente...");
        const { sendDailyChallenges } = await import('@services/challenge.service');
        await sendDailyChallenges(bot);
    });


    // Comando de inicio blindado
    bot.start(async (ctx) => {
        try {
            if (!ctx.from) return;
            
            const user = await getOrCreateUser(ctx.from.id.toString(), ctx.from.first_name);
            
            if (user.sessionCount > 0) {
                return await ctx.reply(
                    `¡Hola de nuevo, *${user.name}*! 👋\n\n` +
                    `Es genial verte otra vez. Actualmente tienes un nivel estimado de *${user.level}*.\n` +
                    `Hemos tenido *${user.sessionCount}* sesiones de práctica juntos. \n\n` +
                    `¿Qué tal si practicamos un poco ahora? Mándame un audio y te daré feedback al instante. 🎙️`,
                    { parse_mode: 'Markdown' }
                );
            }

            await ctx.reply(
                `¡Hola *${user.name}*! Soy tu Coach de Inglés con IA. 🤖🇬🇧\n\n` +
                `Estoy aquí para ayudarte a mejorar tu pronunciación y gramática de forma real.\n\n` +
                `👉 *¿Cómo funciona?*\n` +
                `1. Me mandas un mensaje de voz en inglés.\n` +
                `2. Yo analizo tu voz, te corrijo y te doy una nota.\n` +
                `3. Te envío un audio con la pronunciación perfecta para que repitas.\n\n` +
                `¡Empecemos ahora! Cuéntame algo sobre ti en un audio corto.`,
                { parse_mode: 'Markdown' }
            );
        } catch (error) {
            console.error("❌ Error en comando /start:", error);
            ctx.reply("Hubo un problema al iniciar. Por favor intenta de nuevo.");
        }
    });

  bot.on('voice', async (ctx: Context) => {
    const voiceMsg = ctx.message && "voice" in ctx.message ? ctx.message.voice : null;
    const from = ctx.from;
    if (!voiceMsg || !from) return;
    
    await ctx.reply('⏳ Escuchando y analizando tu voz con IA...');
    
    try {
        // 1. Obtener o crear usuario y su historial de chat
        const user = await getOrCreateUser(from.id.toString(), from.first_name);
        const chatHistory = await getChatHistory(user.id);

        // 2. Procesar audio
        const fileLink = await ctx.telegram.getFileLink(voiceMsg.file_id);
        const finalMp3Path = await downloadAndConvertAudio(fileLink, voiceMsg.file_id);
        
        // 3. Inferencia Multimodal Conversacional (V2)
        const feedback = await analyzeVoiceAndProvideFeedback(finalMp3Path, user.name || "Estudiante", chatHistory);
        
        // 4. Persistencia: Sesión, Mensajes (Memoria) y Nivel
        try {
            await saveUserSession(user.id, feedback, feedback.original_transcript);
            await saveMessage(user.id, 'user', feedback.original_transcript);
            await saveMessage(user.id, 'model', feedback.follow_up_question);
            
            // Si el nivel cambió, lo actualizamos
            if (feedback.estimated_cefr_level !== user.level) {
                await updateUserLevel(user.id, feedback.estimated_cefr_level);
            }
        } catch (dbError) {
            console.error("Error en persistencia V2:", dbError);
        }

        // 5. Respuesta 1: EL COACH (Conversación Natural + Audio TTS)
        const coachReply = `${feedback.encouragement_message}\n\n🎙️ *${feedback.follow_up_question}*\n_(Traducción: ${feedback.follow_up_translation})_`;
        
        await ctx.reply(coachReply, { 
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                Markup.button.callback('📊 Ver mis promedios', 'show_stats')
            ])
        });

        // 6. Respuesta 2: LA PIZARRA DEL PROFESOR (Feedback Técnico)
        let lessonText = `👨‍🏫 *La Pizarra del Profe*\n\n`;
        lessonText += `📝 *Escuché:* "${feedback.original_transcript}"\n`;
        lessonText += `✅ *Corrección:* "${feedback.corrected_version}"\n`;
        lessonText += `_(Significa: ${feedback.corrected_version_translation})_\n\n`;

        if (feedback.grammar_errors.length > 0) {
            lessonText += `━━━━━ DETALLES ━━━━━\n`;
            for (const error of feedback.grammar_errors) {
                lessonText += `❌ *Error:* "${error.error}"\n`;
                lessonText += `✅ *Corrección:* "${error.correction}"\n`;
                lessonText += `📖 *Regla:* ${error.rule}\n`;
                lessonText += `💡 *Ejemplos:*\n`;
                error.examples.forEach(ex => {
                    lessonText += `   • OK: _${ex.correct}_\n`;
                    lessonText += `   • NO: _${ex.incorrect}_\n`;
                });
                lessonText += `\n`;
            }
        }
        
        await ctx.reply(lessonText, { parse_mode: 'Markdown' });

        // 7. Audio de Corrección (TTS del follow-up para practicar oído)
        try {
            const ttsPath = await generateTTSAudio(feedback.follow_up_question, voiceMsg.file_id);
            await ctx.sendVoice({ source: ttsPath }, { caption: '🔊 Escucha la pregunta del Coach' });
            
            await cleanupFiles([finalMp3Path, finalMp3Path.replace('.mp3', '.ogg'), ttsPath]);
        } catch (ttsError) {
            console.error("Error enviando TTS:", ttsError);
            await cleanupFiles([finalMp3Path, finalMp3Path.replace('.mp3', '.ogg')]);
        }
        
    } catch (error) {
        console.error("Error en Telegram Controller:", error);
        await ctx.reply('❌ Lo siento, hubo un error analizando tu audio. Por favor intenta de nuevo.');
    }
  });
};
