import { useEffect, useState, useRef } from 'react'
// Leemos window.Telegram.WebApp en tiempo de ejecución, no en tiempo de importación
// Esto evita el race condition donde el SDK captura el objeto antes de que Telegram lo inyecte
const getTWA = () => (window as any).Telegram?.WebApp ?? {};
import { CoachAvatar } from './components/CoachAvatar'
import { ProgressBar } from './components/ProgressBar'

// FASE 22: Constantes para detección de silencio
const SILENCE_THRESHOLD = 0.005;
const SILENCE_TIMEOUT_FRAMES = 420; // 7 segundos a ~60fps
const SILENCE_PROMPTS = [
  "No rush. Take your time, I'm right here.",
  "Feeling stuck? Describe it in Spanish and I'll teach you the English word!",
  "Try this: start with 'Yesterday, I...' and tell me anything that happened.",
];

function App() {
  const [isCalling, setIsCalling] = useState(false)
  const [status, setStatus] = useState('Listo para practicar')
  const [transcript, setTranscript] = useState('')

  type UserProfile = { 
    level: string; 
    name: string; 
    sessionCount: number;
    mode?: string;
    stats?: {
      grammarAvg: number;
      pronAvg: number;
      fluencyAvg: number;
      vocabAvg: number;
    }
  }
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  
  // FASE 23 & 24: Estado para el modo activo
  const [appMode, setAppMode] = useState<string>('conversation');

  // FASE 17: Control de velocidad de habla del Coach (0.5 = lento, 1.0 = normal)
  const [speechRate, setSpeechRate] = useState<number>(1.0);

  // Referencias para el motor de audio profesional
  const socketRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const playbackContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  
  // Gestión de la cola de reproducción (Audio Stack)
  const audioStack = useRef<Float32Array[]>([]);
  const isPlayingRef = useRef(false);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const isInterruptedRef = useRef(false);
  const analyserRef = useRef<AnalyserNode | null>(null);

  // FASE 22: Referencias para el detector de silencio
  const silenceFramesRef = useRef<number>(0);
  const silenceCooldownRef = useRef<boolean>(false);

  // FASE 17: GainNode para control de VOLUMEN (sin distorsión de pitch)
  const gainNodeRef = useRef<GainNode | null>(null);

  useEffect(() => {
    try {
      getTWA().expand?.();
      getTWA().ready?.();
    } catch (e) {
      console.warn("Telegram WebApp SDK no disponible");
    }

    // FASE 17 & 23: Cargar perfil del usuario para velocidad adaptativa y modo
    const userId = getTWA().initDataUnsafe?.user?.id || 'guest';
    if (userId !== 'guest') {
        fetch(`/api/user/${userId}/profile`)
            .then(r => r.json())
            .then(data => {
              setUserProfile(data);
              if (data.mode) setAppMode(data.mode);
            })
            .catch(() => console.warn('No se pudo cargar el perfil'));
    }

    return () => {
      stopCall();
    }
  }, [])

  // isGuest como estado reactivo: Telegram puede inyectar initData ligeramente después del primer render
  const [isGuest, setIsGuest] = useState<boolean>(true);
  useEffect(() => {
    const check = () => {
      const hasUser = !!getTWA().initDataUnsafe?.user?.id;
      setIsGuest(!hasUser);
    };
    check();
    // Dar 500ms a Telegram para inyectar los datos si aún no lo hizo
    const t = setTimeout(check, 500);
    return () => clearTimeout(t);
  }, []);

  // Referencia para el reloj de sincronización
  const nextStartTimeRef = useRef<number>(0);

  // Algoritmo de Streaming (Encadenamiento inmediato)
  const scheduleAudioChunk = (pcmData: Float32Array) => {
    if (!playbackContextRef.current) return;
    
    try {
      const audioBuffer = playbackContextRef.current.createBuffer(1, pcmData.length, 24000);
      audioBuffer.getChannelData(0).set(pcmData);
      
      const source = playbackContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      
      // Pasar el audio por el GainNode (control de volumen) antes de los parlantes
      // Usar GainNode en vez de playbackRate evita la distorsión de pitch
      if (gainNodeRef.current) {
        source.connect(gainNodeRef.current);
      } else {
        source.connect(playbackContextRef.current.destination);
      }
      
      // También conectar al analizador para el lip-sync
      if (analyserRef.current) {
        source.connect(analyserRef.current);
      }

      const now = playbackContextRef.current.currentTime;
      
      // ANTI-ENTRECORTADO: Si el reloj se quedó atrás por jitter de red,
      // reiniciamos con solo 30ms de margen (antes era 100ms, creando silencios audibles).
      // 30ms es imperceptible al oído humano pero suficiente para estabilizar el buffer.
      if (nextStartTimeRef.current < now) {
        nextStartTimeRef.current = now + 0.03;
      }

      source.start(nextStartTimeRef.current);
      
      // El siguiente debe empezar justo cuando este termine
      nextStartTimeRef.current += audioBuffer.duration;
      
      currentSourceRef.current = source;
    } catch (e) {
      console.error("Error en Streaming Scheduling:", e);
    }
  };

  const handleIncomingMessage = async (e: MessageEvent) => {
    // OPTIMIZACIÓN: El servidor envía audio puro como ArrayBuffer
    // para evitar el overhead de base64. Lo manejamos aquí directamente.
    if (e.data instanceof ArrayBuffer || e.data instanceof Blob) {
      if (isInterruptedRef.current) return;
      const arrayBuffer = e.data instanceof Blob ? await e.data.arrayBuffer() : e.data;
      const pcm16 = new Int16Array(arrayBuffer);
      const float32 = new Float32Array(pcm16.length);
      for (let i = 0; i < pcm16.length; i++) float32[i] = pcm16[i] / 0x8000;
      scheduleAudioChunk(float32);
      return;
    }

    try {
      const response = JSON.parse(e.data);
      
      // 1. Manejar Voz de la IA en formato JSON legacy (texto + audio mezclados)
      const parts = response.serverContent?.modelTurn?.parts;
      if (parts) {
        for (const part of parts) {
          if (part.inlineData?.data) {
            if (isInterruptedRef.current) return;

            const binaryString = atob(part.inlineData.data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
            
            const pcm16 = new Int16Array(bytes.buffer);
            const float32 = new Float32Array(pcm16.length);
            for (let i = 0; i < pcm16.length; i++) float32[i] = pcm16[i] / 0x8000;
            
            scheduleAudioChunk(float32);
          }

          if (part.text) {
            setTranscript(prev => (prev + ' ' + part.text).slice(-100));
            setStatus('Coach hablando...');
          }
        }
      }

      // 2. Manejar mensajes de texto o comandos
      if (response.type === 'text') {
        setTranscript(prev => (prev + ' ' + response.data).slice(-100));
        setStatus('Coach hablando...');
      }
      
      // FASE 23: Respuesta a cambio de modo
      if (response.type === 'mode_update') {
        setAppMode(response.mode);
        stopCall(); // Forzar reinicio de llamada para aplicar nuevo prompt
      }
    } catch (err) {
      // Ignorar errores de parseo si llegan datos binarios accidentales
      if (!(e.data instanceof Blob)) {
        console.error("Error procesando mensaje:", err);
      }
    }
  };

  const startCall = async () => {
    try {
      setStatus('Iniciando motor de audio...')
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Contexto de Grabación (16kHz para Gemini)
      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;

      // Contexto de Reproducción (24kHz para la voz de la IA)
      playbackContextRef.current = new AudioContext({ sampleRate: 24000 });
      
      // GainNode: control de volumen SIN distorsión de pitch
      const gainNode = playbackContextRef.current.createGain();
      gainNode.gain.value = 1.0; // 100% de volumen por defecto
      gainNodeRef.current = gainNode;
      gainNode.connect(playbackContextRef.current.destination);

      // Analizador para el lip-sync (conectado al GainNode para leer el volumen real)
      const analyser = playbackContextRef.current.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      gainNode.connect(analyser);

      // Bucle para extraer volumen a 60fps
      const updateVolume = () => {
        if (!analyserRef.current) return;
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteTimeDomainData(dataArray);
        
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const v = (dataArray[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / dataArray.length);
        (window as any).aiVolume = rms;
        requestAnimationFrame(updateVolume);
      };
      updateVolume();
      
      const source = audioContext.createMediaStreamSource(stream);
      micSourceRef.current = source;
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      // FASE 14: Enviar `userId` para tener persistencia
      const userId = getTWA().initDataUnsafe?.user?.id || 'guest';
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = import.meta.env.DEV ? '127.0.0.1:3000' : window.location.host;
      // Pasar la velocidad de habla al servidor para que Gemini la aplique desde el origen
      const socket = new WebSocket(`${protocol}//${host}?userId=${userId}&speed=${speechRate}`);
      socket.binaryType = 'arraybuffer'; // Recibir audio binario directamente sin conversión Blob
      socketRef.current = socket;

      socket.onopen = () => {
        setIsCalling(true);
        setStatus('En línea - ¡Te escucho!');
        
        // Conectar el micrófono inmediatamente. El servidor tiene buffer interno
        // para no perder audio mientras Gemini procesa el setup.
        if (micSourceRef.current && processorRef.current && audioContextRef.current) {
          micSourceRef.current.connect(processorRef.current);
          processorRef.current.connect(audioContextRef.current.destination);
        }

        processor.onaudioprocess = (e) => {
          if (socket.readyState !== WebSocket.OPEN) return;
          const inputData = e.inputBuffer.getChannelData(0);

          // Si el usuario empieza a hablar (detectamos volumen), quitamos el bloqueo de interrupción
          const volume = inputData.reduce((a, b) => a + Math.abs(b), 0) / inputData.length;
          if (volume > 0.01) {
            isInterruptedRef.current = false;
          }

          // FASE 22: Detector de Silencio y Ansiedad
          if (volume < SILENCE_THRESHOLD) {
            silenceFramesRef.current++;
            if (silenceFramesRef.current > SILENCE_TIMEOUT_FRAMES && !silenceCooldownRef.current) {
              silenceCooldownRef.current = true;
              silenceFramesRef.current = 0;
              const prompt = SILENCE_PROMPTS[Math.floor(Math.random() * SILENCE_PROMPTS.length)];
              socket.send(JSON.stringify({ type: 'text', data: prompt }));
              setStatus('Coach te está animando...');
              setTimeout(() => { silenceCooldownRef.current = false; }, 20000);
            }
          } else {
            silenceFramesRef.current = 0;
          }

          const pcmData = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            const s = Math.max(-1, Math.min(1, inputData[i]));
            pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
          }
          socket.send(pcmData.buffer);
        };
      };

      socket.onmessage = handleIncomingMessage;
      socket.onclose = () => stopCall();
      socket.onerror = (err) => {
        console.error("Error en WebSocket:", err);
        setStatus('Error de conexión');
        stopCall();
      };

    } catch (err) {
      console.error("Error al iniciar llamada:", err);
      setStatus('Error: Sin acceso al micro');
    }
  }

  const stopCall = () => {
    setIsCalling(false);
    setStatus('Listo para practicar');
    setTranscript('');
    
    if (processorRef.current) { processorRef.current.disconnect(); processorRef.current = null; }
    if (micSourceRef.current) { micSourceRef.current.disconnect(); micSourceRef.current = null; }
    if (audioContextRef.current) { audioContextRef.current.close(); audioContextRef.current = null; }
    if (playbackContextRef.current) { playbackContextRef.current.close(); playbackContextRef.current = null; }
    if (socketRef.current) { socketRef.current.close(); socketRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(track => track.stop()); streamRef.current = null; }
    gainNodeRef.current = null;
    analyserRef.current = null;
    currentSourceRef.current = null;
    
    audioStack.current = [];
    isPlayingRef.current = false;

    // FASE 22: Reset del detector de silencio
    silenceFramesRef.current = 0;
    silenceCooldownRef.current = false;
  }

  const interruptAI = () => {
    console.log("🚫 Interrumpiendo al Tutor...");
    // 1. Activar escudo contra audio residual
    isInterruptedRef.current = true;
    
    // 2. Limpiar cola de espera
    audioStack.current = [];
    
    // 3. Detener sonido actual de inmediato
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop();
      } catch (e) { /* Ya estaba detenido */ }
      currentSourceRef.current = null;
    }

    setStatus('Interrumpido - Te escucho');
  };

  const toggleCall = () => {
    if (!isCalling) startCall();
    else stopCall();
  }

  const requestContinue = () => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      isInterruptedRef.current = false; // Quitamos el bloqueo si existía
      socketRef.current.send(JSON.stringify({ type: 'text', data: 'Please, continue what you were saying.' }));
      setStatus('Pidiendo continuación...');
    }
  }

  // FASE 23 & 24: Cambiar Modo
  const handleToggleMode = (newMode: string) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      // Si estamos en llamada, le decimos al server que lo cambie por WS
      socketRef.current.send(JSON.stringify({ type: 'command', command: '/toggle_mode', value: newMode }));
    } else {
      // Si no estamos en llamada, usamos la API REST para persistirlo antes de conectar
      const userId = getTWA().initDataUnsafe?.user?.id || 'guest';
      if (userId !== 'guest') {
        fetch(`/api/user/${userId}/mode`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: newMode })
        }).then(() => setAppMode(newMode)).catch(e => console.error(e));
      } else {
        setAppMode(newMode);
      }
    }
  }

  return (
    <div className="flex flex-col h-screen w-full text-white font-sans bg-[#0a0e1a]">
      {/* ── ZONA SCROLLABLE ── */}
      <div className="flex-1 overflow-y-auto flex flex-col items-center w-full px-6 pt-6 pb-2 gap-3">
      
      {/* Header FASE 18, 23 & 24: Jerarquía Premium, Saludo y Modo */}
      <div className="text-center mt-6 w-full max-w-sm flex flex-col items-center gap-3" style={{ animation: 'fadeInUp 0.6s ease-out both' }}>
        
        <div className="flex items-center justify-center gap-2">
          <span className="text-slate-400 text-xs font-semibold tracking-widest uppercase">AI English Coach</span>
        </div>
        
        <h1 className="text-3xl font-extrabold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent px-2">
          {isGuest ? 'Modo Invitado 🕵️‍♂️' : `Hola, ${userProfile?.name || getTWA().initDataUnsafe?.user?.first_name || 'Estudiante'} 👋`}
        </h1>

        {/* Selector de Modo centrado debajo del título */}
        <div className="relative mt-1">
          <select 
            value={appMode}
            onChange={(e) => handleToggleMode(e.target.value)}
            className="bg-slate-800/80 backdrop-blur border border-slate-600 pl-4 pr-10 py-2 rounded-full text-sm font-bold shadow-lg outline-none appearance-none cursor-pointer hover:bg-slate-700/80 transition-colors"
            style={{ 
              backgroundImage: 'url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%2394A3B8%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")', 
              backgroundRepeat: 'no-repeat', 
              backgroundPosition: 'right 1em top 50%', 
              backgroundSize: '0.8em auto' 
            }}
          >
            <option value="conversation">🎙️ Conversación Libre</option>
            <option value="shadowing">🦜 Shadowing</option>
            <option value="roleplay_tech_interview">🎭 Entrevista Tech</option>
            <option value="roleplay_hotel_complaint">🏨 Queja de Hotel</option>
          </select>
        </div>
        
        {/* Motivation Strip (Solo usuarios reales) */}
        {!isGuest && (
          <div className="mt-3 flex items-center justify-center gap-4 text-sm font-medium">
            <div className="flex items-center gap-1.5 bg-slate-800/50 px-3 py-1 rounded-full border border-slate-700/50">
              <span>🔥</span>
              <span className="text-slate-200">{userProfile?.sessionCount || 0} sesiones</span>
            </div>
            <div className="flex items-center gap-1.5 bg-indigo-900/30 px-3 py-1 rounded-full border border-indigo-500/30">
              <span>🎓</span>
              <span className="text-indigo-300">Nivel {userProfile?.level || 'A1'}</span>
            </div>
          </div>
        )}
      </div>

      {/* Visualizer: El Avatar 3D de la IA */}
      <div className="w-full flex justify-center items-center my-2 relative" style={{ animation: 'fadeInUp 0.8s ease-out 0.1s both' }}>
        {/* Glow de profundidad */}
        <div className="absolute inset-0 bg-blue-500/10 blur-[50px] rounded-full w-48 h-48 m-auto mix-blend-screen pointer-events-none" />
        <CoachAvatar />
      </div>

      {/* Progress Bars FASE 18: Estadísticas Reales */}
      {userProfile?.stats && !isCalling && !isGuest && (
        <div className="w-full max-w-[280px] mx-auto z-10">
          <ProgressBar label="Gramática" value={userProfile.stats.grammarAvg} delayMs={200} />
          <ProgressBar label="Pronunciación" value={userProfile.stats.pronAvg} delayMs={300} />
          <ProgressBar label="Fluidez" value={userProfile.stats.fluencyAvg} delayMs={400} />
          <ProgressBar label="Vocabulario" value={userProfile.stats.vocabAvg} delayMs={500} />
        </div>
      )}

      {/* FASE 18: CTA para Modo Invitado + DEBUG PANEL TEMPORAL */}
      {isGuest && !isCalling && (
        <div className="w-full max-w-[280px] mx-auto z-10 bg-slate-800/60 backdrop-blur-md border border-blue-500/30 p-4 rounded-2xl text-center shadow-lg" style={{ animation: 'fadeInUp 0.8s ease-out 0.2s both' }}>
          <p className="text-sm text-slate-300 mb-3 leading-tight">
            Estás en modo prueba. Tu progreso no se guardará.
          </p>
          {/* DEBUG TEMPORAL: Ocultado porque ya resolvimos el login
          <details className="text-left mb-3">
            <summary className="text-xs text-yellow-400 cursor-pointer font-mono">🔍 Debug SDK</summary>
            <div className="mt-1 text-xs font-mono bg-slate-900/80 p-2 rounded-lg break-all text-slate-300 max-h-24 overflow-y-auto">
              <div><span className="text-yellow-300">initData:</span> {getTWA().initData ? `"${getTWA().initData.slice(0, 80)}..."` : '❌ VACÍO'}</div>
              <div><span className="text-yellow-300">userId:</span> {String(getTWA().initDataUnsafe?.user?.id ?? '❌ sin user')}</div>
              <div><span className="text-yellow-300">platform:</span> {getTWA().platform ?? '❌ sin platform'}</div>
            </div>
          </details>
          */}
          <a 
            href="https://t.me/tu_bot_aqui" 
            target="_blank" 
            rel="noopener noreferrer"
            className="inline-block w-full py-2 bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/50 text-blue-300 rounded-xl text-sm font-semibold transition-all"
          >
            Abrir en Telegram 🚀
          </a>
        </div>
      )}

      {/* Área de estado durante llamada */}
      {isCalling && (
        <div className="w-full max-w-sm px-4 flex flex-col items-center gap-2" style={{ animation: 'fadeInUp 0.5s ease-out both' }}>
          <p className="text-blue-400 animate-pulse font-medium">{status}</p>
          <div className="text-center italic text-slate-300 text-sm h-16 overflow-hidden leading-snug">
            {transcript}
          </div>
        </div>
      )}

      {/* FASE 17: Slider de velocidad — visible ANTES de la llamada */}
      {!isCalling && (
        <div className="flex flex-col items-center gap-1 w-full max-w-[240px] mx-auto" style={{ animation: 'fadeInUp 0.5s ease-out both' }}>
          <span className="text-xs text-slate-400 font-medium">
            Velocidad del Coach: {speechRate === 1.0 ? 'Normal' : speechRate >= 0.75 ? 'Moderada' : 'Lenta'}
          </span>
          <div className="flex items-center gap-3 w-full">
            <span title="Lento">🐢</span>
            <input
              type="range"
              min="0.5"
              max="1.0"
              step="0.05"
              value={speechRate}
              className="flex-1 accent-blue-500"
              onChange={(e) => setSpeechRate(parseFloat(e.target.value))}
            />
            <span title="Normal">🗣️</span>
          </div>
        </div>
      )}
      </div>{/* fin zona scrollable */}

      {/* ── ZONA FIJA INFERIOR: siempre visible, no tapa contenido ── */}
      <div className="flex-shrink-0 w-full px-6 pb-6 pt-2 flex flex-col gap-3 max-w-xs mx-auto">
        {isCalling && (
          <div className="grid grid-cols-2 gap-3 w-full">
            <button
              onClick={interruptAI}
              className="py-3 rounded-2xl font-semibold text-xs bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-all active:scale-95"
            >
              Interrumpir Tutor
            </button>
            <button
              onClick={requestContinue}
              className="py-3 rounded-2xl font-semibold text-xs bg-indigo-900/30 hover:bg-indigo-900/50 border border-indigo-500/30 text-indigo-300 transition-all active:scale-95"
            >
              Please, continue
            </button>
          </div>
        )}
        <button
          onClick={toggleCall}
          className={`w-full py-4 rounded-3xl font-bold text-lg flex items-center justify-center gap-2 transition-all duration-500 hover:scale-[1.02] active:scale-95 shadow-xl ${
            isCalling 
              ? 'bg-red-500 hover:bg-red-600 shadow-red-500/20' 
              : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-blue-600/30 ring-1 ring-white/10'
          }`}
          style={{ animation: 'fadeInUp 0.8s ease-out 0.6s both' }}
        >
          {isCalling ? (
            <><span>⏹️</span> Finalizar Sesión</>
          ) : (
            <><span>🎤</span> Empezar a Hablar</>
          )}
        </button>
      </div>
    </div>
  )
}

export default App
