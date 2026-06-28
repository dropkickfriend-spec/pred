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

const STRIPE_VERT = `void main() { gl_Position = vec4(position, 1.0); }`;

const STRIPE_FRAG = `
  uniform vec3  colorA;
  uniform vec3  colorB;
  uniform float stripes;
  uniform float beat;
  uniform vec2  resolution;

  void main() {
    vec2 uv = gl_FragCoord.xy / resolution;
    float band = mod(uv.y * stripes, 1.0);
    vec3 col = band > 0.5 ? colorA : colorB;
    col *= 1.0 + beat * 0.35;
    gl_FragColor = vec4(col, 1.0);
  }
`;

export class ThreeVisualEngine {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private particles: THREE.Points;
  private membrane: THREE.Mesh;
  private beatLight: THREE.PointLight;
  private state: BandState;
  private frameId = 0;
  private positions: Float32Array;

  // Munker-White background (separate scene, ortho camera)
  private bgScene: THREE.Scene;
  private bgCamera: THREE.OrthographicCamera;
  private bgMat: THREE.ShaderMaterial;
  private bgBeat = 0;

  constructor(canvas: HTMLCanvasElement, state: BandState) {
    this.state = state;

    const parent = canvas.parentElement;
    const w = parent ? parent.clientWidth : window.innerWidth;
    const h = parent ? parent.clientHeight : window.innerHeight;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(w, h);
    this.renderer.autoClear = false;

    // --- Background stripe scene (Munker-White illusion) ---
    this.bgScene = new THREE.Scene();
    this.bgCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const styleCol = new THREE.Color(STYLE_COLORS[state.style]);
    this.bgMat = new THREE.ShaderMaterial({
      uniforms: {
        colorA:     { value: styleCol.clone().multiplyScalar(0.12) },
        colorB:     { value: new THREE.Color(0x020507) },
        stripes:    { value: 18.0 },
        beat:       { value: 0.0 },
        resolution: { value: new THREE.Vector2(w, h) },
      },
      vertexShader:   STRIPE_VERT,
      fragmentShader: STRIPE_FRAG,
      depthWrite: false,
      depthTest:  false,
    });
    this.bgScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.bgMat));

    // --- Main scene ---
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

    // Particle cloud
    const count = 1400;
    this.positions = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i++) {
      this.positions[i] = (Math.random() - 0.5) * 6;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    const mat = new THREE.PointsMaterial({
      color: STYLE_COLORS[state.style],
      size: 0.045,
      transparent: true,
      opacity: 0.85,
    });
    this.particles = new THREE.Points(geo, mat);
    this.scene.add(this.particles);

    // Icosahedron wireframe membrane
    const memGeo = new THREE.IcosahedronGeometry(2.2, 2);
    const memMat = new THREE.MeshPhongMaterial({
      color: STYLE_COLORS[state.style],
      wireframe: true,
      transparent: true,
      opacity: 0.18,
    });
    this.membrane = new THREE.Mesh(memGeo, memMat);
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

    const t = Date.now() * 0.001;
    const chaos = this.state.chaos;

    // Drift particles
    for (let i = 0; i < this.positions.length; i += 3) {
      this.positions[i]     += Math.sin(t + i) * 0.003 * (1 + chaos * 3);
      this.positions[i + 1] += Math.cos(t + i) * 0.003 * (1 + chaos * 3);
      this.positions[i + 2] += Math.sin(t * 0.7 + i) * 0.002;
      for (let j = 0; j < 3; j++) {
        if (Math.abs(this.positions[i + j]) > 4) this.positions[i + j] *= -0.9;
      }
    }
    (this.particles.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;

    this.membrane.rotation.y += 0.004 + chaos * 0.014;
    this.membrane.rotation.x += 0.002 + chaos * 0.006;

    // Decay point light and stripe beat flash
    this.beatLight.intensity *= 0.86;
    this.bgBeat *= 0.88;
    this.bgMat.uniforms.beat.value = this.bgBeat;

    this.controls.update();

    this.renderer.clear();
    this.renderer.render(this.bgScene, this.bgCamera);
    this.renderer.clearDepth();
    this.renderer.render(this.scene, this.camera);
  };

  public addPulse(color: string) {
    this.beatLight.color.set(color);
    this.beatLight.intensity = 2.5 + this.state.chaos * 5;
    this.bgBeat = 1.0;
  }

  public updateState(newState: Partial<BandState>) {
    this.state = { ...this.state, ...newState };
    const col = STYLE_COLORS[this.state.style];
    (this.particles.material as THREE.PointsMaterial).color.set(col);
    (this.membrane.material as THREE.MeshPhongMaterial).color.set(col);
    this.beatLight.color.set(col);

    const stripeCol = new THREE.Color(col).multiplyScalar(0.12);
    this.bgMat.uniforms.colorA.value.copy(stripeCol);
  }

  public dispose() {
    cancelAnimationFrame(this.frameId);
    window.removeEventListener('resize', this.resize);
    this.controls.dispose();
    this.renderer.dispose();
  }
}
