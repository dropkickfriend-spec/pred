import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { BandState, MusicStyle } from '../audio/types';

const STYLE_COLORS: Record<MusicStyle, number> = {
  EDM:    0x22d3ee,
  HipHop: 0x8b5cf6,
  Jazz:   0xf59e0b,
  African:0xef4444,
  Indian: 0xf97316,
};

// ── Background shader ────────────────────────────────────────────────────────
// - A thin full-spectrum horizontal rainbow band at y=0.5
// - A subtle radial glow in the current genre colour — this is the ONE colour
//   that overlaps the particles from behind (Munker-White assimilation)
const BG_VERT = `void main() { gl_Position = vec4(position, 1.0); }`;

const BG_FRAG = `
  uniform vec2 resolution;
  uniform vec3 genreColor;
  uniform float beat;

  // Minimal HSV → RGB (no branching, GLSL-safe)
  vec3 hsv2rgb(float h) {
    vec3 p = abs(fract(vec3(h) + vec3(1.0, 2.0/3.0, 1.0/3.0)) * 6.0 - 3.0);
    return clamp(p - 1.0, 0.0, 1.0);
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / resolution;

    // ── Thin rainbow (as thin as possible) ──────────────────────────────────
    float bandCenter = 0.5;
    float bandH      = 0.004;                       // ~4 px on 1080 p
    float dist       = abs(uv.y - bandCenter);
    float inBand     = smoothstep(bandH + 0.003, bandH, dist);
    vec3  rainbow    = hsv2rgb(uv.x);               // full spectrum L→R

    // ── Genre colour radial glow ─────────────────────────────────────────────
    // The ONE colour that bleeds through / overlaps the particle cloud.
    // Very subtle so the illusion is felt rather than seen directly.
    float glow = smoothstep(0.58, 0.0, length(uv - vec2(0.5, 0.5))) * 0.11;

    vec3 col = rainbow * inBand + genreColor * glow;
    col *= 1.0 + beat * 0.6;

    gl_FragColor = vec4(col, 1.0);
  }
`;

interface ParticleLayer {
  points:    THREE.Points;
  positions: Float32Array;
  mat:       THREE.PointsMaterial;
  sizeBase:  number;
  speedMult: number;
}

// Desaturated, lightened version of style colour → neutral dots pick up
// stripe/glow tint via Munker-White contrast assimilation.
function particleColor(styleHex: number): THREE.Color {
  const c   = new THREE.Color(styleHex);
  const lum = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
  return new THREE.Color(
    c.r * 0.28 + lum * 0.72,
    c.g * 0.28 + lum * 0.72,
    c.b * 0.28 + lum * 0.72,
  ).addScalar(0.22);
}

export class ThreeVisualEngine {
  private renderer:  THREE.WebGLRenderer;
  private scene:     THREE.Scene;
  private camera:    THREE.PerspectiveCamera;
  private controls:  OrbitControls;
  private membrane:  THREE.Mesh;
  private beatLight: THREE.PointLight;
  private state:     BandState;
  private frameId  = 0;

  // Three-layer particle system — different sizes + speeds create phase moiré
  private layers: ParticleLayer[] = [];

  // Beat reactivity
  private beatPulse = 0;

  // Background scene
  private bgScene:  THREE.Scene;
  private bgCamera: THREE.OrthographicCamera;
  private bgMat:    THREE.ShaderMaterial;
  private bgBeat  = 0;

