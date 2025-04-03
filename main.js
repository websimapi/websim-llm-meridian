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
    antialias: true // Enable antialiasing for smoother edges
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio); // Use device pixel ratio for sharper rendering

// Enable Shadow Mapping
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Softer shadows

// Tone mapping for more realistic lighting
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace; // Correct color space


// Game Components
const worldManager = new WorldManager(scene);
const uiManager = new UIManager();
const playerController = new PlayerController(camera, scene, worldManager, uiManager);
const minimap = new Minimap(worldManager); // Create the minimap

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

// Improved Lighting Setup
scene.add(new THREE.AmbientLight(0x606080, 0.6)); // Slightly blueish ambient light, lower intensity

const hemiLight = new THREE.HemisphereLight(0xB1E1FF, 0xB97A20, 0.8); // Sky color, Ground color, Intensity
hemiLight.position.set(0, 50, 0);
scene.add(hemiLight);

const mainLight = new THREE.DirectionalLight(0xffffff, 1.5); // Brighter main light
mainLight.position.set(15, 30, 20); // Positioned higher and angled
mainLight.castShadow = true; // Enable shadows for this light
scene.add(mainLight);
scene.add(mainLight.target); // Required for directional light shadows

// Configure Shadow Properties
mainLight.shadow.mapSize.width = 2048; // Higher resolution shadows
mainLight.shadow.mapSize.height = 2048;
mainLight.shadow.camera.near = 0.5;
mainLight.shadow.camera.far = 500;
// Define the area covered by the shadow camera
const shadowCamSize = worldManager.tileSize * 0.75; // Cover slightly larger than the room
mainLight.shadow.camera.left = -shadowCamSize;
mainLight.shadow.camera.right = shadowCamSize;
mainLight.shadow.camera.top = shadowCamSize;
mainLight.shadow.camera.bottom = -shadowCamSize;
mainLight.shadow.bias = -0.0005; // Adjust bias to prevent shadow acne

// Add a helper for the shadow camera (optional, for debugging)
// const shadowCamHelper = new THREE.CameraHelper(mainLight.shadow.camera);
// scene.add(shadowCamHelper);


// Initial Setup
// Load player model (async) - call after player controller is initialized
playerController.loadPlayerModel('/path/to/your/first-person-rig.gltf') 
    .then(() => console.log("Player model loaded (or placeholder created)."))
    .catch(err => console.error("Failed to load player model:", err));

// Game Loop
function animate() {
    requestAnimationFrame(animate);

    const delta = window.game.playerController.clock.getDelta();

    playerController.update(delta);
    worldManager.update(playerController.getPlayerPosition());
    minimap.update(playerController.getPlayerPosition());

    // Update lighting target (e.g., make it follow the player slightly)
    const playerPos = playerController.getPlayerPosition();
    mainLight.target.position.set(playerPos.x, 0, playerPos.z); // Target the ground near the player
    mainLight.target.updateMatrixWorld(); // Important after moving the target


    renderer.render(scene, camera);
}

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    minimap.updateCanvasSize(); // Notify minimap of potential resize
});

// Initial world generation
worldManager.generateInitialWorld().then(() => {
    animate(); // Start the game loop
}).catch(error => {
    console.error("Failed to generate initial world:", error);
    uiManager.showNotification("Error: Could not load initial world.", "error");
});

// Add debug axes (optional)
// const axesHelper = new THREE.AxesHelper( 5 );
// scene.add(axesHelper );