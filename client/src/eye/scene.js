/* =====================================================================
   S-02 · the eye: the Three.js scene behind the onboarding quiz

   Scene, back to front:
     core     a glow at the far end of the tunnel, follows the camera
     lines    2,600 light threads on the wall of an endless tunnel
              behind the pupil; moved in the vertex shader, never in JS
     iris     one plane at z = 0, drawn procedurally in its fragment
              shader; the pupil is a hole (discard), so the tunnel is
              visible through it and the camera can fly through it
     dust     motes in front of the eye, for depth while flying
   Post:  bloom (UnrealBloomPass, half resolution) → grade (vignette,
          grain, chromatic split during the flight, white flash)

   This module draws the picture and nothing else. The quiz itself — the
   cards, the answers, the keys — is the React component EyeQuiz.jsx, which
   drives the scene through the controller createEyeScene() returns:
   depth (0 = in front of the eye, 1 = deep in the tunnel), a warp kick
   after each answer, the white flash at the end, the pointer for parallax.

   Speed and sharpness: the iris is baked once into a polar texture, so
   each frame costs one texture read per pixel and the scene renders at
   full screen resolution (up to 2× on dense screens), with 4× MSAA where
   WebGL 2 allows. If frames still run long it steps the resolution down
   to 1×, then turns bloom off. A lost GPU context calls onLost, and the
   component switches to the classic quiz.
   ===================================================================== */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const sm = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

/* ---------------------------------------------------------------------
   Shaders
   --------------------------------------------------------------------- */

// Ashima 3D simplex noise (MIT). Sampling it at (cos a, sin a)·k makes
// the iris pattern seamless around the circle.
const NOISE = /* glsl */`
vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x,289.0);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+2.0*C.xxx; vec3 x3=x0-1.0+3.0*C.xxx;
  i=mod(i,289.0);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=1.0/7.0; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
float fbm(vec3 p){float f=0.0,a=0.5; for(int i=0;i<4;i++){f+=a*snoise(p); p*=2.03; a*=0.5;} return f;}
`;

const VS_UV = /* glsl */`
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

// ---------------------------------------------------------------------
// The iris is drawn in two stages, which is what lets it be both sharp
// and cheap:
//
//   bake   once, when the intro opens: the full, expensive pattern
//          (three fibre layers, crypts, collarette, limbus, sclera) is
//          rendered into a 4096×1024 texture in polar form — angle along
//          x, distance from the pupil along y — with mipmaps and
//          anisotropic filtering. Done in strips over a few frames.
//   draw   every frame: one texture read per pixel, plus a little maths
//          for the light that runs along the fibres, the pupil rim and
//          the catchlight. So the scene can render at full screen
//          resolution and stay at 60 fps.
//
// Polar storage keeps the fibres crisp at any zoom: they run along the
// radius, which is the texture's own axis, and there are 4096 texels
// around the ring. The pupil can still dilate: the pattern is stored
// against t (0 at the pupil edge, 1 at the limbus) and stretches with it,
// as a real iris does.
// ---------------------------------------------------------------------
const T_MAX = 2.2;            // texture covers t ∈ [0, 2.2]: iris, then sclera

const BAKE_VS = /* glsl */`
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const BAKE_FS = /* glsl */`
varying vec2 vUv;
${NOISE}
const float TAU = 6.28318530718;
void main(){
  float a = (vUv.x - 0.5) * TAU;
  float t = vUv.y * ${T_MAX.toFixed(2)};
  float RP = 0.15, RI = 0.62;
  float r = RP + t * (RI - RP);
  vec2 ring = vec2(cos(a), sin(a));
  vec3 col;
  float glow = 0.0;

  if (t <= 1.04) {
    float wob = 0.05 * snoise(vec3(ring * 3.0, r * 4.0));
    vec2 dir = vec2(cos(a + wob), sin(a + wob));
    float n1 = snoise(vec3(dir * 21.0, r * 2.6));
    float n2 = snoise(vec3(dir * 47.0, r * 5.5));
    float n3 = snoise(vec3(dir * 95.0, r * 9.0));
    float n5 = snoise(vec3(dir * 180.0, r * 14.0));
    float fib  = pow(1.0 - abs(n1), 6.0);
    float fib2 = pow(1.0 - abs(n2), 9.0);
    float fib3 = pow(1.0 - abs(n3), 12.0);
    float fib4 = pow(1.0 - abs(n5), 14.0);
    float tt = clamp(t, 0.0, 1.0);

    col = mix(vec3(0.17, 0.07, 0.42), vec3(0.05, 0.02, 0.15), tt);
    col += vec3(0.40, 0.25, 0.85) * fib  * (0.45 + 0.30 * (1.0 - tt));
    col += vec3(0.70, 0.58, 1.00) * fib2 * 0.36;
    col += vec3(0.92, 0.86, 1.00) * fib3 * 0.20 * (1.0 - tt * 0.6);
    col += vec3(0.85, 0.80, 1.00) * fib4 * 0.10;
    float crypt = smoothstep(0.25, 0.75, fbm(vec3(dir * 7.0, r * 6.0 + 3.1)));
    col *= 1.0 - crypt * 0.45 * (1.0 - fib2);
    float cr = 0.36 + 0.05 * snoise(vec3(dir * 8.0, 1.7));
    col += vec3(0.90, 0.40, 0.95) * exp(-pow((tt - cr) / 0.047, 2.0)) * 0.26;
    col = mix(col, col * vec3(1.25, 0.85, 1.20) + vec3(0.10, 0.01, 0.12), smoothstep(0.32, 0.0, tt) * 0.7);
    col *= mix(1.0, 0.12, smoothstep(0.80, 1.0, tt));          // limbal ring
    glow = max(fib2, fib3 * 0.8);
  }
  if (t > 0.98) {
    vec2 p = ring * r;
    vec3 scl = mix(vec3(0.21, 0.18, 0.31), vec3(0.06, 0.04, 0.11), smoothstep(RI, RI + 0.30, r));
    scl *= 0.82 + 0.18 * snoise(vec3(p * 3.2, 4.0));
    float k = smoothstep(0.98, 1.04, t);
    col = t <= 1.04 ? mix(col, scl, k) : scl;
    glow *= 1.0 - k;
  }
  gl_FragColor = vec4(col, glow);
}
`;

