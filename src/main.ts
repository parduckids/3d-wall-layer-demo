import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import './style.css';

interface WallLayer {
  id: string;
  name: string;
  thickness: number;
  color: string;
  lambda: number;
}

const wallDatabase = {
  plasterboard: { id: 'plasterboard', name: 'Plasterboard', thickness: 0.0125, color: '#e5d3b3', lambda: 0.25 },
  airGap: { id: 'air-gap', name: 'Unventilated Air Gap', thickness: 0.05, color: '#cceeff', lambda: 0.16 },
  masonry: {
    innerLeaf: {
      'aircrete-hi': { id: 'aircrete-hi', name: 'Aircrete Hi-Strength (100mm)', thickness: 0.1, color: '#d0d0d0', lambda: 0.15 },
      'aircrete-std': { id: 'aircrete-std', name: 'Aircrete Standard (100mm)', thickness: 0.1, color: '#d9d9d9', lambda: 0.11 },
      'medium-dense': { id: 'medium-dense', name: 'Medium Dense Block (100mm)', thickness: 0.1, color: '#b0b0b0', lambda: 0.51 },
      'dense': { id: 'dense', name: 'Dense Concrete Block (100mm)', thickness: 0.1, color: '#999999', lambda: 1.13 },
    },
    insulation: {
      'nyrock-032': { id: 'nyrock-032', name: 'NyRock Cavity Slab', color: '#d9e38f', lambda: 0.032 },
      'cavity-slab-035': { id: 'cavity-slab-035', name: 'Cavity Slab (035)', color: '#e3d68f', lambda: 0.035 },
    },
    outerFinish: {
      'brick': { id: 'brick', name: 'Brick Outer Leaf (102.5mm)', thickness: 0.1025, color: '#b65a3a', lambda: 0.77 },
      'render': { id: 'render', name: 'Block & Render (110mm)', thickness: 0.11, color: '#e0e0e0', lambda: 0.62 },
    }
  }
};

// === THREE SETUP ===
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf4f4f4);

const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(2, 2, 2.5);
camera.lookAt(0, 0.25, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.25, 0);
controls.enableDamping = true;

// Lighting
scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const dirLight = new THREE.DirectionalLight(0xffffff, 1);
dirLight.position.set(3, 4, 5);
scene.add(dirLight);

// Group for wall
const group = new THREE.Group();
scene.add(group);
let activeMeshes: THREE.Mesh[] = [];

const grid = new THREE.GridHelper(5, 10);
grid.position.y = -0.501;
scene.add(grid);

// Tooltip and UI elements
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const tooltip = document.getElementById('tooltip') as HTMLElement;
const calcOutput = document.getElementById('calc-results') as HTMLElement;

const selects = {
  wallType: document.getElementById('select-wall-type') as HTMLSelectElement,
  masonryType: document.getElementById('select-masonry-type') as HTMLSelectElement,
  insulation: document.getElementById('select-insulation') as HTMLSelectElement,
  innerLeaf: document.getElementById('select-inner-leaf') as HTMLSelectElement,
  outerFinish: document.getElementById('select-outer-finish') as HTMLSelectElement,
};

const steps = {
  step1: document.getElementById('step-1') as HTMLDivElement,
  step2: document.getElementById('step-2') as HTMLDivElement,
  step3: document.getElementById('step-3') as HTMLDivElement,
  step4: document.getElementById('step-4') as HTMLDivElement,
  step5: document.getElementById('step-5') as HTMLDivElement,
};

// === TEXTURE LOADER ===
const textureLoader = new THREE.TextureLoader();
const brickTextures = {
  color: textureLoader.load(new URL('../textures/red_brick/red_brick_diff_1k.jpg', import.meta.url).href),
  normal: textureLoader.load(new URL('../textures/red_brick/red_brick_nor_dx_1k.jpg', import.meta.url).href),
  roughness: textureLoader.load(new URL('../textures/red_brick/red_brick_rough_1k.jpg', import.meta.url).href),
  ao: textureLoader.load(new URL('../textures/red_brick/red_brick_ao_1k.jpg', import.meta.url).href),
};
// SRGB color space and wrapping
brickTextures.color.colorSpace = THREE.SRGBColorSpace;
Object.values(brickTextures).forEach((t: THREE.Texture) => {
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(0.7, 0.7);
});

// === MATERIAL HELPER ===
function getMaterialForLayer(layer: WallLayer): THREE.Material {
  if (layer.id === 'brick') {
    return new THREE.MeshStandardMaterial({
      map: brickTextures.color,
      normalMap: brickTextures.normal,
      roughnessMap: brickTextures.roughness,
      aoMap: brickTextures.ao,
      roughness: 1.0,
    });
  }
  return new THREE.MeshStandardMaterial({
    color: layer.color,
    roughness: 0.7,
  });
}

// === GEOMETRY HELPER ===
function createBoxGeometry(w: number, h: number, d: number) {
  const geo = new THREE.BoxGeometry(w, h, d, 1, 1, 1);
  if (geo.attributes.uv) {
    geo.setAttribute('uv2', new THREE.BufferAttribute(geo.attributes.uv.array, 2));
  }
  return geo;
}

