import { useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { ScrollControls, Scroll, useScroll } from "@react-three/drei";
import * as THREE from "three";
import { t } from "../lib/i18n";
import { OmixLogo } from "../components/Brand";

// Immersive bright "Spine of Movement": the camera travels down a luminous gold
// spine (the studio's logo in 3D) wrapped by an olive leaf-ribbon, on a warm
// ivory backdrop. Concise sales copy scrolls alongside. Lazy-loaded; App falls
// back to the static landing for reduced-motion / no-WebGL.

const GOLD = "#c8a24a";
const OLIVE = "#6e8b4e";
const CREAM = "#f6efe0";
const PAGES = 8;
const SPAN = 17; // world height the spine occupies
const VERT = 44; // vertebrae

function spineCurve() {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 12; i++) {
    const tt = i / 12;
    pts.push(new THREE.Vector3(Math.sin(tt * Math.PI * 1.4) * 0.55, -tt * SPAN, 0));
  }
  return new THREE.CatmullRomCurve3(pts);
}

function SpineRig({ onActive }: { onActive: (i: number) => void }) {
  const scroll = useScroll();
  const inst = useRef<THREE.InstancedMesh>(null!);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const curve = useMemo(() => spineCurve(), []);
  const points = useMemo(
    () => Array.from({ length: VERT }, (_, i) => curve.getPoint(i / (VERT - 1))),
    [curve],
  );
  const leafGeo = useMemo(() => {
    const helix: THREE.Vector3[] = [];
    for (let i = 0; i <= 220; i++) {
      const tt = i / 220;
      const p = curve.getPoint(tt);
      const a = tt * Math.PI * 11;
      helix.push(new THREE.Vector3(p.x + Math.cos(a) * 0.6, p.y, Math.sin(a) * 0.6));
    }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(helix), 260, 0.045, 8, false);
  }, [curve]);

  useFrame((state) => {
    const off = scroll.offset;
    const camY = -off * SPAN;
    state.camera.position.set(Math.sin(off * Math.PI * 1.4) * 0.5, camY, 5);
    state.camera.lookAt(state.camera.position.x * 0.5, camY - 2.2, 0);
    onActive(Math.min(PAGES - 1, Math.round(off * (PAGES - 1))));

    const time = state.clock.elapsedTime;
    const focusY = camY - 2.2;
    for (let i = 0; i < VERT; i++) {
      const p = points[i];
      const focus = Math.max(0, 1 - Math.abs(p.y - focusY) / 2.4);
      const breathe = 1 + Math.sin(time * 1.8 + i * 0.5) * 0.03;
      const s = (0.3 + focus * 0.14) * breathe;
      dummy.position.set(p.x + Math.sin(time + i) * 0.02, p.y, 0);
      dummy.rotation.z = Math.sin((i / VERT) * Math.PI * 1.4) * 0.35;
      dummy.scale.set(s * 1.7, s * 0.72, s);
      dummy.updateMatrix();
      inst.current.setMatrixAt(i, dummy.matrix);
    }
    inst.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
      <instancedMesh ref={inst} args={[undefined, undefined, VERT]} castShadow>
        <cylinderGeometry args={[0.5, 0.5, 0.9, 30]} />
        <meshStandardMaterial color={GOLD} emissive={GOLD} emissiveIntensity={0.32} metalness={0.78} roughness={0.26} />
      </instancedMesh>
      <mesh geometry={leafGeo}>
        <meshStandardMaterial color={OLIVE} emissive={OLIVE} emissiveIntensity={0.18} roughness={0.5} metalness={0.2} />
      </mesh>
    </group>
  );
}

function Motes() {
  const ref = useRef<THREE.Points>(null!);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const n = 260;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 9;
      pos[i * 3 + 1] = -Math.random() * SPAN;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 5;
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);
  useFrame((s) => { if (ref.current) ref.current.rotation.y = s.clock.elapsedTime * 0.015; });
  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial size={0.05} color="#d9b25e" transparent opacity={0.55} sizeAttenuation
        blending={THREE.AdditiveBlending} depthWrite={false} />
    </points>
  );
}

function Overlay({ onEnter }: { onEnter: () => void }) {
  const S = t.spine;
  return (
    <div className="spine-html">
      <section className="spine-sec hero">
        <span className="spine-kicker">{S.kicker}</span>
        <h1>{S.t1} {S.t2} {S.t3}</h1>
        <p>{S.sub}</p>
        <button className="btn btn-lime btn-lg" onClick={onEnter}>{S.enter}</button>
        <span className="spine-scroll">{S.scroll} ↓</span>
      </section>
      {S.services.map((s, i) => (
        <section className="spine-sec" key={s.t}>
          <span className="spine-num">{`0${i + 1}`}</span>
          <h2>{s.t}</h2>
          <p>{s.d}</p>
        </section>
      ))}
      <section className="spine-sec final">
        <h2>{S.finalTitle}</h2>
        <p>{S.finalSub}</p>
        <button className="btn btn-lime btn-lg" onClick={onEnter}>{S.enter}</button>
      </section>
    </div>
  );
}

export default function SpineLanding({ onEnter }: { onEnter: () => void }) {
  const [, setActive] = useState(0);
  return (
    <div className="spine-lp">
      <Canvas
        dpr={[1, 1.8]}
        camera={{ position: [0, 0, 5], fov: 42 }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
      >
        <color attach="background" args={[CREAM]} />
        <fog attach="fog" args={[CREAM, 7, 23]} />
        <ambientLight intensity={0.95} />
        <directionalLight position={[3, 4, 5]} intensity={1.15} />
        <directionalLight position={[-3, -2, 2]} intensity={0.4} color="#fff3d6" />
        <ScrollControls pages={PAGES} damping={0.3}>
          <SpineRig onActive={setActive} />
          <Motes />
          <Scroll html style={{ width: "100%" }}>
            <Overlay onEnter={onEnter} />
          </Scroll>
        </ScrollControls>
      </Canvas>

      <header className="spine-bar">
        <OmixLogo size={30} />
        <button className="spine-signin" onClick={onEnter}>{t.spine.signIn}</button>
      </header>
    </div>
  );
}
