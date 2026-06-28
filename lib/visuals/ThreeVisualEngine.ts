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

  constructor(canvas: HTMLCanvasElement, state: BandState) {
    this.state = state;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050810);

    const parent = canvas.parentElement;
    const w = parent ? parent.clientWidth : window.innerWidth;
    const h = parent ? parent.clientHeight : window.innerHeight;

    this.camera = new THREE.PerspectiveCamera(75, w / h, 0.1, 1000);
    this.camera.position.z = 5;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(w, h);

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
  };

  private animate = () => {
    this.frameId = requestAnimationFrame(this.animate);

    const t = Date.now() * 0.001;
    const chaos = this.state.chaos;

    // Drift particles — amplitude scales with chaos
    for (let i = 0; i < this.positions.length; i += 3) {
      this.positions[i]     += Math.sin(t + i) * 0.003 * (1 + chaos * 3);
      this.positions[i + 1] += Math.cos(t + i) * 0.003 * (1 + chaos * 3);
      this.positions[i + 2] += Math.sin(t * 0.7 + i) * 0.002;
      // soft boundary wrap
      for (let j = 0; j < 3; j++) {
        if (Math.abs(this.positions[i + j]) > 4) this.positions[i + j] *= -0.9;
      }
    }
    (this.particles.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;

    this.membrane.rotation.y += 0.004 + chaos * 0.014;
    this.membrane.rotation.x += 0.002 + chaos * 0.006;

    // Decay beat flash
    this.beatLight.intensity *= 0.86;

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  public addPulse(color: string) {
    this.beatLight.color.set(color);
    this.beatLight.intensity = 2.5 + this.state.chaos * 5;
  }

  public updateState(newState: Partial<BandState>) {
    this.state = { ...this.state, ...newState };
    const col = STYLE_COLORS[this.state.style];
    (this.particles.material as THREE.PointsMaterial).color.set(col);
    (this.membrane.material as THREE.MeshPhongMaterial).color.set(col);
    this.beatLight.color.set(col);
  }

  public dispose() {
    cancelAnimationFrame(this.frameId);
    window.removeEventListener('resize', this.resize);
    this.controls.dispose();
    this.renderer.dispose();
  }
}
