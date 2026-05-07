import { Telegraf } from 'telegraf';
import cron from 'node-cron';
import { env } from '@config/env';
import { setupTelegramRoutes } from '@controllers/telegram.controller';
import { sendDailyChallenges } from '@services/challenge.service';

const bot = new Telegraf(env.BOT_TOKEN);

// Conectamos las rutas/comandos de Telegram
setupTelegramRoutes(bot);

// --- FASE 5: RETOS PROACTIVOS ---
// Configuramos un cron que se ejecuta tres veces al día: 9 AM, 2 PM y 9 PM
cron.schedule('0 9,14,21 * * *', () => {
    sendDailyChallenges(bot);
});

// Configurar el menú nativo de Telegram (Botón azul de Menú)
bot.telegram.setMyCommands([
    { command: 'stats', description: '📊 Ver mi dashboard de progreso' },
    { command: 'test_cron', description: '🎯 Generar Reto Proactivo Ahora' },
    { command: 'start', description: '🤖 Reiniciar el bot' }
]).catch(err => console.error('Error configurando menú:', err));

bot.launch()
  .then(() => console.log('🚀 AI English Voice Coach is running on Polling mode...'))
  .catch((err) => console.error('Error starting bot:', err));

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