  constructor(canvas: HTMLCanvasElement, state: BandState) {
    this.state = state;

    const parent = canvas.parentElement;
    const w = parent ? parent.clientWidth : window.innerWidth;
    const h = parent ? parent.clientHeight : window.innerHeight;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(w, h);
    this.renderer.autoClear = false;

    // ── Background ─────────────────────────────────────────────────────────
    this.bgScene  = new THREE.Scene();
    this.bgCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.bgMat = new THREE.ShaderMaterial({
      uniforms: {
        resolution: { value: new THREE.Vector2(w, h) },
        genreColor: { value: new THREE.Color(STYLE_COLORS[state.style]) },
        beat:       { value: 0.0 },
      },
      vertexShader:   BG_VERT,
      fragmentShader: BG_FRAG,
      depthWrite: false,
      depthTest:  false,
    });
    this.bgScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.bgMat));

    // ── Main scene ─────────────────────────────────────────────────────────
    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(75, w / h, 0.1, 1000);
    this.camera.position.z = 5;

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;

    this.scene.add(new THREE.AmbientLight(0x111122));

    this.beatLight = new THREE.PointLight(STYLE_COLORS[state.style], 0, 18);
    this.beatLight.position.set(0, 0, 3);
    this.scene.add(this.beatLight);

    // ── Three particle layers ─────────────────────────────────────────────
    // Layer 0: 1200 small  (size 0.05 ),  speed ×1.00  — primary grid
    // Layer 1:  300 medium (size 0.145),  speed ×0.63  — secondary grid
    // Layer 2:   60 large  (size 0.42 ),  speed ×0.37  — tertiary grid
    //
    // Overlapping semi-transparent layers at different spatial/temporal
    // frequencies produce the moiré / secondary-phase interference pattern.
    const pCol = particleColor(STYLE_COLORS[state.style]);
    const layerDefs = [
      { count: 1200, size: 0.05,  opacity: 0.80, speedMult: 1.00 },
      { count:  300, size: 0.145, opacity: 0.55, speedMult: 0.63 },
      { count:   60, size: 0.42,  opacity: 0.38, speedMult: 0.37 },
    ];
    this.layers = layerDefs.map(def => {
      const positions = new Float32Array(def.count * 3);
      for (let i = 0; i < def.count * 3; i++) positions[i] = (Math.random() - 0.5) * 6;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const mat = new THREE.PointsMaterial({
        color: pCol.clone(), size: def.size,
        transparent: true, opacity: def.opacity, sizeAttenuation: true,
      });
      const points = new THREE.Points(geo, mat);
      this.scene.add(points);
      return { points, positions, mat, sizeBase: def.size, speedMult: def.speedMult };
    });

    // ── Wireframe membrane ─────────────────────────────────────────────────
    this.membrane = new THREE.Mesh(
      new THREE.IcosahedronGeometry(2.2, 2),
      new THREE.MeshPhongMaterial({
        color: STYLE_COLORS[state.style], wireframe: true,
        transparent: true, opacity: 0.18,
      }),
    );
    this.scene.add(this.membrane);

    window.addEventListener('resize', this.resize);
    this.animate();
  }

  private resize = () => {
    const parent = this.renderer.domElement.parentElement;
    const w = parent ? parent.clientWidth : window.innerWidth;
    const h = parent ? parent.clientHeight : window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.bgMat.uniforms.resolution.value.set(w, h);
  };

  private animate = () => {
    this.frameId = requestAnimationFrame(this.animate);

    const t     = Date.now() * 0.001;
    const chaos = this.state.chaos;

    // Each layer drifts at its own speed → different spatial phase over time
    this.layers.forEach(layer => {
      const sm  = layer.speedMult;
      const pos = layer.positions;
      const jolt = this.beatPulse * 0.045;

      for (let i = 0; i < pos.length; i += 3) {
        pos[i]     += Math.sin(t * sm + i * 0.13) * 0.003 * sm * (1 + chaos * 3)
                    + (Math.random() - 0.5) * jolt;
        pos[i + 1] += Math.cos(t * sm + i * 0.13) * 0.003 * sm * (1 + chaos * 3)
                    + (Math.random() - 0.5) * jolt;
        pos[i + 2] += Math.sin(t * sm * 0.7 + i) * 0.002 * sm;
        for (let j = 0; j < 3; j++) {
          if (Math.abs(pos[i + j]) > 4) pos[i + j] *= -0.9;
        }
      }
      (layer.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;

      // Point size pulses on beat (each layer scaled differently → phase feel)
      layer.mat.size = layer.sizeBase * (1 + this.beatPulse * (0.5 - layer.speedMult * 0.1));
    });

    this.membrane.scale.setScalar(1 + this.beatPulse * 0.38);
    this.membrane.rotation.y += 0.004 + chaos * 0.014;
    this.membrane.rotation.x += 0.002 + chaos * 0.006;

    this.beatPulse             *= 0.86;
    this.bgBeat                *= 0.88;
    this.beatLight.intensity   *= 0.86;
    this.bgMat.uniforms.beat.value = this.bgBeat;

    this.controls.update();
    this.renderer.clear();
    this.renderer.render(this.bgScene, this.bgCamera);
    this.renderer.clearDepth();
    this.renderer.render(this.scene, this.camera);
  };

  public addPulse(type: 'kick' | 'snare' | 'hihat', color: string) {
    this.beatLight.color.set(color);
    if (type === 'kick') {
      this.beatPulse = 1.0;
      this.beatLight.intensity = 3.2 + this.state.chaos * 5;
      this.bgBeat = 1.0;
    } else if (type === 'snare') {
      this.beatPulse = Math.max(this.beatPulse, 0.62);
      this.beatLight.intensity = 2.0 + this.state.chaos * 3;
      this.bgBeat = Math.max(this.bgBeat, 0.52);
    } else {
      this.beatPulse = Math.max(this.beatPulse, 0.18);
      this.beatLight.intensity = Math.max(this.beatLight.intensity, 1.1);
      this.bgBeat = Math.max(this.bgBeat, 0.18);
    }
  }

  public updateState(newState: Partial<BandState>) {
    this.state = { ...this.state, ...newState };
    const hex  = STYLE_COLORS[this.state.style];
    const pCol = particleColor(hex);
    this.layers.forEach(l => l.mat.color.copy(pCol));
    (this.membrane.material as THREE.MeshPhongMaterial).color.set(hex);
    this.beatLight.color.set(hex);
    this.bgMat.uniforms.genreColor.value.set(hex);
  }

  public dispose() {
    cancelAnimationFrame(this.frameId);
    window.removeEventListener('resize', this.resize);
    this.controls.dispose();
    this.renderer.dispose();
  }
}
