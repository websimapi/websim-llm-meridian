import * as THREE from 'three';
import { WorldManager } from './worldManager.js';
import { PlayerController } from './playerController.js';
import { UIManager } from './uiManager.js';
import { Minimap } from './minimap.js';

// Basic Scene Setup
const scene = new THREE.Scene();
// Ensure camera far plane is large enough for the skybox
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2500); // Increased far plane
const renderer = new THREE.WebGLRenderer({
    canvas: document.getElementById('game-canvas'),
    antialias: true,
    logarithmicDepthBuffer: true // Can help with depth precision issues with large scenes/skyboxes
});
renderer.setSize(window.innerWidth, window.innerHeight);
// renderer.toneMapping = THREE.ACESFilmicToneMapping; // Optional: improves visual quality
// renderer.outputEncoding = THREE.sRGBEncoding; // Optional: Correct color space

// Background color is now managed by WorldManager (can be null if skybox is used)
scene.background = null; // Start with no background, let WorldManager handle it

// Add fog for atmosphere, especially useful outdoors
scene.fog = new THREE.Fog(0xcccccc, 10, 150); // Color, near, far - Adjust as needed

// Game Components
const worldManager = new WorldManager(scene);
const uiManager = new UIManager();
// Pass worldManager for collision/interaction AND uiManager for potential notifications from player
const playerController = new PlayerController(camera, scene, worldManager, uiManager);
const minimap = new Minimap(worldManager); // Create the minimap

// Make core components accessible for debugging (optional, but helps with the current structure)
window.game = {
    scene,
    camera,
    renderer,
    worldManager,
    playerController,
    uiManager,
    minimap
};

// Define the debug function here, where worldManager is in scope
window.loadNewDebugRoom = async (prompt, type) => {
    if (window.game && window.game.worldManager) {
        await window.game.worldManager.loadNewDebugRoom(prompt, type); // Use the instance directly
    } else {
        console.error("WorldManager not found on window.game");
    }
};

// Initial Setup
// camera starting position set in PlayerController resetPosition/constructor
scene.add(new THREE.AmbientLight(0x808080)); // Slightly increased ambient light
const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0); // Slightly brighter directional
directionalLight.position.set(8, 15, 10);
directionalLight.castShadow = true; // Enable shadows if needed later
scene.add(directionalLight);

// Configure shadow properties if enabled
// directionalLight.shadow.mapSize.width = 1024;
// directionalLight.shadow.mapSize.height = 1024;
// directionalLight.shadow.camera.near = 0.5;
// directionalLight.shadow.camera.far = 50;

// Game Loop
function animate() {
    requestAnimationFrame(animate);

    const delta = window.game.playerController.clock.getDelta(); // Get delta from player controller's clock

    playerController.update(delta); // Pass delta time to player controller
    // Update world manager (might include animations or other time-based logic later)
    worldManager.update(playerController.getPlayerPosition()); // Update world based on player position
    minimap.update(playerController.getPlayerPosition()); // Update minimap

    renderer.render(scene, camera);
}

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    // Consider minimap resize if needed
});

// Initial world generation
worldManager.generateInitialWorld().then(() => {
    animate(); // Start the game loop after the initial world is ready
}).catch(error => {
    console.error("Failed to generate initial world:", error);
    uiManager.showNotification("Error: Could not load initial world.", "error");
    // Handle error appropriately, maybe show a static error message or fallback scene
    // Still start animation loop maybe with a default error scene?
    scene.background = new THREE.Color(0xff0000); // Red background for error
    animate(); // Start loop even on failure? Or maybe not.
});

// Add debug axes (optional)
// const axesHelper = new THREE.AxesHelper( 5 );
// scene.add(axesHelper);