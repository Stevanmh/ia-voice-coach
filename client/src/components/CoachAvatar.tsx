import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import { Suspense, useRef, useEffect } from 'react';
import * as THREE from 'three';

interface AvatarModelProps {
  glowRingRef: React.RefObject<HTMLDivElement | null>;
}

function AvatarModel({ glowRingRef }: AvatarModelProps) {
  const { scene } = useGLTF('/avaturn.glb');
  const headMeshRef = useRef<THREE.Mesh | null>(null);
  const neckBoneRef = useRef<THREE.Object3D | null>(null);
  const headBoneRef = useRef<THREE.Object3D | null>(null);
  const leftArmRef = useRef<THREE.Object3D | null>(null);
  const rightArmRef = useRef<THREE.Object3D | null>(null);

  // Controladores de parpadeo persistentes
  const blinkTimerRef = useRef(0);
  const isBlinkingRef = useRef(false);
  const blinkProgressRef = useRef(0);

  // Buscamos la cabeza (mesh) y el cuello (hueso) al cargar
  useEffect(() => {
    scene.traverse((child) => {
      // Buscar la malla facial
      if ((child as THREE.Mesh).isMesh && (child as THREE.Mesh).morphTargetInfluences) {
        if (child.name.includes('Head') || child.name.includes('Avatar') || child.name.includes('Face')) {
          headMeshRef.current = child as THREE.Mesh;
        }
      }
      // Buscar el hueso del cuello para animar los movimientos de la cabeza
      if (child.name.includes('Neck')) {
        neckBoneRef.current = child;
      }
      // Buscar el hueso de la cabeza para controlar la dirección de la mirada
      if (child.name === 'Head' && !(child as THREE.Mesh).isMesh) {
        headBoneRef.current = child;
      }
      // Buscar los brazos para bajarlos de la pose T
      if (child.name.toLowerCase().includes('leftarm') || child.name.toLowerCase().includes('leftupperarm')) {
        leftArmRef.current = child;
      }
      if (child.name.toLowerCase().includes('rightarm') || child.name.toLowerCase().includes('rightupperarm')) {
        rightArmRef.current = child;
      }
    });

    if (headMeshRef.current && headMeshRef.current.morphTargetDictionary) {
      console.log("Avatar Morph Targets:", headMeshRef.current.morphTargetDictionary);
    }
  }, [scene]);

  // Bucle de animación natural a 60fps
  useFrame((state) => {
    const time = state.clock.getElapsedTime();
    const delta = state.clock.getDelta(); // Intervalo de tiempo real entre frames
    const volume = (window as any).aiVolume || 0;

    // 1. Halo de luz reactivo (Cambio directo de CSS para evitar re-renders)
    if (glowRingRef.current) {
      const scale = 1 + volume * 0.45; // Escala hasta 1.45x
      const opacity = 0.2 + volume * 0.8; // Opacidad de 0.2 a 1.0
      glowRingRef.current.style.transform = `scale(${scale})`;
      glowRingRef.current.style.opacity = `${opacity}`;
      glowRingRef.current.style.boxShadow = `0 0 ${20 + volume * 50}px rgba(99, 102, 241, ${0.15 + volume * 0.65})`;
    }

    // 2. Bajar los brazos de la pose T
    if (leftArmRef.current) {
      leftArmRef.current.rotation.z = 1.25;
    }
    if (rightArmRef.current) {
      rightArmRef.current.rotation.z = -1.25;
    }

    // 3. Inclinación y oscilación natural de cabeza/cuello (Breathing e Idle sway)
    const targetNeck = neckBoneRef.current;
    if (targetNeck) {
      // Rotaciones sutiles senoidales asíncronas para verse orgánicas
      targetNeck.rotation.y = Math.sin(time * 0.8) * 0.05; // Giro suave izquierda-derecha
      targetNeck.rotation.x = 0.12 + Math.cos(time * 1.1) * 0.02; // Inclinación hacia adelante para mirar de frente
    }

    const targetHead = headBoneRef.current;
    if (targetHead) {
      // Inclinación adicional en la cabeza para ajustar la línea de visión al frente/cámara
      targetHead.rotation.x = 0.08;
    }


    if (headMeshRef.current && headMeshRef.current.morphTargetInfluences) {
      const morphTargets = headMeshRef.current.morphTargetDictionary;
      if (morphTargets) {
        // 4. Sincronización Labial (Voz) - Soporte para mouthOpen o jawOpen
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
            // Incrementamos el progreso del parpadeo a gran velocidad
            blinkProgressRef.current += (delta || 0.016) * 15;
            const blinkValue = Math.sin(blinkProgressRef.current);
            
            if (blinkValue > 0) {
              headMeshRef.current.morphTargetInfluences[blinkL] = blinkValue;
              headMeshRef.current.morphTargetInfluences[blinkR] = blinkValue;
            } else {
              // Fin del parpadeo, devolvemos los ojos a su estado abierto
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
        <Canvas camera={{ position: [0, 0.25, 0.52] }}>
          {/* Iluminación de estudio de 3 puntos */}
          <ambientLight intensity={0.5} color="#c7d2fe" />
          <directionalLight position={[2, 2, 2]} intensity={1.5} color="#ffffff" />
          <directionalLight position={[-2, 2, 2]} intensity={0.7} color="#a5b4fc" />
          <directionalLight position={[0, 2, -3]} intensity={2.2} color="#6366f1" />
          
          <Suspense fallback={null}>
            <AvatarModel glowRingRef={glowRingRef} />
          </Suspense>

          <OrbitControls enableZoom={true} target={[0, 0.25, 0]} />
        </Canvas>
      </div>
    </div>
  );
}


