import { Telegraf } from 'telegraf';
import cron from 'node-cron';
import http from 'http';
import express from 'express';
import path from 'path';
import WebSocket, { WebSocketServer } from 'ws';
import { env } from '@config/env';
import { setupTelegramRoutes } from '@controllers/telegram.controller';
import { sendDailyChallenges, consolidateDailyMemories } from '@services/challenge.service';
import { EmbeddingService } from '@services/embedding.service';
import { GoogleGenerativeAI } from '@google/generative-ai';

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
app.use(express.static(path.join(__dirname, '../client/dist')));

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

    const GEMINI_LIVE_URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${env.GEMINI_API_KEY}`;
    const geminiWs = new WebSocket(GEMINI_LIVE_URL);

    geminiWs.on('open', () => {
        const setupMessage = {
            setup: {
                model: "models/gemini-3.1-flash-live-preview",
                generationConfig: { responseModalities: ["AUDIO"] },
                systemInstruction: {
                    parts: [{ 
                        text: `You are a professional English Coach. Focus on pronunciation and grammar. ${historicalContext}` 
                    }]
                }
            }
        };
        geminiWs.send(JSON.stringify(setupMessage));
    });

    // Puente: Gemini -> Servidor -> Navegador
    geminiWs.on('message', (data) => {
        try {
            const response = JSON.parse(data.toString());
            
            // Acumular transcripción del Coach
            if (response.serverContent?.modelTurn?.parts) {
                const text = response.serverContent.modelTurn.parts.map((p: any) => p.text).join(' ');
                if (text) sessionTranscript += `Coach: ${text}\n`;
            }

            if (ws.readyState === WebSocket.OPEN) ws.send(data);
        } catch (e) {
            if (ws.readyState === WebSocket.OPEN) ws.send(data); // Probablemente audio binario
        }
    });

    // Puente: Navegador -> Servidor -> Gemini
    ws.on('message', (data) => {
        if (geminiWs.readyState !== WebSocket.OPEN) return;
        try {
            const msg = JSON.parse(data.toString());
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

    geminiWs.on('close', () => { if (ws.readyState === WebSocket.OPEN) ws.close(); });
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
