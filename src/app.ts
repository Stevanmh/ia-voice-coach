import { Telegraf } from 'telegraf';
import cron from 'node-cron';
import http from 'http';
import express from 'express';
import compression from 'compression';
import path from 'path';
import WebSocket, { WebSocketServer } from 'ws';
import { env } from '@config/env';
import { setupTelegramRoutes } from '@controllers/telegram.controller';
import { sendDailyChallenges, consolidateDailyMemories } from '@services/challenge.service';
import { EmbeddingService } from '@services/embedding.service';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getLastSessionContext } from '@services/user.service';

const bot = new Telegraf(env.BOT_TOKEN);

// Conectamos las rutas/comandos de Telegram
setupTelegramRoutes(bot);

// --- FASE 5: RETOS PROACTIVOS ---
cron.schedule('0 9,14,21 * * *', () => {
    sendDailyChallenges(bot);
});

// --- FASE 12: REFLEXIÓN NOCTURNA (Cerebro Unificado) ---
cron.schedule('0 0 * * *', () => {
    consolidateDailyMemories();
});

// Configurar el menú nativo de Telegram
bot.telegram.setMyCommands([
    { command: 'stats', description: '📊 Ver mi dashboard de progreso' },
    { command: 'test_cron', description: '🎯 Generar Reto Proactivo Ahora' },
    { command: 'start', description: '🤖 Reiniciar el bot' }
]).catch(err => console.error('Error configurando menú:', err));

// --- CONFIGURACIÓN WEB (Mini App) ---
const app = express();

// OPTIMIZACIÓN: Gzip para todos los assets (incluye el GLB del avatar)
app.use(compression());
app.use(express.json());

// FASE 17/18: Endpoint de perfil para la Mini App con métricas de progreso
app.get('/api/user/:userId/profile', async (req, res) => {
    try {
        const { userId } = req.params;
        const { getOrCreateUser, getUserStats } = await import('@services/user.service');
        const user = await getOrCreateUser(userId);
        const stats = await getUserStats(userId);
        
        res.json({ 
            level: user.level, 
            name: user.name,
            sessionCount: user.sessionCount,
            mode: (user as any).mode,
            stats
        });
    } catch (e) {
        console.error("Error obteniendo perfil:", e);
        res.status(500).json({ error: 'No se pudo obtener el perfil' });
    }
});

// FASE 23: Endpoint para cambiar de modo
app.post('/api/user/:userId/mode', async (req, res) => {
    try {
        const { userId } = req.params;
        const { mode } = req.body;
        const { toggleUserMode } = await import('@services/user.service');
        await toggleUserMode(userId, mode);
        res.json({ success: true, mode });
    } catch (e) {
        console.error("Error cambiando modo:", e);
        res.status(500).json({ error: 'No se pudo cambiar el modo' });
    }
});

