import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF, Html, useProgress } from '@react-three/drei';
import { Suspense, useRef, useEffect } from 'react';
import * as THREE from 'three';

// ─── PRE-CARGA TEMPRANA ──────────────────────────────────────────────────────
// Iniciamos la descarga del modelo en el primer tick de JS,
// antes de que el Canvas o el Suspense se monten en el DOM.
useGLTF.preload('/avaturn.glb');

// ─── SKELETON LOADER ─────────────────────────────────────────────────────────
// Se renderiza dentro del Canvas mientras el modelo 3D descarga y compila.
function AvatarLoader() {
  const { progress } = useProgress();
  return (
    <Html center>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '12px',
        userSelect: 'none',
        pointerEvents: 'none',
      }}>
        {/* Spinner animado con CSS puro — sin dependencias extra */}
        <div style={{
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          border: '3px solid rgba(99, 102, 241, 0.2)',
          borderTopColor: '#6366f1',
          animation: 'spin 0.9s linear infinite',
        }} />
        {/* Texto de estado */}
        <p style={{
          color: '#a5b4fc',
          fontSize: '12px',
          fontFamily: 'Inter, sans-serif',
          letterSpacing: '0.05em',
          margin: 0,
        }}>
          {progress < 100
            ? `Conectando con tu Coach... ${Math.round(progress)}%`
            : 'Preparando escena...'}
        </p>
        {/* Barra de progreso */}
        <div style={{
          width: '120px',
          height: '2px',
          borderRadius: '2px',
          background: 'rgba(99, 102, 241, 0.2)',
          overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            width: `${progress}%`,
            background: 'linear-gradient(90deg, #6366f1, #818cf8)',
            borderRadius: '2px',
            transition: 'width 0.3s ease',
          }} />
        </div>
      </div>
      {/* Keyframe de spinning inyectado globalmente (solo una vez) */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </Html>
  );
}

// ─── TIPOS ───────────────────────────────────────────────────────────────────
interface AvatarModelProps {
  glowRingRef: React.RefObject<HTMLDivElement | null>;
}

