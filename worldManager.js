import * as THREE from 'three';
import { RoomGenerator } from './roomGenerator.js';

export class WorldManager {
    constructor(scene) {
        this.scene = scene;
        this.currentRoomObjects = null; // Keep track of meshes specific to the current room
        this.roomGenerator = new RoomGenerator();
        this.loadingScreen = document.getElementById('loading-screen');
        this.worldObjects = new THREE.Group(); // Group to hold all world geometry/objects
        this.scene.add(this.worldObjects);
        this.activeTiles = new Map(); // Store currently active world tiles/chunks
        this.tileSize = 50;
        this.rooms = []; // Store all generated rooms data
        this.currentRoomIndex = -1; // Track the currently active room

        // Default background colors
        this.defaultOutdoorBg = new THREE.Color(0x87ceeb); // Sky blue
        this.defaultIndoorBg = new THREE.Color(0x111111); // Dark grey

        // Fog Effect for Skybox Seam
        this.fogMesh = null;
        this.fogTexture = null;
        this.fogAnimationSpeed = 0.01; // Speed the fog texture scrolls
        this.createFogEffect(); // Create fog mesh on initialization
    }

    createFogEffect() {
        // 1. Generate Procedural Fog Texture
        const canvas = document.createElement('canvas');
        const canvasSize = 512; // Texture resolution
        canvas.width = canvasSize / 4; // Wider, less detailed vertically is fine
        canvas.height = canvasSize;
        const ctx = canvas.getContext('2d');

        // Create a vertical gradient for base transparency
        const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0)');   // Transparent top
        gradient.addColorStop(0.2, 'rgba(255, 255, 255, 0.6)'); // Fades in
        gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.8)'); // Peak opacity
        gradient.addColorStop(0.8, 'rgba(255, 255, 255, 0.6)'); // Fades out
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');   // Transparent bottom

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Add some vertical "streaks" or noise for mist effect (simple example)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)'; // Slightly whiter streaks
        for (let i = 0; i < 30; i++) {
            const x = Math.random() * canvas.width;
            const y = Math.random() * canvas.height;
            const w = Math.random() * (canvas.width * 0.1) + 2; // Thin streaks
            const h = Math.random() * (canvas.height * 0.4) + 50; // Long streaks
            ctx.fillRect(x, y, w, h);
        }

        this.fogTexture = new THREE.CanvasTexture(canvas);
        this.fogTexture.wrapS = THREE.ClampToEdgeWrapping; // Don't repeat horizontally
        this.fogTexture.wrapT = THREE.RepeatWrapping; // Repeat vertically for animation

        // 2. Create Fog Geometry (Thin Cylinder Segment)
        const fogRadius = 800; // Place it far away, but inside far plane
        const fogHeight = 1600; // Make it very tall
        const fogAngle = Math.PI / 3; // Wider fog coverage (60 degrees)
        const fogGeometry = new THREE.CylinderGeometry(
            fogRadius, fogRadius, // radiusTop, radiusBottom
            fogHeight,            // height
            32,                   // radialSegments (smoothness)
            8,                    // heightSegments
            true,                 // openEnded
            Math.PI - fogAngle / 2, // thetaStart (centers around +/- PI seam)
            fogAngle              // thetaLength
        );

        // 3. Create Fog Material
        const fogMaterial = new THREE.MeshBasicMaterial({
            map: this.fogTexture,
            transparent: true,
            opacity: 0.8, // Adjust base opacity
            depthWrite: false, // Crucial for transparency blending
            side: THREE.BackSide // Render the inside face towards the camera
        });

        // 4. Create Fog Mesh
        this.fogMesh = new THREE.Mesh(fogGeometry, fogMaterial);
        this.fogMesh.position.y = 0; // Center it vertically around origin
        this.fogMesh.visible = false; // Initially hidden

        // Add directly to the scene, so it persists across room loads
        this.scene.add(this.fogMesh);
        console.log("Animated fog effect mesh created.");
    }

    async generateInitialWorld() {
        console.log("Generating initial world...");
        this.showLoading();
        try {
            const initialRoomData = await this.roomGenerator.generateRoomData('A bright, grassy clearing in a fantasy forest, under a blue sky.', 'outdoor');
            this.buildRoom(initialRoomData);
            this.addRoomToCollection(initialRoomData);
        } catch (error) {
            console.error("Failed to generate initial world:", error);
            this.scene.background = this.defaultOutdoorBg; // Set a fallback background
            this.fogMesh.visible = true; // Show fog even on error if it's supposed to be outdoor
        } finally {
            this.hideLoading();
            console.log("Initial world generated.");
        }
    }

    async loadNewArea(prompt, type = 'outdoor') {
        console.log(`Loading new area: ${prompt}, Type: ${type}`);
        this.showLoading();
        this.clearCurrentRoom();

        try {
            const newRoomData = await this.roomGenerator.generateRoomData(prompt, type);
            this.buildRoom(newRoomData);
            this.addRoomToCollection(newRoomData);
        } catch (error) {
            console.error("Error generating new area:", error);
            // Set a fallback background based on intended type
            this.scene.background = type === 'indoor' ? this.defaultIndoorBg : this.defaultOutdoorBg;
            // Update fog visibility based on intended type even on error
            this.fogMesh.visible = type === 'outdoor';
        } finally {
            this.hideLoading();
            console.log("New area loaded.");
        }
    }

    buildRoom(roomData) {
        this.currentRoomObjects = new THREE.Group(); // Group for objects of this specific room

        // Set background and manage fog visibility first
        if (roomData.type === 'outdoor') {
            if (roomData.textures.sky) {
                this.scene.background = roomData.textures.sky;
                this.fogMesh.visible = true; // Show fog with skybox
                console.log("Showing animated fog for outdoor scene.");
            } else {
                this.scene.background = this.defaultOutdoorBg; // Fallback blue sky
                this.fogMesh.visible = true; // Still show fog for default outdoor sky
                console.log("Showing animated fog for default outdoor background.");
            }
        } else { // Indoor
            this.scene.background = this.defaultIndoorBg; // Dark background
            this.fogMesh.visible = false; // Hide fog indoors
            console.log("Hiding animated fog for indoor scene.");
        }

        // Floor
        if (roomData.textures.floor) {
            const floorGeometry = new THREE.PlaneGeometry(this.tileSize, this.tileSize);
            const floorMaterial = new THREE.MeshStandardMaterial({ map: roomData.textures.floor });
            const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
            floorMesh.rotation.x = -Math.PI / 2;
            floorMesh.position.y = 0;
            this.currentRoomObjects.add(floorMesh);
        } else {
            console.warn("No floor texture available for room.");
        }

        // Walls & Ceiling (Indoor only)
        if (roomData.type === 'indoor') {
            const wallHeight = 4; // Use height from roomData.structure if available later

            // Walls
            if (roomData.textures.wall) {
                const wallGeometry = new THREE.BoxGeometry(this.tileSize, wallHeight, 0.1); // Thin walls
                const wallMaterial = new THREE.MeshStandardMaterial({ map: roomData.textures.wall });
                const wallPositions = [
                    { x: 0, y: wallHeight / 2, z: -this.tileSize / 2, rotY: 0 },         // Back
                    { x: 0, y: wallHeight / 2, z: this.tileSize / 2, rotY: Math.PI },   // Front
                    { x: -this.tileSize / 2, y: wallHeight / 2, z: 0, rotY: Math.PI / 2 }, // Left
                    { x: this.tileSize / 2, y: wallHeight / 2, z: 0, rotY: -Math.PI / 2 } // Right
                ];
                wallPositions.forEach(pos => {
                    const wallMesh = new THREE.Mesh(wallGeometry.clone(), wallMaterial); // Clone geometry
                    wallMesh.position.set(pos.x, pos.y, pos.z);
                    wallMesh.rotation.y = pos.rotY;
                    this.currentRoomObjects.add(wallMesh);
                });
            } else {
                console.warn("No wall texture available for indoor room.");
            }

            // Ceiling
            const ceilingGeometry = new THREE.PlaneGeometry(this.tileSize, this.tileSize);
            let ceilingMaterial;
            if (roomData.textures.ceiling) {
                ceilingMaterial = new THREE.MeshStandardMaterial({ map: roomData.textures.ceiling, side: THREE.DoubleSide });
            } else {
                // Default solid color if no texture provided
                ceilingMaterial = new THREE.MeshStandardMaterial({ color: 0x555555, side: THREE.DoubleSide });
            }
            const ceilingMesh = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
            ceilingMesh.rotation.x = Math.PI / 2;
            ceilingMesh.position.y = wallHeight;
            this.currentRoomObjects.add(ceilingMesh);

            // Adjust lighting/sky for indoor is handled by scene.background change
        }

        // Add the group of room objects to the main world group
        this.worldObjects.add(this.currentRoomObjects);
    }

    clearCurrentRoom() {
        if (this.currentRoomObjects) {
            // Dispose of geometry and materials to free memory
            this.currentRoomObjects.traverse(child => {
                if (child instanceof THREE.Mesh) {
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) {
                        // Check if material is an array (though unlikely with current setup)
                        if (Array.isArray(child.material)) {
                            child.material.forEach(mat => {
                                if (mat.map) mat.map.dispose();
                                mat.dispose();
                            });
                        } else {
                            // Dispose texture map if it exists
                            if (child.material.map) child.material.map.dispose();
                            child.material.dispose(); // Dispose the material itself
                        }
                    }
                }
            });
            // Remove the group from the world and clear its children
            this.worldObjects.remove(this.currentRoomObjects);
            this.currentRoomObjects.clear(); // Ensure all children are removed from the group
            this.currentRoomObjects = null;
        }
        // Also clear the background texture
        if (this.scene.background instanceof THREE.Texture) {
            this.scene.background.dispose();
        }
        this.scene.background = null; // Reset background

        // Hide fog, but don't remove it
        if (this.fogMesh) {
            this.fogMesh.visible = false;
            console.log("Hiding animated fog during room clear.");
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
    }

    updateFog(delta) {
        if (this.fogMesh && this.fogMesh.visible && this.fogTexture) {
            // Animate the texture offset vertically
            this.fogTexture.offset.y -= this.fogAnimationSpeed * delta;
            // Keep offset within [0, 1] range (optional, RepeatWrapping handles it)
            // this.fogTexture.offset.y %= 1;
        }
    }

    addRoomToCollection(roomData) {
        // Dispose of textures after adding their URLs to the record
        // This prevents holding onto large textures in memory for non-active rooms
        const textureUrls = {
            floor: roomData.textures.floor?.image?.src || null,
            wall: roomData.textures.wall?.image?.src || null,
            ceiling: roomData.textures.ceiling?.image?.src || null,
            sky: roomData.textures.sky?.image?.src || null // Store skybox URL
        };

        if (roomData.textures.floor) roomData.textures.floor.dispose();
        if (roomData.textures.wall) roomData.textures.wall.dispose();
        if (roomData.textures.ceiling) roomData.textures.ceiling.dispose();
        if (roomData.textures.sky) roomData.textures.sky.dispose();

        // Create serializable room record with texture URLs
        const roomRecord = {
            id: Date.now() + Math.random(), // Unique identifier
            name: `Room ${this.rooms.length + 1}`, // Simple naming
            prompt: roomData.prompt,
            type: roomData.type,
            textureUrls: textureUrls, // Use the stored URLs
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

            // Basic validation of imported structure (optional but recommended)
            importedRooms.forEach((room, index) => {
                if (!room.id || !room.prompt || !room.type || !room.textureUrls) {
                    console.warn(`Room at index ${index} is missing required properties.`);
                    // Potentially skip this room or throw error
                }
            });

            this.rooms = importedRooms;
            this.currentRoomIndex = -1; // Reset current room index as we don't know which one is active

            // Update UI with imported rooms
            if (window.game && window.game.uiManager) {
                window.game.uiManager.updateRoomGallery(this.rooms, this.currentRoomIndex);
            }

            return true;
        } catch (error) {
            console.error("Failed to import rooms data:", error);
            if (window.game && window.game.uiManager) {
                window.game.uiManager.showNotification('Import failed: Invalid JSON format.', 'error');
            }
            return false;
        }
    }

    async teleportToRoom(index) {
        if (index < 0 || index >= this.rooms.length) {
            console.error("Invalid room index:", index);
            if (window.game && window.game.uiManager) {
                window.game.uiManager.showNotification(`Teleport failed: Room index ${index} out of bounds.`, 'error');
            }
            return;
        }

        this.showLoading();
        this.clearCurrentRoom(); // Clear existing geometry and background

        try {
            const roomToLoad = this.rooms[index];
            console.log(`Teleporting to room ${index}: ${roomToLoad.name} (${roomToLoad.type})`);

            // Load textures from stored URLs
            const textures = {
                floor: roomToLoad.textureUrls.floor ? await this.loadTextureFromUrl(roomToLoad.textureUrls.floor, false) : null,
                wall: roomToLoad.textureUrls.wall ? await this.loadTextureFromUrl(roomToLoad.textureUrls.wall, false) : null,
                ceiling: roomToLoad.textureUrls.ceiling ? await this.loadTextureFromUrl(roomToLoad.textureUrls.ceiling, false) : null,
                sky: roomToLoad.textureUrls.sky ? await this.loadTextureFromUrl(roomToLoad.textureUrls.sky, true) : null // Load skybox if URL exists
            };

            // Create room data structure expected by buildRoom
            const roomData = {
                ...roomToLoad, // Includes prompt, type, structure, objects
                textures: textures // Pass the loaded THREE.Texture objects
            };

            this.buildRoom(roomData); // Build the room with loaded textures
            this.currentRoomIndex = index;

            // Reset player position (optional, maybe teleport to a specific entry point?)
            if (window.game && window.game.playerController) {
                window.game.playerController.resetPosition(); // Add this method to PlayerController
            }

            // Update UI to reflect current room
            if (window.game && window.game.uiManager) {
                window.game.uiManager.updateRoomGallery(this.rooms, this.currentRoomIndex);
                window.game.uiManager.showNotification(`Teleported to ${roomToLoad.name}.`);
            }

        } catch (error) {
            console.error("Error teleporting to room:", error);
            // Handle teleportation error - maybe load a default or show message
            // Determine intended type for fallback background/fog
            const intendedType = this.rooms[index]?.type || 'outdoor'; // Default to outdoor if unknown
            this.scene.background = intendedType === 'indoor' ? this.defaultIndoorBg : this.defaultOutdoorBg;
            this.fogMesh.visible = intendedType === 'outdoor'; // Set fog based on intended type
            if (window.game && window.game.uiManager) {
                window.game.uiManager.showNotification('Teleport failed: Error loading room data.', 'error');
            }
        } finally {
            this.hideLoading();
        }
    }

    loadTextureFromUrl(url, isSkybox = false) {
        return new Promise((resolve, reject) => {
            const textureLoader = new THREE.TextureLoader();
            textureLoader.load(
                url,
                (texture) => {
                    if (isSkybox) {
                        texture.mapping = THREE.EquirectangularReflectionMapping;
                        // No wrapping or repeat for skybox
                    } else {
                        texture.wrapS = THREE.RepeatWrapping;
                        texture.wrapT = THREE.RepeatWrapping;
                        // Apply repeat based on tile size and assumed texture scale
                        const textureScale = 2;
                        const repeatValue = this.tileSize / textureScale;
                        texture.repeat.set(repeatValue, repeatValue);
                    }
                    resolve(texture);
                },
                undefined, // onProgress
                (error) => {
                    console.error(`Failed to load texture from URL: ${url}`, error);
                    reject(error); // Reject the promise on load failure
                }
            );
        });
    }

    async loadNewDebugRoom(prompt, type = 'outdoor') {
        await this.loadNewArea(prompt, type);
    }
}