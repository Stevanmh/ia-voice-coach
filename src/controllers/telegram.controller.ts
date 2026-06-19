import { Context, Telegraf, Markup } from 'telegraf';
import { cleanupFiles } from '@utils/cleanup.util';
import { downloadAndConvertAudio } from '@services/audio.service';
import { analyzeVoiceAndProvideFeedback } from '@services/ai.service';
import { generateTTSAudio } from '@services/tts.service';
import { getOrCreateUser, saveUserSession, getUserStats, getTopWeakPoints, getChatHistory, saveMessage, updateUserLevel, getWordsToReviewToday, getLastSessionContext, assignNextTopic, toggleUserMode } from '@services/user.service';

const shadowingPhrases = new Map<string, string>();

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
    
    // TAREA 10.7: UX de Latencia Percibida
    // Iniciamos indicador de "typing" cada 4s mientras Gemini procesa
    const typingInterval = setInterval(() => {
        ctx.sendChatAction('typing').catch(() => {});
    }, 4000);

    const initialMsg = await ctx.reply('⏳ Escuchando y analizando tu voz...');
    
    try {
        // 1. Obtener usuario
        const user = await getOrCreateUser(from.id.toString(), from.first_name);

        // FASE 19 & 20: Extraer palabras y contexto de sesión anterior
        const wordsToReview = await getWordsToReviewToday(user.id);
        const lastQuestion = await getLastSessionContext(user.id);
        const activeTopic = await assignNextTopic(user.id);

        // 2. Procesar audio (Descarga y Conversión)
        const fileLink = await ctx.telegram.getFileLink(voiceMsg.file_id);
        const finalMp3Path = await downloadAndConvertAudio(fileLink, voiceMsg.file_id);
        
        // 3. Inferencia V3 (Thinking: 0) con RAG, Spaced Repetition, Contexto y Currículo
        const targetPhrase = shadowingPhrases.get(user.id) || null;
        
        const feedbackRaw = await analyzeVoiceAndProvideFeedback(
            user.id,
            finalMp3Path, 
            user.name || "Estudiante", 
            user.level,
            wordsToReview,
            lastQuestion,
            activeTopic,
            user.mode,
            targetPhrase
        );
        
        // Detenemos el indicador de escritura ya que tenemos la respuesta
        clearInterval(typingInterval);

        // FASE 23: Flujo de Shadowing
        if (user.mode === 'shadowing' && targetPhrase) {
            const shadowFb = feedbackRaw as any;
            let message = `🦜 *Evaluación de Shadowing*\n\n`;
            message += `🗣️ Tu intento: _"${shadowFb.original_transcript}"_\n`;
            message += `🎯 Puntaje: *${shadowFb.pronunciation_score}/100*\n\n`;
            
            if (shadowFb.passed) {
                message += `✅ ¡Excelente! Pasaste la prueba.\n\n`;
                message += `Siguiente frase:\n\`${shadowFb.next_phrase}\`\n_(Traducción: ${shadowFb.next_phrase_es})_`;
                shadowingPhrases.set(user.id, shadowFb.next_phrase);
            } else {
                message += `❌ No superaste el 85%.\n💡 *Corrección:* ${shadowFb.feedback_es}\n\n`;
                message += `Vuelve a intentarlo:\n\`${targetPhrase}\``;
            }

            await ctx.reply(message, { parse_mode: 'Markdown' });
            
            try {
                const phraseToSpeak = shadowFb.passed ? shadowFb.next_phrase : targetPhrase;
                const ttsPath = await generateTTSAudio(phraseToSpeak, voiceMsg.file_id);
                await ctx.sendVoice({ source: ttsPath }, { caption: '🔊 Escucha la pronunciación correcta' });
                await cleanupFiles([finalMp3Path, finalMp3Path.replace('.mp3', '.ogg'), ttsPath]);
            } catch (e) {
                await cleanupFiles([finalMp3Path, finalMp3Path.replace('.mp3', '.ogg')]);
            }
            
            await ctx.telegram.deleteMessage(ctx.chat!.id, initialMsg.message_id).catch(() => {});
            return;
        }

        // Flujo de Conversación Normal
        const feedback = feedbackRaw as any;

        // 4. TAREA 10.5: Persistencia en paralelo (Ahorro ~150ms)
        try {
            await Promise.all([
                saveUserSession(user.id, feedback, feedback.original_transcript),
                saveMessage(user.id, 'user', feedback.original_transcript),
                saveMessage(user.id, 'model', feedback.follow_up),
                ...(feedback.cefr !== user.level ? [updateUserLevel(user.id, feedback.cefr)] : [])
            ]);
        } catch (dbError) {
            console.error("⚠️ Error silencioso en persistencia DB:", dbError);
        }

        // 5. TAREA 10.6: Formateador V3 - LA PIZARRA (Jerarquizada)
        let lessonText = `👨‍🏫 *La Pizarra*\n\n`;
        lessonText += `📝 _"${feedback.original_transcript}"_\n\n`;
        lessonText += `✅ _"${feedback.corrected_version}"_\n\n`;
        lessonText += `_(Traducción: ${feedback.corrected_version_es})_\n\n`;
        lessonText += `🔑 *Error clave — ${feedback.key_error.pattern}*\n`;
        lessonText += `❌ ${feedback.key_error.what} → ✅ ${feedback.key_error.fix}\n`;
        lessonText += `📌 Tu caso: \`${feedback.key_error.your_case}\`\n`;

        if (feedback.minor_errors && feedback.minor_errors.length > 0) {
            lessonText += `\n━━ *También:*\n`;
            feedback.minor_errors.forEach((err: any) => {
                lessonText += `• ${err.what} → ${err.fix}\n`;
            });
        }
        
        await ctx.reply(lessonText, { parse_mode: 'Markdown' });

        // 6. TAREA 10.6: Formateador V3 - EL COACH (Compacto)
        const coachReply = 
            `${feedback.coach_comment}\n\n` +
            `🎙️ *${feedback.follow_up}*\n` +
            `_(Traducción: ${feedback.follow_up_es})_`;
        
        await ctx.reply(coachReply, { 
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                Markup.button.callback('📊 Estadísticas', 'show_stats')
            ])
        });

        // 7. Audio TTS y Limpieza
        try {
            const ttsPath = await generateTTSAudio(feedback.follow_up, voiceMsg.file_id);
            await ctx.sendVoice({ source: ttsPath }, { caption: '🔊 Escucha al Coach' });
            
            await cleanupFiles([finalMp3Path, finalMp3Path.replace('.mp3', '.ogg'), ttsPath]);
        } catch (ttsError) {
            console.error("❌ Error en TTS:", ttsError);
            await cleanupFiles([finalMp3Path, finalMp3Path.replace('.mp3', '.ogg')]);
        }
        
        // Borramos el mensaje de "analizando"
        await ctx.telegram.deleteMessage(ctx.chat!.id, initialMsg.message_id).catch(() => {});

    } catch (error) {
        clearInterval(typingInterval);
        console.error("❌ Error crítico en Controller:", error);
        await ctx.reply('❌ Lo siento, la IA está saturada. ¿Puedes intentar de nuevo?');
    }
  });
};