const IRIS_FS = /* glsl */`
uniform float uTime, uP, uDilate;
uniform vec2 uPar;
uniform sampler2D uIris;
varying vec2 vUv;
${NOISE}
const float TAU = 6.28318530718;
void main(){
  vec2 p = (vUv - 0.5) * 8.0;
  float r = length(p);
  float RP = 0.150 * (1.0 + 0.035 * sin(uTime * 0.8)) * (1.0 + 0.70 * uDilate);   // pupil
  float RI = 0.620;                                                                // limbus
  if (r < RP * 0.985) discard;            // the way in: the tunnel shows through

  // deep space: one noise sample near the eye, none further out
  vec3 col = vec3(0.020, 0.010, 0.045);
  if (r < 3.4) {
    float neb = snoise(vec3(p * 0.55, uTime * 0.015));
    col += vec3(0.14, 0.05, 0.26) * smoothstep(-0.2, 0.9, neb) * 0.5 * smoothstep(3.4, 0.8, r);
  }

  float t = (r - RP) / (RI - RP);
  if (t < ${T_MAX.toFixed(2)}) {
    vec2 uv = vec2(atan(p.y, p.x) / TAU + 0.5, t / ${T_MAX.toFixed(2)});
#if HAS_GRAD
    // atan jumps by a full turn on one line; take the short way round so
    // the mip level there is chosen like everywhere else (no seam)
    vec2 gx = dFdx(uv), gy = dFdy(uv);
    gx.x -= floor(gx.x + 0.5); gy.x -= floor(gy.x + 0.5);
    vec4 tex = textureGrad(uIris, uv, gx, gy);
#else
    vec4 tex = texture2D(uIris, uv);
#endif
    vec3 eye = tex.rgb;
    // light travelling outward along the brightest fibres; faster as you go in
    float wave = sin(t * 16.0 - uTime * 1.3 - uP * 12.0 + tex.a * 5.0);
    eye += vec3(0.75, 0.55, 1.0) * tex.a * pow(max(wave, 0.0), 6.0) * (0.10 + 0.9 * uP) * step(t, 1.0);
    eye *= smoothstep(0.0, 0.09, t);                                           // dark pupil edge
    eye += vec3(0.80, 0.42, 1.0) * exp(-pow((r - RP) / 0.010, 2.0)) * (0.18 + 0.9 * uP);
    // the sclera dissolves into space
    col = mix(eye, col, smoothstep(1.47, ${T_MAX.toFixed(2)}, t));
  }

  // the wet surface: a catchlight that answers the pointer
  vec2 hp = p - vec2(-0.24, 0.23) - uPar * 0.06;
  col += vec3(1.0, 0.96, 1.0) * exp(-dot(hp, hp) / 0.0022) * 0.55 * (1.0 - smoothstep(0.0, 0.2, uP));

  col *= 1.0 + uP * 0.9;                                 // fibres turn to neon on the way in
  gl_FragColor = vec4(col, 1.0);
}
`;

