import { useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { ScrollControls, Scroll, useScroll, Float, Text } from "@react-three/drei";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import * as THREE from "three";
import { t } from "../lib/i18n";
import { OmixLogo } from "../components/Brand";

// Immersive bright "Spine of Movement": camera scrolls down an anatomical gold
// spine wrapped in living muscle fibers (custom shader), with spinning B.Sc /
// Marathon / Mom-approved badges, glass package cards and kinetic copy — luxury
// ivory + gold + olive. Lazy-loaded; App falls back to the static landing.

const GOLD = "#c8a24a";
const CREAM = "#f6efe0";
const PAGES = 9;
const SPAN = 19;
const VERT = 46;

// per-section muscle mood: [colorA, colorB] within the luxury palette
const MOODS: [string, string][] = [
  ["#caa34b", "#7d6a2f"], // hero
  ["#e0913c", "#c87a2a"], // running - energetic warm
  ["#caa34b", "#9c7e34"], // 1:1
  ["#8aa15a", "#5f7d3f"], // group - olive
  ["#d6a06a", "#b97f4e"], // rehab - warm
  ["#dba883", "#c98a64"], // prenatal - rosy gold
  ["#9fae6a", "#74894a"], // online - cool olive
  ["#caa34b", "#8a6a1f"], // packages
  ["#caa34b", "#7d6a2f"], // final
];

// per-section spine morph: [fiber spread, pulse speed]
const MORPH: [number, number][] = [
  [1.0, 1.0],   // hero
  [1.7, 1.9],   // running  — stretch & energy
  [0.65, 0.85], // 1:1      — tight, precise
  [1.45, 1.5],  // group    — synced energy
  [0.8, 0.6],   // rehab    — gentle realign
  [1.15, 0.55], // prenatal — soft cradle
  [1.55, 1.35], // online   — dispersed
  [1.0, 1.1],   // packages
  [1.25, 1.5],  // final    — bloom
];

function spineCurve() {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 14; i++) {
    const tt = i / 14;
    pts.push(new THREE.Vector3(Math.sin(tt * Math.PI * 1.4) * 0.55, -tt * SPAN, 0));
  }
  return new THREE.CatmullRomCurve3(pts);
}

