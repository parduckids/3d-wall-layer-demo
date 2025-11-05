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
  plasterboard: { 
    id: 'plasterboard', name: 'Plasterboard', thickness: 0.0125, color: '#e5d3b3', lambda: 0.25 
  },
  airGap: { 
    id: 'air-gap', name: 'Unventilated Air Gap', thickness: 0.05, color: '#cceeff', lambda: 0.16 
  },
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

scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const dirLight = new THREE.DirectionalLight(0xffffff, 1);
dirLight.position.set(3, 4, 5);
scene.add(dirLight);

const group = new THREE.Group();
scene.add(group);
let activeMeshes: THREE.Mesh[] = [];

const grid = new THREE.GridHelper(5, 10);
grid.position.y = -0.501;
scene.add(grid);

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
    const mat = new THREE.MeshStandardMaterial({ color: layer.color, roughness: 0.7 });

    if (i === 0) {
      const geo = new THREE.BoxGeometry(baseWidth, baseHeight, layer.thickness);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.z = zPos;
      mesh.userData = layer; 
      group.add(mesh);
      activeMeshes.push(mesh);
    } else {
      const cutWidth = Math.min(baseWidth * 0.9, baseWidth * i * cutawayStep);
      const cutHeight = Math.min(baseHeight * 0.9, baseHeight * i * cutawayStep);

      const heightA = baseHeight - cutHeight;
      const geoA = new THREE.BoxGeometry(baseWidth, heightA, layer.thickness);
      const meshA = new THREE.Mesh(geoA, mat);
      meshA.position.set(0, (heightA / 2) - (baseHeight / 2), zPos);
      meshA.userData = layer;

      const widthB = baseWidth - cutWidth;
      const geoB = new THREE.BoxGeometry(widthB, cutHeight, layer.thickness);
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

function updateWall() {
  const config = {
    wallType: selects.wallType.value,
    masonryType: selects.masonryType.value,
    insulation: selects.insulation.value,
    innerLeaf: selects.innerLeaf.value,
    outerFinish: selects.outerFinish.value,
  };

  const newLayers: WallLayer[] = [];
  
  if (config.wallType === 'masonry') {
    newLayers.push(wallDatabase.plasterboard);
  } else {
    renderWallFromLayers(newLayers);
    calcOutput.innerHTML = '<i>Please select a wall type.</i>';
    return;
  }

  if (config.innerLeaf) {
    newLayers.push(wallDatabase.masonry.innerLeaf[config.innerLeaf as keyof typeof wallDatabase.masonry.innerLeaf]);
  }

  if (config.insulation && config.masonryType) {
    const insulData = wallDatabase.masonry.insulation[config.insulation as keyof typeof wallDatabase.masonry.insulation];
    const totalCavityWidth = 0.1;
    
    if (config.masonryType === 'full-fill') {
      newLayers.push({ ...insulData, thickness: totalCavityWidth, name: `${insulData.name} (Full Fill)` });
    } else {
      const insulThickness = 0.05;
      const airGapThickness = totalCavityWidth - insulThickness;
      newLayers.push({ ...insulData, thickness: insulThickness, name: `${insulData.name} (Partial Fill)` });
      newLayers.push({ ...wallDatabase.airGap, thickness: airGapThickness });
    }
  }
  
  if (config.outerFinish) {
    newLayers.push(wallDatabase.masonry.outerFinish[config.outerFinish as keyof typeof wallDatabase.masonry.outerFinish]);
  }

  renderWallFromLayers(newLayers);
  calcOutput.innerHTML = `<b>Wall layers updated.</b>`;
}

function updateUIState() {
  const config = {
    wallType: selects.wallType.value,
    masonryType: selects.masonryType.value,
    insulation: selects.insulation.value,
    innerLeaf: selects.innerLeaf.value,
  };

  steps.step2.classList.add('hidden');
  steps.step3.classList.add('hidden');
  steps.step4.classList.add('hidden');
  steps.step5.classList.add('hidden');

  if (config.wallType === 'masonry') steps.step2.classList.remove('hidden');
  else return;
  if (config.masonryType) steps.step3.classList.remove('hidden');
  else return;
  if (config.insulation) steps.step4.classList.remove('hidden');
  else return;
  if (config.innerLeaf) steps.step5.classList.remove('hidden');
  else return;
}

Object.values(selects).forEach(select => {
  select.addEventListener('change', () => {
    updateUIState();
    updateWall();
  });
});

window.addEventListener('mousemove', (event: MouseEvent) => {
  mouse.x = (event.clientX / innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / innerHeight) * 2 + 1; 
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(activeMeshes);
  if (hits.length > 0) {
    const layerData = hits[0].object.userData as WallLayer;
    tooltip.style.opacity = '1';
    tooltip.style.left = event.clientX + 10 + 'px';
    tooltip.style.top = event.clientY + 10 + 'px';
    tooltip.innerHTML = `<b>${layerData.name}</b>`;
  } else {
    tooltip.style.opacity = '0';
  }
});

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

function animate() {
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

updateUIState();
updateWall();
animate();
