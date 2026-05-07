import * as googleTTS from 'google-tts-api';
import fs from 'fs';
import path from 'path';
import { finished } from 'stream/promises';

export const generateTTSAudio = async (text: string, fileId: string): Promise<string> => {
    try {
        // 1. Obtener la URL del audio (máximo 200 caracteres por fragmento en la versión gratuita)
        const url = googleTTS.getAudioUrl(text, {
            lang: 'en-US',
            slow: false,
            host: 'https://translate.google.com',
        });

        // 2. Definir la ruta del archivo temporal
        const ttsPath = path.join(process.cwd(), 'temp', `tts_${fileId}.mp3`);

        // 3. Descargar el audio usando fetch nativo de Node 20
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Fallo al descargar TTS: ${response.statusText}`);
        
        const fileStream = fs.createWriteStream(ttsPath);
        
        // En Node 20, fetch devuelve un Web Stream. Lo convertimos a Node Stream:
        const { Readable } = await import('stream');
        // @ts-ignore
        const nodeStream = Readable.fromWeb(response.body);
        
        await finished(nodeStream.pipe(fileStream));

        return ttsPath;
    } catch (error) {
        console.error("Error en TTS Service:", error);
        throw new Error("No se pudo generar el audio de corrección");
    }
};