// ---- living muscle fibers (custom shader) ----
const VERT_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uFlex;
  uniform float uSpread;
  uniform float uSpeed;
  varying vec2 vUv;
  varying float vPulse;
  void main() {
    vUv = uv;
    vec3 p = position;
    float pulse = sin(uv.x * 26.0 - uTime * 2.2 * uSpeed) * 0.5 + 0.5;
    // uSpread morphs the fibers per section: tightening (rehab/1:1) or
    // flexing & expanding outward (running/group/online).
    p += normal * pulse * (0.015 + uFlex * 0.06) * uSpread;
    vPulse = pulse;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;
const FRAG_SHADER = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  varying vec2 vUv;
  varying float vPulse;
  void main() {
    float flow = fract(vUv.x * 4.0 - uTime * 0.45);
    float band = smoothstep(0.0, 0.14, flow) * smoothstep(0.5, 0.34, flow);
    vec3 base = mix(uColorA, uColorB, vUv.x);
    vec3 col = mix(base, vec3(1.0, 0.96, 0.84), band * 0.9);
    col += vPulse * 0.12;
    gl_FragColor = vec4(col, 0.88);
  }
`;

function MuscleFibers({ matRef }: { matRef: React.MutableRefObject<THREE.ShaderMaterial | null> }) {
  const geo = useMemo(() => {
    const curve = spineCurve();
    const tubes: THREE.BufferGeometry[] = [];
    const FIB = 22;
    for (let f = 0; f < FIB; f++) {
      const phase = (f / FIB) * Math.PI * 2;
      const rad = 0.5 + (f % 3) * 0.13;
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 150; i++) {
        const tt = i / 150;
        const p = curve.getPoint(tt);
        const a = tt * Math.PI * 9 + phase;
        const wob = Math.sin(tt * 22 + f) * 0.05;
        pts.push(new THREE.Vector3(p.x + Math.cos(a) * (rad + wob), p.y, Math.sin(a) * (rad + wob)));
      }
      tubes.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 190, 0.012 + (f % 2) * 0.006, 6, false));
    }
    return mergeGeometries(tubes, false)!;
  }, []);
  return (
    <mesh geometry={geo}>
      <shaderMaterial
        ref={matRef}
        transparent
        depthWrite={false}
        vertexShader={VERT_SHADER}
        fragmentShader={FRAG_SHADER}
        uniforms={{
          uTime: { value: 0 },
          uFlex: { value: 0 },
          uSpread: { value: 1 },
          uSpeed: { value: 1 },
          uColorA: { value: new THREE.Color(MOODS[0][0]) },
          uColorB: { value: new THREE.Color(MOODS[0][1]) },
        }}
      />
    </mesh>
  );
}

function Vertebrae() {
  const inst = useRef<THREE.InstancedMesh>(null!);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const curve = useMemo(() => spineCurve(), []);
  const points = useMemo(
    () => Array.from({ length: VERT }, (_, i) => curve.getPoint(i / (VERT - 1))),
    [curve],
  );
  const scroll = useScroll();
  useFrame((state) => {
    const time = state.clock.elapsedTime;
    const focusY = -scroll.offset * SPAN - 2.2;
    for (let i = 0; i < VERT; i++) {
      const p = points[i];
      const focus = Math.max(0, 1 - Math.abs(p.y - focusY) / 2.6);
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
    <instancedMesh ref={inst} args={[undefined, undefined, VERT]} castShadow>
      <cylinderGeometry args={[0.5, 0.5, 0.9, 30]} />
      <meshStandardMaterial color={GOLD} emissive={GOLD} emissiveIntensity={0.3} metalness={0.78} roughness={0.26} />
    </instancedMesh>
  );
}

function Badge({ position, label, speed }: { position: [number, number, number]; label: string; speed: number }) {
  const ref = useRef<THREE.Group>(null!);
  useFrame((s) => { if (ref.current) ref.current.rotation.y = s.clock.elapsedTime * speed; });
  return (
    <Float speed={2} rotationIntensity={0.3} floatIntensity={0.7} position={position}>
      <group ref={ref}>
        <mesh>
          <circleGeometry args={[0.5, 48]} />
          <meshStandardMaterial color="#fcf5e6" metalness={0.2} roughness={0.5} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, 0, 0.002]}>
          <ringGeometry args={[0.43, 0.5, 48]} />
          <meshStandardMaterial color={GOLD} emissive={GOLD} emissiveIntensity={0.25} metalness={0.85} roughness={0.22} side={THREE.DoubleSide} />
        </mesh>
        <Text position={[0, 0, 0.02]} fontSize={0.1} lineHeight={1.1} color="#8a6a1f" maxWidth={0.78} textAlign="center" anchorX="center" anchorY="middle">
          {label}
        </Text>
      </group>
    </Float>
  );
}

function Motes() {
  const ref = useRef<THREE.Points>(null!);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const n = 280;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 10;
      pos[i * 3 + 1] = -Math.random() * SPAN;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 6;
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);
  useFrame((s) => { if (ref.current) ref.current.rotation.y = s.clock.elapsedTime * 0.015; });
  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial size={0.05} color="#d9b25e" transparent opacity={0.5} sizeAttenuation depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
}

function Scene({ onActive }: { onActive: (i: number) => void }) {
  const scroll = useScroll();
  const mat = useRef<THREE.ShaderMaterial | null>(null);
  const cA = useMemo(() => new THREE.Color(), []);
  const cB = useMemo(() => new THREE.Color(), []);
  useFrame((state, dt) => {
    const off = scroll.offset;
    const camY = -off * SPAN;
    state.camera.position.set(Math.sin(off * Math.PI * 1.4) * 0.5, camY, 5);
    state.camera.lookAt(state.camera.position.x * 0.5, camY - 2.2, 0);
    const sec = Math.min(PAGES - 1, Math.round(off * (PAGES - 1)));
    onActive(sec);
    if (mat.current) {
      const u = mat.current.uniforms;
      u.uTime.value = state.clock.elapsedTime;
      const seg = off * (PAGES - 1);
      u.uFlex.value = Math.abs(Math.sin(seg * Math.PI)); // flex mid-transition
      const m = MOODS[sec];
      cA.set(m[0]); cB.set(m[1]);
      (u.uColorA.value as THREE.Color).lerp(cA, Math.min(1, dt * 3));
      (u.uColorB.value as THREE.Color).lerp(cB, Math.min(1, dt * 3));
      const mo = MORPH[sec];
      u.uSpread.value += (mo[0] - u.uSpread.value) * Math.min(1, dt * 2.5);
      u.uSpeed.value += (mo[1] - u.uSpeed.value) * Math.min(1, dt * 2.5);
    }
  });
  return (
    <>
      <ambientLight intensity={0.95} />
      <directionalLight position={[3, 4, 5]} intensity={1.15} />
      <directionalLight position={[-3, -2, 2]} intensity={0.4} color="#fff3d6" />
      <Vertebrae />
      <MuscleFibers matRef={mat} />
      <Motes />
      <group position={[0, -0.5, 1.5]}>
        <Badge position={[-1.9, -0.2, 0]} label={"SPORTS\nTHERAPY\nB.Sc"} speed={0.5} />
        <Badge position={[1.9, -1.4, 0.2]} label={"MARATHON\nCOACH"} speed={-0.4} />
        <Badge position={[-1.6, -3.4, 0.3]} label={"MOM\nAPPROVED"} speed={0.45} />
      </group>
    </>
  );
}

function GlassCards() {
  const ref = useRef<HTMLDivElement>(null);
  function move(e: React.MouseEvent) {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty("--rx", `${-y * 8}deg`);
    el.style.setProperty("--ry", `${x * 10}deg`);
  }
  function leave() {
    ref.current?.style.setProperty("--rx", "0deg");
    ref.current?.style.setProperty("--ry", "0deg");
  }
  return (
    <div className="glass-grid" ref={ref} onMouseMove={move} onMouseLeave={leave}>
      {t.spine.packages.map((p, i) => (
        <div className={`glass-card ${i === 1 ? "feat" : ""}`} key={p.n} style={{ ["--i" as string]: i }}>
          <span className="gc-num">{p.n}</span>
          <span className="gc-unit">{t.spine.sessionsWord}</span>
          <span className="gc-tag">{p.d}</span>
        </div>
      ))}
    </div>
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
      <section className="spine-sec packages">
        <span className="spine-num">{S.packagesNum}</span>
        <h2>{S.packagesTitle}</h2>
        <p>{S.packagesSub}</p>
        <GlassCards />
      </section>
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
      <Canvas dpr={[1, 1.8]} camera={{ position: [0, 0, 5], fov: 42 }} gl={{ antialias: true, powerPreference: "high-performance" }}>
        <color attach="background" args={[CREAM]} />
        <fog attach="fog" args={[CREAM, 8, 25]} />
        <ScrollControls pages={PAGES} damping={0.3}>
          <Scene onActive={setActive} />
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
