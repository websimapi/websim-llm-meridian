import * as THREE from 'three';
import { RoomGenerator } from './roomGenerator.js';

export class WorldManager {
    constructor(scene) {
        this.scene = scene;
        this.currentRoom = null;
        this.roomGenerator = new RoomGenerator();
        this.loadingScreen = document.getElementById('loading-screen');
        this.worldObjects = new THREE.Group(); // Group to hold all world geometry/objects
        this.scene.add(this.worldObjects);
        this.activeTiles = new Map(); // Store currently active world tiles/chunks
        this.tileSize = 20; // Size of each world tile/chunk
    }

    async generateInitialWorld() {
        console.log("Generating initial world...");
        this.showLoading();
        // For now, generate a simple starting room/area
        const initialRoomData = await this.roomGenerator.generateRoomData('A bright, grassy clearing in a fantasy forest, under a blue sky.', 'outdoor');
        this.buildRoom(initialRoomData);
        this.hideLoading();
        console.log("Initial world generated.");
    }

    async loadNewArea(prompt, type = 'outdoor') { // type can be 'outdoor' or 'indoor'
         console.log(`Loading new area: ${prompt}, Type: ${type}`);
         this.showLoading();
         this.clearCurrentRoom(); // Remove old geometry

         try {
            const newRoomData = await this.roomGenerator.generateRoomData(prompt, type);
            this.buildRoom(newRoomData);
         } catch (error) {
            console.error("Error generating new area:", error);
             // Handle error, maybe load a default error room?
             // For now, just log it and hide loading
         } finally {
            this.hideLoading();
            console.log("New area loaded.");
         }
    }

    buildRoom(roomData) {
        // Simple plane for the floor for now
        const floorGeometry = new THREE.PlaneGeometry(this.tileSize, this.tileSize);
        const floorMaterial = new THREE.MeshStandardMaterial({ map: roomData.textures.floor });
        const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
        floorMesh.rotation.x = -Math.PI / 2; // Rotate to be horizontal
        floorMesh.position.y = 0;
        this.worldObjects.add(floorMesh);
        this.currentRoom = floorMesh; // Simple placeholder for now

        // Basic wall setup if indoor
        if (roomData.type === 'indoor') {
            // Simplified: Add four walls around the floor tile
            const wallHeight = 3;
            const wallGeometry = new THREE.BoxGeometry(this.tileSize, wallHeight, 0.1); // Thin walls
            const wallMaterial = new THREE.MeshStandardMaterial({ map: roomData.textures.wall });

            const wallPositions = [
                { x: 0, y: wallHeight / 2, z: -this.tileSize / 2, rotY: 0 },         // Back
                { x: 0, y: wallHeight / 2, z: this.tileSize / 2, rotY: Math.PI },   // Front
                { x: -this.tileSize / 2, y: wallHeight / 2, z: 0, rotY: Math.PI / 2 }, // Left
                { x: this.tileSize / 2, y: wallHeight / 2, z: 0, rotY: -Math.PI / 2 } // Right
            ];

            wallPositions.forEach(pos => {
                const wallMesh = new THREE.Mesh(wallGeometry, wallMaterial);
                wallMesh.position.set(pos.x, pos.y, pos.z);
                wallMesh.rotation.y = pos.rotY;
                this.worldObjects.add(wallMesh);
            });

            // Ceiling
            const ceilingGeometry = new THREE.PlaneGeometry(this.tileSize, this.tileSize);
            let ceilingMaterial;
             if (roomData.textures.ceiling) {
                 ceilingMaterial = new THREE.MeshStandardMaterial({ map: roomData.textures.ceiling });
             } else {
                 // Default solid color if no texture provided (or transparent if needed later)
                 ceilingMaterial = new THREE.MeshStandardMaterial({ color: 0x555555, side: THREE.DoubleSide });
             }
            const ceilingMesh = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
            ceilingMesh.rotation.x = Math.PI / 2;
            ceilingMesh.position.y = wallHeight;
            this.worldObjects.add(ceilingMesh);

             // Adjust lighting/sky for indoor
             this.scene.background = new THREE.Color(0x111111); // Dark background for indoor
             // Consider adding point lights or adjusting ambient light for indoor scenes
        } else {
             // Outdoor specific setup
             this.scene.background = new THREE.Color(0x87ceeb); // Blue sky
             // Potentially add fog, skybox etc.
        }

        // TODO: Implement more complex room structures based on roomData.structure
        // TODO: Add objects based on roomData.objects
    }

    clearCurrentRoom() {
         if (this.currentRoom) {
            // Dispose of geometry and materials to free memory
            this.worldObjects.traverse(child => {
                if (child instanceof THREE.Mesh) {
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) {
                        if (Array.isArray(child.material)) {
                            child.material.forEach(mat => {
                                if (mat.map) mat.map.dispose();
                                mat.dispose();
                            });
                        } else {
                            if (child.material.map) child.material.map.dispose();
                            child.material.dispose();
                        }
                    }
                }
            });
             this.worldObjects.clear(); // Remove all children from the group
             this.currentRoom = null;
        }
    }

    showLoading() {
        this.loadingScreen.style.display = 'flex';
    }

    hideLoading() {
        this.loadingScreen.style.display = 'none';
    }

    update(playerPosition) {
        // Placeholder for logic to trigger loading new areas when player moves
        // Example: Check if player is near the edge of the current tile/room
        const currentTileX = Math.floor(playerPosition.x / this.tileSize);
        const currentTileZ = Math.floor(playerPosition.z / this.tileSize);

        // Simple trigger for demo: If player moves significantly, load a new "room"
        // In a real game, this would be based on hitting zone boundaries or doors
        // For now, just a placeholder to test the loading mechanism via console
        // console.log(`Player at tile: ${currentTileX}, ${currentTileZ}`);
        // Example trigger: window.loadNewDebugRoom() in console
    }

     // Debug function to trigger loading
    async loadNewDebugRoom(prompt, type = 'outdoor') {
        await this.loadNewArea(prompt, type);
    }
}