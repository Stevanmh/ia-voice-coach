import { prisma } from '@lib/prisma';
import { TutorFeedbackV3 } from '@interfaces/tutor.interface';

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

    return session;
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