// OPTIMIZACIÓN: Caché de 1 año para assets estáticos del cliente
// PERO index.html NUNCA debe cachearse para asegurar que siempre cargue la última versión
app.use(express.static(path.join(__dirname, '../client/dist'), {
    setHeaders: (res, path) => {
        if (path.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache');
        } else {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
    }
}));

// --- FASE 11: INFRAESTRUCTURA WEBSOCKET + GEMINI LIVE PROXY ---
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on('connection', async (ws, req) => {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const userId = url.searchParams.get('userId') || 'guest';
    let sessionTranscript = "";
    
    console.log(`💎 [Live API] Cliente conectado (${userId})`);

    // 1. Cargar contexto histórico
    let historicalContext = "";
    if (userId !== 'guest') {
        try {
            const memories = await EmbeddingService.findRelevant(userId, "General English progress");
            if (memories.length > 0) {
                historicalContext = "\n\nRELEVANT MEMORIES OF THE STUDENT:\n" + 
                    memories.map((m: any) => `- ${m.content}`).join('\n');
            }
        } catch (e) {
            console.error("❌ [Memory Error]:", e);
        }
    }

    // FASE 20: Inyección de la última pregunta del bot
    let lastQuestion = null;
    if (userId !== 'guest') {
        try {
            lastQuestion = await getLastSessionContext(userId);
        } catch (e) {
            console.warn("⚠️ No se pudo cargar lastQuestion", e);
        }
    }

    // FASE 23 & 24: Inyectar modo en el prompt
    let userMode = 'conversation';
    if (userId !== 'guest') {
        const { prisma } = await import('@lib/prisma');
        const u = await prisma.user.findUnique({ where: { id: userId } });
        if (u && u.mode) userMode = u.mode;
    }

    const GEMINI_LIVE_URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${env.GEMINI_API_KEY}`;
    const geminiWs = new WebSocket(GEMINI_LIVE_URL);

    geminiWs.on('open', async () => {
        let sysInstText = `You are a professional English Coach. Focus on pronunciation and grammar. Keep responses under 2 sentences. ALWAYS respond in English, but you can say 1 brief sentence in Spanish if the user struggles. ${historicalContext} ${lastQuestion ? `\nPREVIOUS SESSION BRIDGE: Last time you asked the student: "${lastQuestion}". Reference this naturally if relevant.` : ''}`;
        
        if (userMode === 'shadowing') {
            sysInstText = `MODE: SHADOWING. The user will try to repeat phrases. ONLY evaluate their pronunciation. DO NOT evaluate grammar or start a conversation. If they fail, tell them exactly what sound they failed in Spanish and ask them to repeat. If they succeed, congratulate them and generate a NEW native idiom that uses their weak points: ${historicalContext}. Always speak back naturally.`;
        } else if (userMode.startsWith('roleplay_')) {
            const { ROLEPLAYS } = await import('./data/roleplays');
            const roleplay = ROLEPLAYS[userMode];
            if (roleplay) {
                sysInstText = roleplay.systemInstruction;
            }
        }
            
        const setupMessage = {
            setup: {
                model: "models/gemini-2.0-flash-exp",
                generationConfig: { responseModalities: ["AUDIO"] },
                systemInstruction: {
                    parts: [{ text: sysInstText }]
                }
            }
        };
        geminiWs.send(JSON.stringify(setupMessage));
    });

    // Puente: Gemini -> Servidor -> Navegador
    geminiWs.on('message', (data) => {
        try {
            const dataString = data.toString();
            const response = JSON.parse(dataString);
            
            // Acumular transcripción del Coach para la memoria nocturna
            if (response.serverContent?.modelTurn?.parts) {
                const text = response.serverContent.modelTurn.parts
                    .map((p: any) => p.text)
                    .filter(Boolean)
                    .join(' ');
                if (text) sessionTranscript += `Coach: \${text}\n`;
            }

            if (ws.readyState === WebSocket.OPEN) ws.send(dataString);
        } catch (e) {
            // Si por alguna razón no es JSON, lo enviamos como string igualmente
            if (ws.readyState === WebSocket.OPEN) ws.send(data.toString());
        }
    });

    // Puente: Navegador -> Servidor -> Gemini
    ws.on('message', async (data) => {
        if (geminiWs.readyState !== WebSocket.OPEN) return;
        try {
            const msg = JSON.parse(data.toString());
            
            // FASE 23 & 24: Toggle Mode Command via WebSocket
            if (msg.type === 'command' && msg.command === '/toggle_mode') {
                const { prisma } = await import('@lib/prisma');
                const { toggleUserMode } = await import('@services/user.service');
                const u = await prisma.user.findUnique({ where: { id: userId } });
                if (u) {
                    const newMode = msg.value || (u.mode === 'conversation' ? 'shadowing' : 'conversation');
                    await toggleUserMode(userId, newMode);
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ type: 'mode_update', mode: newMode }));
                    }
                }
                return;
            }

            if (msg.type === 'text') {
                sessionTranscript += `Student: ${msg.data}\n`;
                geminiWs.send(JSON.stringify({
                    clientContent: {
                        turns: [{ role: "user", parts: [{ text: msg.data }] }],
                        turnComplete: true
                    }
                }));
            }
        } catch (e) {
            // Audio Binario
            geminiWs.send(JSON.stringify({
                realtimeInput: {
                    audio: {
                        mimeType: "audio/pcm;rate=16000",
                        data: Buffer.from(data as Buffer).toString('base64')
                    }
                }
            }));
        }
    });

    ws.on('close', async () => {
        console.log(`🔌 [Live API] Cliente desconectado (${userId})`);
        
        // --- APRENDIZAJE POST-SESIÓN ---
        if (sessionTranscript.length > 50 && userId !== 'guest') {
            try {
                console.log("🧠 [Memory] Analizando sesión para el futuro...");
                const model = new GoogleGenerativeAI(env.GEMINI_API_KEY).getGenerativeModel({ model: "gemini-1.5-flash" });
                const prompt = `Analyze this transcript and extract 1 or 2 key pedagogical insights about the student. 
                                Format: Short English sentences. Transcript:\n${sessionTranscript}`;
                const result = await model.generateContent(prompt);
                await EmbeddingService.saveMemory(userId, result.response.text());
            } catch (e) { console.error("❌ [Learning Error]:", e); }
        }

        if (geminiWs.readyState === WebSocket.OPEN || geminiWs.readyState === WebSocket.CONNECTING) {
            geminiWs.close();
        }
    });

    geminiWs.on('close', (code, reason) => { 
        console.log(`Gemini WS Closed: ${code} ${reason}`);
        if (ws.readyState === WebSocket.OPEN) ws.close(); 
    });

    geminiWs.on('error', (err) => {
        console.error("❌ Gemini WS Error:", err);
    });
});


// Lanzamos el Bot
bot.launch()
  .then(() => console.log('🚀 AI English Voice Coach is running on Polling mode...'))
  .catch((err) => console.error('Error starting bot:', err));

// Lanzamos el servidor HTTP para la Mini App
const WS_PORT = process.env.PORT || 3000;
server.listen(WS_PORT, () => {
    console.log(`🌐 Servidor WebSocket escuchando en puerto ${WS_PORT}`);
});

// Graceful shutdown
process.once('SIGINT', () => {
    bot.stop('SIGINT');
    server.close();
});
process.once('SIGTERM', () => {
    bot.stop('SIGTERM');
    server.close();
});
