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
        this.tileSize = 50; // Increased from 20 to 50 for larger rooms
        this.rooms = []; // Store all generated rooms data
        this.currentRoomIndex = -1; // Track the currently active room
        this.skybox = null; // Store current skybox
    }

    async generateInitialWorld() {
        console.log("Generating initial world...");
        this.showLoading();
        // For now, generate a simple starting room/area
        const initialRoomData = await this.roomGenerator.generateRoomData('A bright, grassy clearing in a fantasy forest, under a blue sky.', 'outdoor');
        this.buildRoom(initialRoomData);
        this.addRoomToCollection(initialRoomData);
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
            this.addRoomToCollection(newRoomData);
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
            const wallHeight = 4; // Increased from 3 to 4
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
             
             // Remove skybox if it exists for indoor environments
             if (this.skybox) {
                 this.scene.remove(this.skybox);
                 this.skybox = null;
             }
        } else {
             // Outdoor specific setup - generate or update skybox
             this.generateSkybox(roomData.prompt);
        }

        // TODO: Implement more complex room structures based on roomData.structure
        // TODO: Add objects based on roomData.objects
    }

    async generateSkybox(prompt) {
        // Remove existing skybox if present
        if (this.skybox) {
            this.scene.remove(this.skybox);
            this.skybox = null;
        }
        
        try {
            // Generate a panoramic skybox image based on the room's prompt
            const skyboxPrompt = `Panoramic 360-degree image of ${prompt}. Ultra high-definition landscape view with distant horizon, realistic sky, and immersive environment details. Seamless panorama for a skybox.`;
            
            console.log("Generating skybox with prompt:", skyboxPrompt);
            
            const result = await websim.imageGen({
                prompt: skyboxPrompt,
                aspect_ratio: "16:9",
                width: 2048,
                height: 1024,
            });
            
            if (result && result.url) {
                // Create skybox using the generated panoramic image
                const textureLoader = new THREE.TextureLoader();
                textureLoader.load(result.url, (texture) => {
                    texture.mapping = THREE.EquirectangularReflectionMapping;
                    
                    // Create a large sphere with inverted normals to act as skybox
                    const geometry = new THREE.SphereGeometry(500, 60, 40);
                    // Flip the geometry inside out
                    geometry.scale(-1, 1, 1);
                    
                    const material = new THREE.MeshBasicMaterial({
                        map: texture,
                        side: THREE.BackSide
                    });
                    
                    this.skybox = new THREE.Mesh(geometry, material);
                    this.scene.add(this.skybox);
                    
                    // Set the environment map for reflective materials
                    this.scene.environment = texture;
                    
                    console.log("Skybox created successfully");
                });
            } else {
                console.error("Failed to generate skybox image");
                this.scene.background = new THREE.Color(0x87ceeb); // Fallback to blue sky
            }
        } catch (error) {
            console.error("Error generating skybox:", error);
            this.scene.background = new THREE.Color(0x87ceeb); // Fallback to blue sky
        }
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

        // Update minimap if it exists
        if (window.game && window.game.minimap) {
            window.game.minimap.update(playerPosition);
        }
        
        // Simple trigger for demo: If player moves significantly, load a new "room"
        // In a real game, this would be based on hitting zone boundaries or doors
        // For now, just a placeholder to test the loading mechanism via console
        // console.log(`Player at tile: ${currentTileX}, ${currentTileZ}`);
        // Example trigger: window.loadNewDebugRoom() in console
    }

    addRoomToCollection(roomData) {
        // Create serializable room record with texture URLs
        const roomRecord = {
            id: Date.now(), // Unique identifier
            name: `Room ${this.rooms.length + 1}`,
            prompt: roomData.prompt,
            type: roomData.type,
            textureUrls: {
                floor: roomData.textures.floor?.image?.src || null,
                wall: roomData.textures.wall?.image?.src || null,
                ceiling: roomData.textures.ceiling?.image?.src || null
            },
            timestamp: new Date().toISOString(),
            structure: roomData.structure,
            objects: roomData.objects
        };
        
        this.rooms.push(roomRecord);
        this.currentRoomIndex = this.rooms.length - 1;
        
        // Update UI with new room
        if (window.game && window.game.uiManager) {
            window.game.uiManager.updateRoomGallery(this.rooms, this.currentRoomIndex);
        }
    }

    exportRoomsToJSON() {
        const dataStr = JSON.stringify(this.rooms, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
        
        const exportFileDefaultName = `llm-meridian-rooms-${new Date().toISOString().slice(0,10)}.json`;
        
        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        linkElement.click();
    }

    async importRoomsFromJSON(jsonData) {
        try {
            const importedRooms = JSON.parse(jsonData);
            if (!Array.isArray(importedRooms)) {
                throw new Error("Invalid rooms data: expected an array");
            }
            
            this.rooms = importedRooms;
            
            // Update UI with imported rooms
            if (window.game && window.game.uiManager) {
                window.game.uiManager.updateRoomGallery(this.rooms, -1);
            }
            
            return true;
        } catch (error) {
            console.error("Failed to import rooms data:", error);
            return false;
        }
    }

    async teleportToRoom(index) {
        if (index < 0 || index >= this.rooms.length) {
            console.error("Invalid room index:", index);
            return;
        }
        
        this.showLoading();
        this.clearCurrentRoom();
        
        try {
            const roomToLoad = this.rooms[index];
            
            // Create textures from stored URLs
            const textures = {
                floor: roomToLoad.textureUrls.floor ? await this.loadTextureFromUrl(roomToLoad.textureUrls.floor) : null,
                wall: roomToLoad.textureUrls.wall ? await this.loadTextureFromUrl(roomToLoad.textureUrls.wall) : null,
                ceiling: roomToLoad.textureUrls.ceiling ? await this.loadTextureFromUrl(roomToLoad.textureUrls.ceiling) : null
            };
            
            // Create room data with loaded textures
            const roomData = {
                ...roomToLoad,
                textures: textures
            };
            
            this.buildRoom(roomData);
            this.currentRoomIndex = index;
            
            // Update UI to reflect current room
            if (window.game && window.game.uiManager) {
                window.game.uiManager.updateRoomGallery(this.rooms, this.currentRoomIndex);
            }
            
        } catch (error) {
            console.error("Error teleporting to room:", error);
        } finally {
            this.hideLoading();
        }
    }
    
    loadTextureFromUrl(url) {
        return new Promise((resolve, reject) => {
            const textureLoader = new THREE.TextureLoader();
            textureLoader.load(
                url,
                (texture) => {
                    texture.wrapS = THREE.RepeatWrapping;
                    texture.wrapT = THREE.RepeatWrapping;
                    const textureScale = 2;
                    const repeatValue = this.tileSize / textureScale;
                    texture.repeat.set(repeatValue, repeatValue);
                    resolve(texture);
                },
                undefined,
                (error) => reject(error)
            );
        });
    }

     // Debug function to trigger loading
    async loadNewDebugRoom(prompt, type = 'outdoor') {
        await this.loadNewArea(prompt, type);
    }
}