// === WALL RENDERING ===
function renderWallFromLayers(layers: WallLayer[]) {
  group.clear();
  activeMeshes = [];
  let offset = 0;
  const baseWidth = 1;
  const baseHeight = 1;
  const cutawayStep = 0.2;

  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i];
    const zPos = offset + layer.thickness / 2;
    const mat = getMaterialForLayer(layer);

    if (i === 0) {
      const geo = createBoxGeometry(baseWidth, baseHeight, layer.thickness);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.z = zPos;
      mesh.userData = layer;
      group.add(mesh);
      activeMeshes.push(mesh);
    } else {
      const cutWidth = Math.min(baseWidth * 0.9, baseWidth * i * cutawayStep);
      const cutHeight = Math.min(baseHeight * 0.9, baseHeight * i * cutawayStep);

      const heightA = baseHeight - cutHeight;
      const geoA = createBoxGeometry(baseWidth, heightA, layer.thickness);
      const meshA = new THREE.Mesh(geoA, mat);
      meshA.position.set(0, (heightA / 2) - (baseHeight / 2), zPos);
      meshA.userData = layer;

      const widthB = baseWidth - cutWidth;
      const geoB = createBoxGeometry(widthB, cutHeight, layer.thickness);
      const meshB = new THREE.Mesh(geoB, mat);
      meshB.position.set((widthB / 2) - (baseWidth / 2), (baseHeight / 2) - (cutHeight / 2), zPos);
      meshB.userData = layer;

      group.add(meshA, meshB);
      activeMeshes.push(meshA, meshB);
    }

    offset += layer.thickness;
  }

  group.position.z = -offset / 2;
}

// === INCREMENTAL WALL BUILD ===
let currentLayers: WallLayer[] = [];

function updateWallIncremental() {
  const config = {
    wallType: selects.wallType?.value ?? '',
    masonryType: selects.masonryType?.value ?? '',
    insulation: selects.insulation?.value ?? '',
    innerLeaf: selects.innerLeaf?.value ?? '',
    outerFinish: selects.outerFinish?.value ?? '',
  };

  currentLayers = [];

  if (config.wallType === 'masonry') currentLayers.push(wallDatabase.plasterboard);
  else {
    calcOutput!.innerHTML = '<i>Please select a wall type.</i>';
    return;
  }

  if (config.innerLeaf) {
    const inner = wallDatabase.masonry.innerLeaf[config.innerLeaf as keyof typeof wallDatabase.masonry.innerLeaf];
    currentLayers.push(inner);
  }

  if (config.insulation) {
    const insul = wallDatabase.masonry.insulation[config.insulation as keyof typeof wallDatabase.masonry.insulation];
    const totalCavity = 0.1;
    if (config.masonryType === 'full-fill') {
      currentLayers.push({ ...insul, thickness: totalCavity, name: `${insul.name} (Full Fill)` });
    } else {
      currentLayers.push({ ...insul, thickness: 0.05, name: `${insul.name} (Partial Fill)` });
      currentLayers.push({ ...wallDatabase.airGap, thickness: totalCavity - 0.05 });
    }
  }

  if (config.outerFinish) {
    const outer = wallDatabase.masonry.outerFinish[config.outerFinish as keyof typeof wallDatabase.masonry.outerFinish];
    currentLayers.push(outer);
  }

  renderWallFromLayers(currentLayers);
  calcOutput!.innerHTML = `<b>${currentLayers.length} layers rendered.</b>`;
}

// === UI STATE ===
function updateUIState() {
  const config = {
    wallType: selects.wallType?.value ?? '',
    masonryType: selects.masonryType?.value ?? '',
    insulation: selects.insulation?.value ?? '',
    innerLeaf: selects.innerLeaf?.value ?? '',
  };

  for (let i = 2; i <= 5; i++) {
    const step = steps[`step${i}` as keyof typeof steps];
    step?.classList.add('hidden');
  }

  if (config.wallType && steps.step2) steps.step2.classList.remove('hidden');
  if (config.masonryType && steps.step3) steps.step3.classList.remove('hidden');
  if (config.insulation && steps.step4) steps.step4.classList.remove('hidden');
  if (config.innerLeaf && steps.step5) steps.step5.classList.remove('hidden');
}

// Attach event listeners
Object.values(selects).forEach(select => {
  if (select) select.addEventListener('change', () => {
    updateUIState();
    updateWallIncremental();
  });
});

// === TOOLTIP INTERACTION ===
window.addEventListener('mousemove', (event: MouseEvent) => {
  mouse.x = (event.clientX / innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(activeMeshes);
  if (hits.length > 0) {
    const layerData = hits[0].object.userData as WallLayer;
    tooltip!.style.opacity = '1';
    tooltip!.style.left = event.clientX + 10 + 'px';
    tooltip!.style.top = event.clientY + 10 + 'px';
    tooltip!.innerHTML = `<b>${layerData.name}</b>`;
  } else {
    tooltip!.style.opacity = '0';
  }
});

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// === ANIMATION LOOP ===
function animate() {
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

// === INITIAL RENDER ===
updateUIState();
updateWallIncremental();
animate();
