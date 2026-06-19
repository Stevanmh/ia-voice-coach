import { prisma } from '@lib/prisma';
import { TutorFeedbackV3 } from '@interfaces/tutor.interface';
import { CEFR_CURRICULUM } from '../data/curriculum';

export const getOrCreateUser = async (telegramId: string, name?: string) => {
    return await prisma.user.upsert({
        where: { telegramId: telegramId.toString() },
        update: { name },
        create: { 
            telegramId: telegramId.toString(),
            name,
            level: 'A1',
            goal: 'conversation'
        }
    });
};

export const saveUserSession = async (
    userId: string, 
    feedback: TutorFeedbackV3, 
    transcript: string
) => {
    // 1. Guardar la sesión
    const session = await prisma.session.create({
        data: {
            userId,
            transcript: feedback.original_transcript,
            corrected: feedback.corrected_version,
            grammarScore: feedback.scores.grammar,
            pronunciationScore: feedback.scores.pronunciation,
            fluencyScore: feedback.scores.fluency,
            vocabScore: feedback.scores.vocabulary,
        }
    });

    // 2. Incrementar contador de sesiones del usuario
    await prisma.user.update({
        where: { id: userId },
        data: { sessionCount: { increment: 1 } }
    });

    // FASE 21: Curriculum Mastery
    if (feedback.topic_mastered) {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (user && user.currentTopic) {
            await prisma.user.update({
                where: { id: userId },
                data: {
                    completedTopics: { push: user.currentTopic },
                    currentTopic: null
                }
            });
        }
    }

    // 3. Registrar puntos débiles (Tarea 10.5: Basado en key_error y minor_errors)
    const errorsToTrack = [
        { pattern: feedback.key_error.pattern, type: 'grammar' as const },
        ...feedback.minor_errors.map(e => ({ pattern: e.what.substring(0, 50), type: 'grammar' as const }))
    ];

    for (const error of errorsToTrack) {
        if (!error.pattern) continue;

        await prisma.weakPoint.upsert({
            where: {
                userId_type_pattern: {
                    userId,
                    type: error.type,
                    pattern: error.pattern
                }
            },
            update: {
                frequency: { increment: 1 },
                lastSeen: new Date()
            },
            create: {
                userId,
                type: error.type,
                pattern: error.pattern,
                frequency: 1
            }
        });
    }

    // 4. FASE 19: Guardar nuevo vocabulario para Spaced Repetition
    if (feedback.new_vocabulary && feedback.new_vocabulary.length > 0) {
        for (const vocab of feedback.new_vocabulary) {
            try {
                await prisma.vocabulary.upsert({
                    where: {
                        userId_word: {
                            userId,
                            word: vocab.word.toLowerCase()
                        }
                    },
                    update: {}, // Si ya existe, no hacemos nada (mantiene su progreso Leitner)
                    create: {
                        userId,
                        word: vocab.word.toLowerCase(),
                        translation: vocab.meaning,
                        nextReview: new Date(Date.now() + 24 * 60 * 60 * 1000) // Primer repaso: mañana
                    }
                });
            } catch (e) {
                console.error("Error guardando vocabulario:", e);
            }
        }
    }

    return session;
};

// FASE 19: Extraer palabras que tocan repasar hoy
export const getWordsToReviewToday = async (userId: string): Promise<string[]> => {
    const today = new Date();
    
    const words = await prisma.vocabulary.findMany({
        where: {
            userId,
            nextReview: { lte: today },
            status: { not: 'mastered' }
        },
        take: 2 // Máximo 2 palabras por sesión para no saturar
    });
    
    // Al extraerlas, actualizamos su intervalo (Leitner simple: x2 días)
    // En un sistema real esto se hace DESPUÉS de que responda bien, 
    // pero para este MVP lo hacemos al enviarlas.
    for (const w of words) {
        const nextInterval = w.interval * 2;
        await prisma.vocabulary.update({
            where: { id: w.id },
            data: {
                interval: nextInterval,
                nextReview: new Date(Date.now() + nextInterval * 24 * 60 * 60 * 1000),
                status: nextInterval > 14 ? 'mastered' : 'reviewing'
            }
        });
    }

    return words.map(w => w.word);
};

export const getUserStats = async (userId: string) => {
    const stats = await prisma.session.aggregate({
        where: { userId },
        _avg: {
            grammarScore: true,
            pronunciationScore: true,
            fluencyScore: true,
            vocabScore: true
        },
        _count: {
            id: true
        }
    });

    return {
        totalSessions: stats._count.id,
        grammarAvg: Math.round(stats._avg.grammarScore || 0),
        pronAvg: Math.round(stats._avg.pronunciationScore || 0),
        fluencyAvg: Math.round(stats._avg.fluencyScore || 0),
        vocabAvg: Math.round(stats._avg.vocabScore || 0)
    };
};

export const getTopWeakPoints = async (userId: string) => {
    return await prisma.weakPoint.findMany({
        where: { userId },
        orderBy: {
            frequency: 'desc'
        },
        take: 3
    });
};

export const getChatHistory = async (userId: string, limit: number = 6) => {
    const messages = await prisma.messageLog.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit
    });
    return messages.reverse()
        .map(m => `${m.role === 'user' ? 'Estudiante' : 'Coach'}: ${m.content}`)
        .join('\n');
};

export const saveMessage = async (userId: string, role: 'user' | 'model', content: string) => {
    return await prisma.messageLog.create({
        data: { userId, role, content }
    });
};

export const updateUserLevel = async (userId: string, newLevel: string) => {
    return await prisma.user.update({
        where: { id: userId },
        data: { level: newLevel }
    });
};

// FASE 20: Extraer contexto de la última sesión (la última pregunta del bot)
export const getLastSessionContext = async (userId: string): Promise<string | null> => {
    const lastMessage = await prisma.messageLog.findFirst({
        where: { userId, role: 'model' },
        orderBy: { createdAt: 'desc' }
    });
    return lastMessage?.content ?? null;
};

// FASE 21: Asignar el siguiente tema del currículo
export const assignNextTopic = async (userId: string) => {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return null;

    if (user.currentTopic) {
        // Encontrar el objeto de tema completo para devolverlo
        for (const level of Object.keys(CEFR_CURRICULUM)) {
            const topic = CEFR_CURRICULUM[level].find(t => t.id === user.currentTopic);
            if (topic) return topic;
        }
        return null;
    }

    // Asignar un nuevo tema basado en su nivel
    const levelTopics = CEFR_CURRICULUM[user.level] || CEFR_CURRICULUM['A1'];
    const nextTopic = levelTopics.find(t => !user.completedTopics.includes(t.id));

    if (nextTopic) {
        await prisma.user.update({
            where: { id: userId },
            data: { currentTopic: nextTopic.id }
        });
        return nextTopic;
    }

    return null; // Si ya completó todos los temas de su nivel
};

// FASE 23: Cambiar modo de usuario (conversation vs shadowing)
export const toggleUserMode = async (userId: string, mode: 'conversation' | 'shadowing') => {
    return await prisma.user.update({
        where: { id: userId },
        data: { mode }
    });
};
