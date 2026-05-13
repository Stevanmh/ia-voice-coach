import { useEffect, useState, useRef } from 'react'
import WebApp from '@twa-dev/sdk'

function App() {
  const [isCalling, setIsCalling] = useState(false)
  const [status, setStatus] = useState('Listo para practicar')
  const [transcript, setTranscript] = useState('')

  // Referencias para el motor de audio profesional
  const socketRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const playbackContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  // Gestión de la cola de reproducción (Audio Stack)
  const audioStack = useRef<Float32Array[]>([]);
  const isPlayingRef = useRef(false);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const isInterruptedRef = useRef(false);

  useEffect(() => {
    try {
      WebApp.expand();
      WebApp.ready();
    } catch (e) {
      console.warn("Telegram WebApp SDK no disponible");
    }

    return () => {
      stopCall();
    }
  }, [])

  // Algoritmo de reproducción fluida (encolamiento de chunks)
  const playNextInStack = () => {
    if (audioStack.current.length === 0 || !playbackContextRef.current) {
      isPlayingRef.current = false;
      return;
    }
    isPlayingRef.current = true;
    const pcmData = audioStack.current.shift()!;
    
    try {
      // Gemini responde habitualmente a 24kHz en modalidad AUDIO
      const audioBuffer = playbackContextRef.current.createBuffer(1, pcmData.length, 24000);
      audioBuffer.getChannelData(0).set(pcmData);
      
      const source = playbackContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(playbackContextRef.current.destination);
      source.onended = () => {
        currentSourceRef.current = null;
        playNextInStack();
      };
      currentSourceRef.current = source;
      source.start();
    } catch (e) {
      console.error("Error reproduciendo fragmento de voz de la IA:", e);
      playNextInStack(); // Continuar con el siguiente si este falla
    }
  };

  const handleIncomingMessage = (e: MessageEvent) => {
    try {
      const response = JSON.parse(e.data);
      
      // Manejar voz de la IA
      if (response.type === 'audio') {
        // Si estamos en estado de interrupción, ignoramos los paquetes de audio residuales
        if (isInterruptedRef.current) return;

        const binaryString = atob(response.data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
        
        const pcm16 = new Int16Array(bytes.buffer);
        const float32 = new Float32Array(pcm16.length);
        for (let i = 0; i < pcm16.length; i++) float32[i] = pcm16[i] / 0x8000;
        
        audioStack.current.push(float32);
        if (!isPlayingRef.current) playNextInStack();
      }

      // Manejar transcripción o texto de la IA
      if (response.type === 'text') {
        setTranscript(prev => (prev + ' ' + response.data).slice(-100));
        setStatus('Coach hablando...');
      }
    } catch (err) {
      console.error("Error procesando mensaje entrante:", err);
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
      
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      setStatus('Conectando con el Coach...')
      const userId = WebApp.initDataUnsafe?.user?.id || 'guest';
      const socket = new WebSocket(`ws://localhost:3000?userId=${userId}`);
      socketRef.current = socket;

      socket.onopen = () => {
        setIsCalling(true);
        setStatus('En línea - ¡Te escucho!');
        
        source.connect(processor);
        processor.connect(audioContext.destination);

        processor.onaudioprocess = (e) => {
          if (socket.readyState !== WebSocket.OPEN) return;
          const inputData = e.inputBuffer.getChannelData(0);

          // Si el usuario empieza a hablar (detectamos volumen), quitamos el bloqueo de interrupción
          const volume = inputData.reduce((a, b) => a + Math.abs(b), 0) / inputData.length;
          if (volume > 0.01) {
            isInterruptedRef.current = false;
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
    if (audioContextRef.current) { audioContextRef.current.close(); audioContextRef.current = null; }
    if (playbackContextRef.current) { playbackContextRef.current.close(); playbackContextRef.current = null; }
    if (socketRef.current) { socketRef.current.close(); socketRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(track => track.stop()); streamRef.current = null; }
    
    audioStack.current = [];
    isPlayingRef.current = false;
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

  return (
    <div className="flex flex-col items-center justify-between h-screen w-full bg-slate-950 p-8 text-white font-sans overflow-hidden">
      {/* Header: Información del Usuario */}
      <div className="text-center mt-10">
        <p className="text-slate-400 text-sm uppercase tracking-widest mb-2">AI English Coach</p>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
          {WebApp.initDataUnsafe?.user?.first_name || 'Estudiante'}
        </h1>
        <p className={`mt-4 text-lg font-medium h-8 ${isCalling ? 'text-blue-400 animate-pulse' : 'text-slate-500'}`}>
          {status}
        </p>
      </div>

      {/* Visualizer: El "Cerebro" de la IA */}
      <div className="relative flex items-center justify-center w-64 h-64">
        <div className={`absolute w-full h-full rounded-full border-2 border-blue-500/20 ${isCalling ? 'animate-ping' : ''}`} />
        <div className={`absolute w-48 h-48 rounded-full border-2 border-blue-400/40 ${isCalling ? 'animate-[ping_2s_linear_infinite]' : ''}`} />
        
        <div className={`z-10 w-32 h-32 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-[0_0_50px_-12px_rgba(56,189,248,0.5)] transition-transform duration-500 ${isCalling ? 'scale-110' : 'scale-100'}`}>
          <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 016 0v6a3 3 0 01-3 3z" />
          </svg>
        </div>
      </div>

      {/* Transcript Area: Para ver lo que la IA está diciendo */}
      <div className="w-full max-w-sm px-4 text-center italic text-slate-400 text-sm h-12 overflow-hidden leading-tight">
        {transcript}
      </div>

      {/* Footer: Controles */}
      <div className="mb-12 w-full max-w-xs flex flex-col gap-3">
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
          className={`w-full py-4 rounded-3xl font-bold text-lg transition-all duration-300 shadow-lg ${
            isCalling 
              ? 'bg-red-500 hover:bg-red-600 shadow-red-500/20' 
              : 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/20'
          }`}
        >
          {isCalling ? 'Finalizar Sesión' : 'Empezar a Hablar'}
        </button>
      </div>
    </div>
  )
}

export default App