// ─── MODELO 3D ───────────────────────────────────────────────────────────────
function AvatarModel({ glowRingRef }: AvatarModelProps) {
  const { scene } = useGLTF('/avaturn.glb');
  const headMeshRef = useRef<THREE.Mesh | null>(null);
  const neckBoneRef = useRef<THREE.Object3D | null>(null);
  const headBoneRef = useRef<THREE.Object3D | null>(null);
  
  // Referencias para la postura de Presentador
  const leftArmRef = useRef<THREE.Object3D | null>(null);
  const rightArmRef = useRef<THREE.Object3D | null>(null);
  const leftForeArmRef = useRef<THREE.Object3D | null>(null);
  const rightForeArmRef = useRef<THREE.Object3D | null>(null);

  // Controladores de parpadeo persistentes
  const blinkTimerRef = useRef(0);
  const isBlinkingRef = useRef(false);
  const blinkProgressRef = useRef(0);

  // Buscamos los huesos y mallas al cargar
  useEffect(() => {
    scene.traverse((child) => {
      const name = child.name.toLowerCase();

      // Malla facial
      if ((child as THREE.Mesh).isMesh && (child as THREE.Mesh).morphTargetInfluences) {
        if (name.includes('head') || name.includes('avatar') || name.includes('face')) {
          headMeshRef.current = child as THREE.Mesh;
        }
      }
      
      // Cuello y Cabeza
      if (name.includes('neck')) neckBoneRef.current = child;
      if (child.name === 'Head' && !(child as THREE.Mesh).isMesh) headBoneRef.current = child;

      // Brazos (Evitando sobreescribir con el antebrazo que también contiene 'arm')
      if (name.includes('leftarm') && !name.includes('fore')) leftArmRef.current = child;
      if (name.includes('rightarm') && !name.includes('fore')) rightArmRef.current = child;
      
      // Antebrazos (Codos)
      if (name.includes('leftforearm')) leftForeArmRef.current = child;
      if (name.includes('rightforearm')) rightForeArmRef.current = child;
    });
  }, [scene]);

  // Bucle de animación natural a 60fps
  useFrame((state) => {
    const time = state.clock.getElapsedTime();
    const delta = state.clock.getDelta();
    const volume = (window as any).aiVolume || 0;

    // 1. Halo de luz reactivo
    if (glowRingRef.current) {
      const scale = 1 + volume * 0.45;
      const opacity = 0.2 + volume * 0.8;
      glowRingRef.current.style.transform = `scale(${scale})`;
      glowRingRef.current.style.opacity = `${opacity}`;
      glowRingRef.current.style.boxShadow = `0 0 ${20 + volume * 50}px rgba(99, 102, 241, ${0.15 + volume * 0.65})`;
    }

    // 2. Postura Relajada (Brazos descansando a los costados)
    // En un encuadre circular de videollamada, la forma más natural y segura
    // es simplemente dejar caer los brazos, relajando los hombros completamente.
    if (leftArmRef.current) {
      leftArmRef.current.rotation.z = 1.4;   // Baja el brazo casi a 90 grados
      leftArmRef.current.rotation.x = 0.1;   // Lo mueve levísimamente hacia atrás para alinear con el torso
      leftArmRef.current.rotation.y = 0;   
    }
    if (rightArmRef.current) {
      rightArmRef.current.rotation.z = -1.4; 
      rightArmRef.current.rotation.x = 0.1;
      rightArmRef.current.rotation.y = 0;
    }
    
    // Mantenemos los antebrazos rectos y relajados hacia abajo
    if (leftForeArmRef.current) {
      leftForeArmRef.current.rotation.set(0, 0, 0);
    }
    if (rightForeArmRef.current) {
      rightForeArmRef.current.rotation.set(0, 0, 0);
    }

    // 3. Oscilación natural de cabeza/cuello (Idle sway)
    const targetNeck = neckBoneRef.current;
    if (targetNeck) {
      targetNeck.rotation.y = Math.sin(time * 0.8) * 0.05;
      targetNeck.rotation.x = 0.12 + Math.cos(time * 1.1) * 0.02;
    }

    const targetHead = headBoneRef.current;
    if (targetHead) {
      targetHead.rotation.x = 0.08;
    }

    if (headMeshRef.current && headMeshRef.current.morphTargetInfluences) {
      const morphTargets = headMeshRef.current.morphTargetDictionary;
      if (morphTargets) {
        // 4. Sincronización Labial (Lip-Sync)
        const mouthOpenIndex = morphTargets['mouthOpen'] ?? morphTargets['jawOpen'];
        if (mouthOpenIndex !== undefined) {
          headMeshRef.current.morphTargetInfluences[mouthOpenIndex] = Math.min(volume * 7, 0.45);
        }

        // 5. Sistema de Parpadeo aleatorio (Blinking)
        blinkTimerRef.current += delta || 0.016;
        if (blinkTimerRef.current > 4 && !isBlinkingRef.current) {
          isBlinkingRef.current = true;
          blinkTimerRef.current = 0;
          blinkProgressRef.current = 0;
        }

        const blinkL = morphTargets['eyeBlinkLeft'] ?? morphTargets['blinkLeft'];
        const blinkR = morphTargets['eyeBlinkRight'] ?? morphTargets['blinkRight'];

        if (blinkL !== undefined && blinkR !== undefined) {
          if (isBlinkingRef.current) {
            blinkProgressRef.current += (delta || 0.016) * 15;
            const blinkValue = Math.sin(blinkProgressRef.current);

            if (blinkValue > 0) {
              headMeshRef.current.morphTargetInfluences[blinkL] = blinkValue;
              headMeshRef.current.morphTargetInfluences[blinkR] = blinkValue;
            } else {
              headMeshRef.current.morphTargetInfluences[blinkL] = 0;
              headMeshRef.current.morphTargetInfluences[blinkR] = 0;
              isBlinkingRef.current = false;
            }
          }
        }
      }
    }
  });

  return <primitive object={scene} position={[0, -1.6, 0]} />;
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
export function CoachAvatar() {
  const glowRingRef = useRef<HTMLDivElement>(null);

  return (
    <div className="relative w-80 h-80 flex items-center justify-center">
      {/* Halo de brillo reactivo exterior */}
      <div
        ref={glowRingRef}
        className="absolute inset-0 rounded-full bg-indigo-500/10 blur-2xl transition-all duration-75 pointer-events-none"
        style={{ transform: 'scale(1)', opacity: 0.2 }}
      />

      {/* Contenedor circular con glassmorphism */}
      <div className="relative w-72 h-72 rounded-full overflow-hidden border border-indigo-500/20 bg-gradient-to-b from-indigo-950/40 to-slate-950/80 shadow-[0_0_40px_rgba(99,102,241,0.15)] flex items-center justify-center">
        {/*
          ─── CÁMARA FIJA ─────────────────────────────────────────────────────
          OrbitControls eliminado. La cámara queda estática en la posición
          ideal de "videollamada bust-shot". La sensación de vida la dan las
          animaciones internas: idle sway, parpadeo y lip-sync.
        */}
        <Canvas camera={{ position: [0, 0.25, 0.52] }}>
          {/* Iluminación de estudio de 3 puntos */}
          <ambientLight intensity={0.5} color="#c7d2fe" />
          <directionalLight position={[2, 2, 2]} intensity={1.5} color="#ffffff" />
          <directionalLight position={[-2, 2, 2]} intensity={0.7} color="#a5b4fc" />
          <directionalLight position={[0, 2, -3]} intensity={2.2} color="#6366f1" />

          {/*
            ─── SKELETON LOADER ELEGANTE ─────────────────────────────────────
            El fallback se renderiza dentro del Canvas mientras el modelo .glb
            descarga (pre-cargado desde useGLTF.preload) y compila en la GPU.
            useProgress() provee el porcentaje exacto de descarga en tiempo real.
          */}
          <Suspense fallback={<AvatarLoader />}>
            <AvatarModel glowRingRef={glowRingRef} />
          </Suspense>
        </Canvas>
      </div>
    </div>
  );
}
