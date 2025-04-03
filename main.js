import * as THREE from 'three';
import { WorldManager } from './worldManager.js';
import { PlayerController } from './playerController.js';
import { UIManager } from './uiManager.js';

// Basic Scene Setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('game-canvas'), antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x87ceeb); // Sky blue for outdoor default

// Game Components
const worldManager = new WorldManager(scene);
const playerController = new PlayerController(camera, scene, worldManager); // Pass worldManager for collision/interaction
const uiManager = new UIManager();

// Make core components accessible for debugging (optional, but helps with the current structure)
window.game = {
    scene,
    camera,
    renderer,
    worldManager,
    playerController,
    uiManager
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
camera.position.set(0, 1.6, 5); // Player height and starting position
scene.add(new THREE.AmbientLight(0x404040)); // Soft white light
const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
directionalLight.position.set(5, 10, 7.5);
scene.add(directionalLight);

// Game Loop
function animate() {
    requestAnimationFrame(animate);

    playerController.update();
    worldManager.update(playerController.getPlayerPosition()); // Update world based on player position

    renderer.render(scene, camera);
}

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Initial world generation
worldManager.generateInitialWorld().then(() => {
    animate(); // Start the game loop after the initial world is ready
}).catch(error => {
    console.error("Failed to generate initial world:", error);
    // Handle error appropriately, maybe show an error message
});

// Add debug axes
const axesHelper = new THREE.AxesHelper( 5 );
scene.add( axesHelper );