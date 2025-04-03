import * as THREE from 'three';
import { WorldManager } from './worldManager.js';
import { PlayerController } from './playerController.js';
import { UIManager } from './uiManager.js';
import { Minimap } from './minimap.js';

// Basic Scene Setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
const renderer = new THREE.WebGLRenderer({
    canvas: document.getElementById('game-canvas'),
    antialias: true 
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio); 

// Enable Shadow Mapping
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.VSMShadowMap; 

// Tone mapping for more realistic lighting
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1; 
renderer.outputColorSpace = THREE.SRGBColorSpace; 


// Game Components
const worldManager = new WorldManager(scene);
const uiManager = new UIManager();
const playerController = new PlayerController(camera, scene, worldManager, uiManager);
const minimap = new Minimap(worldManager); 

// Make core components accessible for debugging
window.game = {
    scene,
    camera,
    renderer,
    worldManager,
    playerController,
    uiManager,
    minimap 
};

window.loadNewDebugRoom = async (prompt, type) => {
    if (window.game && window.game.worldManager) {
        await window.game.worldManager.loadNewDebugRoom(prompt, type);
    } else {
        console.error("WorldManager not found on window.game");
    }
};

// Enhanced Lighting Setup
const ambientLight = new THREE.AmbientLight(0x708090, 0.5); 
scene.add(ambientLight);

const hemiLight = new THREE.HemisphereLight(0xADD8E6, 0x404020, 0.8); 
hemiLight.position.set(0, 50, 0); 
scene.add(hemiLight);

const mainLight = new THREE.DirectionalLight(0xffffff, 1.8); 
mainLight.position.set(25, 40, 35); 
mainLight.castShadow = true;
scene.add(mainLight);
mainLight.target = new THREE.Object3D();
scene.add(mainLight.target);

mainLight.shadow.mapSize.width = 2048; 
mainLight.shadow.mapSize.height = 2048;
mainLight.shadow.camera.near = 1; 
mainLight.shadow.camera.far = 150; 
const shadowCamSize = worldManager.tileSize * 0.8; 
mainLight.shadow.camera.left = -shadowCamSize;
mainLight.shadow.camera.right = shadowCamSize;
mainLight.shadow.camera.top = shadowCamSize;
mainLight.shadow.camera.bottom = -shadowCamSize;
mainLight.shadow.bias = -0.0002; 
mainLight.shadow.blurSamples = 16; 
mainLight.shadow.radius = 4; 


// Initial Setup
playerController.loadPlayerModel('/path/to/your/first-person-rig.gltf') 
    .then(() => console.log("Player model setup complete (loaded or placeholder)."))
    .catch(err => console.error("Error during player model setup:", err));

// Game Loop
const clock = new THREE.Clock(); 
function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta(); 

    playerController.update(delta);
    worldManager.update(playerController.getPlayerPosition()); 
    minimap.update(playerController.getPlayerPosition()); 

    const playerPos = playerController.getPlayerPosition();
    mainLight.target.position.set(playerPos.x, 0, playerPos.z);
    mainLight.target.updateMatrixWorld(); 

    renderer.render(scene, camera);
}

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    minimap.updateCanvasSize(); 
});

// Initial world generation
worldManager.generateInitialWorld().then(() => {
    console.log("Initial world generated, starting animation loop.");
    animate(); 
}).catch(error => {
    console.error("Critical Error: Failed to generate initial world. Cannot start game.", error);
    uiManager.showNotification("FATAL: Could not load initial world. Please refresh.", "error", 10000);
});