// The tunnel. Each line has a tail and a head vertex; all motion is here.
const LINES_VS = /* glsl */`
uniform float uTravel, uWarp, uBase, uTime;
attribute vec4 aSeed;      // angle, radius, z offset, speed
attribute float aEnd;      // 0 tail, 1 head
attribute float aHue;
varying float vA; varying float vHue; varying float vEnd;
const float L = 42.0;
void main(){
  float s = mod(aSeed.z + uTravel * aSeed.w, L);
  float head = uBase - L + s + 0.6;
  float len = (0.35 + aSeed.w * 0.6) * (1.0 + uWarp * 7.0);
  float z = head - (1.0 - aEnd) * len;
  float ang = aSeed.x + uTime * 0.03 * (aHue - 0.5);
  vec3 pos = vec3(cos(ang) * aSeed.y, sin(ang) * aSeed.y, z);
  float far  = smoothstep(uBase - L, uBase - L * 0.55, z);
  float near = smoothstep(uBase + 0.6, uBase - 0.9, head);
  vA = far * near * mix(0.22, 1.0, aEnd);
  vHue = aHue; vEnd = aEnd;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;
const LINES_FS = /* glsl */`
uniform float uOpacity;
varying float vA; varying float vHue; varying float vEnd;
void main(){
  vec3 c = mix(vec3(0.42, 0.24, 1.0), vec3(0.95, 0.32, 0.92), vHue);
  c = mix(c, vec3(0.96, 0.90, 1.0), vEnd * 0.4);
  gl_FragColor = vec4(c * vA * uOpacity, 1.0);
}
`;

const DUST_VS = /* glsl */`
uniform float uTime, uPR;
attribute float aSize;
varying float vFade;
void main(){
  vec3 p = position;
  p.y += sin(uTime * 0.2 + position.x * 3.0) * 0.03;
  p.x += cos(uTime * 0.15 + position.z * 2.0) * 0.03;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float d = -mv.z;
  vFade = smoothstep(0.05, 0.5, d) * smoothstep(6.0, 2.0, d);
  gl_PointSize = aSize * uPR * 11.0 / max(d, 0.05);
  gl_Position = projectionMatrix * mv;
}
`;
const DUST_FS = /* glsl */`
uniform float uOpacity;
varying float vFade;
void main(){
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(vec3(0.80, 0.70, 1.0) * a * vFade * uOpacity, 1.0);
}
`;

const CORE_FS = /* glsl */`
uniform float uCore;
varying vec2 vUv;
void main(){
  float d = length(vUv - 0.5);
  vec3 c = vec3(0.98, 0.94, 1.0) * exp(-d * d * 260.0) * 1.2
         + vec3(0.62, 0.30, 1.0) * exp(-d * d * 30.0) * 0.55
         + vec3(0.85, 0.25, 0.80) * exp(-d * d * 8.0) * 0.18;
  gl_FragColor = vec4(c * uCore, 1.0);
}
`;

const GRADE = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uCA: { value: 0 }, uFlash: { value: 0 } },
  vertexShader: VS_UV,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uTime, uCA, uFlash; varying vec2 vUv;
    void main(){
      vec2 c = vUv - 0.5; float d = length(c);
      vec2 o = c * uCA * 0.018;
      vec3 col = vec3(texture2D(tDiffuse, vUv + o).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - o).b);
      col *= 1.0 - smoothstep(0.32, 0.86, d) * 0.62;
      float g = fract(sin(dot(vUv * vec2(1931.7, 1103.3) + uTime, vec2(12.9898, 78.233))) * 43758.5453);
      col += (g - 0.5) * 0.03;
      col = mix(col, vec3(0.93, 0.87, 1.0), uFlash);
      gl_FragColor = vec4(col, 1.0);
    }`,
};

/**
 * Builds the scene on `canvas`, sized to `host`. Returns the controller, or
 * null when WebGL is not available (the caller then shows the classic quiz).
 *
 * @param {HTMLElement} host     the full-screen element the canvas fills
 * @param {HTMLCanvasElement} canvas
 * @param {object} hooks
 * @param {() => void} hooks.onLost         the GPU context was lost
 * @param {(depth: number) => void} hooks.onDepth  every frame, the current depth
 */
export function createEyeScene(host, canvas, { onLost, onDepth }) {
  const calm = reduceMotion();
  /* ---------------------------------------------------------------------
     State
     --------------------------------------------------------------------- */
  const st = {
    phase: 'rest',            // rest → quiz → done
    p: 0, target: 0,          // depth, and where it is heading
    warp: 0, travel: 0, time: 0,
    mx: 0, my: 0, smx: 0, smy: 0, flash: 0, flashing: 0, z0: 2.4, step: 0, busy: false,
  };
  let renderer, composer, bloom, grade, scene, camera, irisMat, linesMat, dustMat, coreMat, core, irisMesh;
  let bake = null;                          // { rt, scene, cam, strip, strips } until the iris is baked
  let raf = 0, last = 0, frames = 0;


  /* ---------------------------------------------------------------------
     Quality. `scale` is pixels per CSS pixel. It starts at the screen's own
     density (capped at 2), so the picture is as sharp as the display. Every
     40 frames the average frame time is checked: when frames run long it
     steps down to 1×, then turns bloom off, and only then goes below 1×.
     --------------------------------------------------------------------- */
  const small = Math.min(innerWidth, innerHeight) < 700;
  const DPR = Math.min(Math.max(devicePixelRatio || 1, 1), 2);
  const Q = { scale: DPR, max: DPR, bloom: true, sum: 0, n: 0, changed: 0 };

  function applyQuality() {
    const w = host.clientWidth || innerWidth, h = host.clientHeight || innerHeight;
    renderer.setPixelRatio(Q.scale);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(Q.scale);
    composer.setSize(w, h);
    dustMat.uniforms.uPR.value = Q.scale;
    bloom.enabled = Q.bloom;
  }

  function adapt(ms, now) {
    frames += 1;
    if (frames < 30 || bake) return;          // shader compile and baking: not representative
    Q.sum += ms; Q.n += 1;
    if (Q.n < 40) return;
    const avg = Q.sum / Q.n;
    Q.sum = 0; Q.n = 0;
    if (now - Q.changed < 1200) return;
    if (avg > 22) {                           // slower than ~45 fps
      if (Q.scale > 1.01) Q.scale = Math.max(1, Q.scale - 0.25);
      else if (Q.bloom) Q.bloom = false;
      else if (Q.scale > 0.76) Q.scale = 0.75;
      else return;
    } else if (avg < 12) {                    // comfortably above 60 fps
      if (Q.scale < 0.99) Q.scale = 1;
      else if (!Q.bloom) Q.bloom = true;
      else if (Q.scale < Q.max - 0.01) Q.scale = Math.min(Q.max, Q.scale + 0.25);
      else return;
    } else return;
    Q.changed = now;
    applyQuality();
  }

  /** Renders the next strip of the polar iris texture. Eight strips, one per frame. */
  function bakeStrip() {
    const { rt, scene: bs, cam, strips } = bake;
    const h = rt.height / strips, y = bake.strip * h;
    const auto = renderer.autoClear;
    renderer.autoClear = false;
    rt.scissor.set(0, y, rt.width, h);
    rt.scissorTest = true;
    renderer.setRenderTarget(rt);
    renderer.render(bs, cam);
    renderer.setRenderTarget(null);
    rt.scissorTest = false;
    renderer.autoClear = auto;
    bake.strip += 1;
    if (bake.strip >= strips) {
      bs.children[0].geometry.dispose();
      bs.children[0].material.dispose();
      bake = null;
      canvas.classList.add('ready');       // fade the scene in once the eye is whole
    }
  }

  /* ---------------------------------------------------------------------
     Building the scene (once)
     --------------------------------------------------------------------- */
  function build() {
    try {
      renderer = new THREE.WebGLRenderer({
        canvas: canvas, antialias: false, powerPreference: 'high-performance',
        stencil: false, depth: true, failIfMajorPerformanceCaveat: false,
      });
    } catch { return false; }
    if (!renderer.getContext()) return false;
    renderer.setClearColor(0x05030b, 1);
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); onLost(); });

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(50, 1, 0.01, 120);

    // core glow at the end of the tunnel
    coreMat = new THREE.ShaderMaterial({
      uniforms: { uCore: { value: 0 } }, vertexShader: VS_UV, fragmentShader: CORE_FS,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    core = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), coreMat);
    scene.add(core);

    // tunnel threads
    const N = small ? 1600 : 2400;
    const seed = new Float32Array(N * 8), end = new Float32Array(N * 2), hue = new Float32Array(N * 2);
    for (let i = 0; i < N; i += 1) {
      const ang = Math.random() * Math.PI * 2;
      const rad = 0.18 + Math.pow(Math.random(), 1.7) * 2.4;
      const z0 = Math.random() * 42, sp = 0.6 + Math.random() * 0.9, h = Math.random();
      for (let k = 0; k < 2; k += 1) {
        const v = i * 2 + k;
        seed.set([ang, rad, z0, sp], v * 4); end[v] = k; hue[v] = h;
      }
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 6), 3));
    lg.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    lg.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    lg.setAttribute('aHue', new THREE.BufferAttribute(hue, 1));
    linesMat = new THREE.ShaderMaterial({
      uniforms: { uTravel: { value: 0 }, uWarp: { value: 0 }, uBase: { value: 0 }, uTime: { value: 0 }, uOpacity: { value: 0.1 } },
      vertexShader: LINES_VS, fragmentShader: LINES_FS,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const lines = new THREE.LineSegments(lg, linesMat);
    lines.frustumCulled = false;
    scene.add(lines);

    // the iris texture, baked in strips over the first frames (see bakeStrip)
    const gl2 = renderer.capabilities.isWebGL2;
    const big = !small && renderer.capabilities.maxTextureSize >= 4096;
    const rt = new THREE.WebGLRenderTarget(big ? 4096 : 2048, big ? 1024 : 512, {
      depthBuffer: false, generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
      wrapS: THREE.RepeatWrapping, wrapT: THREE.ClampToEdgeWrapping,
    });
    rt.texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const bakeScene = new THREE.Scene();
    bakeScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({ vertexShader: BAKE_VS, fragmentShader: BAKE_FS, depthTest: false, depthWrite: false })));
    bake = { rt, scene: bakeScene, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), strip: 0, strips: 8 };
    renderer.setRenderTarget(rt); renderer.clear(); renderer.setRenderTarget(null);

    // the iris: opaque, so its depth hides the tunnel everywhere but the pupil
    irisMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uP: { value: 0 }, uDilate: { value: 0 }, uPar: { value: new THREE.Vector2() },
        uIris: { value: rt.texture } },
      defines: { HAS_GRAD: gl2 ? 1 : 0 },
      vertexShader: VS_UV, fragmentShader: IRIS_FS,
    });
    irisMesh = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), irisMat);
    scene.add(irisMesh);

    // dust in front of the eye
    const D = small ? 220 : 360, dp = new Float32Array(D * 3), ds = new Float32Array(D);
    for (let i = 0; i < D; i += 1) {
      dp.set([(Math.random() - 0.5) * 3.2, (Math.random() - 0.5) * 2.2, Math.random() * 2.4 + 0.05], i * 3);
      ds[i] = 0.4 + Math.random() * 1.2;
    }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
    dg.setAttribute('aSize', new THREE.BufferAttribute(ds, 1));
    dustMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPR: { value: 1 }, uOpacity: { value: 0.32 } },
      vertexShader: DUST_VS, fragmentShader: DUST_FS,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const dust = new THREE.Points(dg, dustMat);
    dust.frustumCulled = false;
    scene.add(dust);

    // 4× multisampling smooths the 1-pixel tunnel threads (WebGL 2 only)
    // 8-bit colour: every GPU can multisample it, which is not true of half-float targets
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.UnsignedByteType, samples: gl2 ? 4 : 0 });
    composer = new EffectComposer(renderer, target);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.45, 0.45, 0.6);
    composer.addPass(bloom);
    grade = new ShaderPass(GRADE);
    composer.addPass(grade);

    addEventListener('resize', resize);
    resize();
    renderer.compile(scene, camera);          // compile the shaders now, not on the first visible frame

    return true;
  }

  function resize() {
    if (!renderer) return;
    const w = host.clientWidth || innerWidth, h = host.clientHeight || innerHeight;
    applyQuality();
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // Frame the iris at 60% of the shorter half of the view, so it fits a phone held upright.
    const halfTan = Math.tan(THREE.MathUtils.degToRad(25));
    st.z0 = 0.62 / (0.6 * halfTan * Math.min(1, camera.aspect));
  }

  /* ---------------------------------------------------------------------
     The loop
     --------------------------------------------------------------------- */
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const ms = last ? now - last : 16;
    const dt = Math.min(0.05, ms / 1000);
    last = now;
    st.time += dt;
    if (bake) bakeStrip();
    adapt(ms, now);

    // each answer is a glide of about a second and a half
    st.p = calm ? st.target : st.p + (st.target - st.p) * (1 - Math.exp(-dt * 1.9));
    st.warp *= Math.exp(-dt * 1.8);
    if (st.flashing) {
      st.flash = Math.min(1, (now - st.flashing) / 850);
      st.warp = Math.max(st.warp, 1.6);
    }
    st.smx += (st.mx - st.smx) * (1 - Math.exp(-dt * 3));
    st.smy += (st.my - st.smy) * (1 - Math.exp(-dt * 3));

    const p = st.p;
    // Zoom by a constant factor per step (log distance) down to 0.25, then through the pupil.
    const k = 0.68;
    const camZ = p < k ? st.z0 * Math.pow(0.25 / st.z0, p / k)
                       : 0.25 - 1.05 * easeInOut((p - k) / (1 - k));
    const par = 1 - sm(0, 0.7, p);
    const breathe = st.phase === 'rest' ? Math.sin(st.time * 0.5) * 0.02 : 0;
    camera.position.set(st.smx * 0.09 * par, -st.smy * 0.07 * par, camZ + breathe);
    camera.lookAt(st.smx * 0.02 * par, -st.smy * 0.02 * par, camZ - 10);
    camera.fov = 50 + 18 * sm(0.55, 1, p) + st.warp * 8;
    camera.updateProjectionMatrix();

    const inTunnel = p > 0.7;
    const speed = calm ? 0.4 : 0.45 + 2.8 * sm(0.45, 1, p) + st.warp * 18;
    st.travel += dt * speed;

    const base = Math.min(camZ, 0);
    irisMat.uniforms.uTime.value = st.time;
    irisMat.uniforms.uP.value = sm(0, 0.75, p);
    irisMat.uniforms.uDilate.value = sm(0.04, 0.6, p);
    irisMat.uniforms.uPar.value.set(st.smx, -st.smy);
    irisMesh.visible = camZ > -0.3;

    linesMat.uniforms.uTravel.value = st.travel;
    linesMat.uniforms.uWarp.value = calm ? 0 : Math.min(st.warp, 1.5);
    linesMat.uniforms.uBase.value = base;
    linesMat.uniforms.uTime.value = st.time;
    linesMat.uniforms.uOpacity.value = 0.10 + 1.05 * sm(0.25, 0.8, p);

    dustMat.uniforms.uTime.value = st.time;
    dustMat.uniforms.uOpacity.value = 0.32 * (1 - sm(0.6, 0.85, p));

    core.position.set(0, 0, base - 36);
    coreMat.uniforms.uCore.value = 0.02 + 0.8 * sm(0.45, 1, p) + Math.min(st.warp, 1.2) * 0.4;

    bloom.strength = 0.45 + 0.55 * sm(0.6, 0.95, p) + Math.min(st.warp, 1.5) * 0.3;
    bloom.threshold = 0.6 - 0.42 * sm(0.62, 0.9, p);
    bloom.radius = 0.45 + 0.2 * sm(0.4, 1, p);
    grade.uniforms.uTime.value = st.time;
    grade.uniforms.uCA.value = calm ? 0 : Math.min(st.warp, 1.5) * 0.5 * (inTunnel ? 1 : 0.4);
    grade.uniforms.uFlash.value = st.flash;

    onDepth(p);

    composer.render(dt);
  }

  if (!build()) return null;
  return {
    /** Where the camera is heading: 0 in front of the eye, 1 deep in the tunnel. */
    setTarget(depth) { st.target = depth; },
    /** Jump straight there (resuming a half-finished quiz). */
    jump(depth) { st.target = depth; st.p = depth; },
    /** 'rest' (the eye breathes), 'quiz' or 'done'. */
    setPhase(phase) { st.phase = phase; },
    /** A push forward after an answer; stronger the deeper the camera is. */
    kick(strength) { if (!calm) st.warp = strength === undefined ? 0.25 + 0.9 * st.p : strength; },
    /** The white flash before the diary opens. */
    flash() { st.flashing = performance.now(); },
    /** The pointer, from -1 to 1 on each axis, for a little parallax. */
    pointer(x, y) { st.mx = x; st.my = y; },
    start() {
      last = 0; frames = 0;
      cancelAnimationFrame(raf);
      resize();
      raf = requestAnimationFrame(frame);
    },
    dispose() {
      cancelAnimationFrame(raf);
      removeEventListener('resize', resize);
      composer.dispose();
      renderer.dispose();
    },
  };
}
