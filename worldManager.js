import * as THREE from 'three';
import { RoomGenerator } from './roomGenerator.js';

// Define a constant for the skybox radius, ensure it's less than camera.far
const SKYBOX_RADIUS = 1000;

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
        this.skyboxMesh = null; // To hold the custom skybox mesh

        // Default background colors
        this.defaultOutdoorBg = new THREE.Color(0x87ceeb); // Sky blue
        this.defaultIndoorBg = new THREE.Color(0x111111); // Dark grey
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
            this.scene.background = this.defaultOutdoorBg; // Set a fallback background color
            // Potentially show an error to the user
        } finally {
            this.hideLoading();
            console.log("Initial world generated.");
        }
    }

    async loadNewArea(prompt, type = 'outdoor') {
        console.log(`Loading new area: ${prompt}, Type: ${type}`);
        this.showLoading();
        this.clearCurrentRoom(); // Clears geometry AND skybox/background

        try {
            const newRoomData = await this.roomGenerator.generateRoomData(prompt, type);
            this.buildRoom(newRoomData);
            this.addRoomToCollection(newRoomData);
        } catch (error) {
            console.error("Error generating new area:", error);
            // Set a fallback background based on intended type
            this.scene.background = type === 'indoor' ? this.defaultIndoorBg : this.defaultOutdoorBg;
            // Handle error, maybe load a default error room?
        } finally {
            this.hideLoading();
            console.log("New area loaded.");
        }
    }

    buildRoom(roomData) {
        this.currentRoomObjects = new THREE.Group(); // Group for objects of this specific room

        // Clear previous skybox/background first
        this.clearSkybox();

        // Set background or skybox
        if (roomData.type === 'outdoor') {
            if (roomData.textures.sky) {
                this.createCustomSkybox(roomData.textures.sky);
            } else {
                // Fallback to solid color background if no sky texture
                this.scene.background = this.defaultOutdoorBg;
                console.warn("Outdoor room generated, but no sky texture available. Using default background color.");
            }
        } else { // Indoor
            this.scene.background = this.defaultIndoorBg; // Dark background for indoors
        }

        // Floor
        if (roomData.textures.floor) {
            const floorGeometry = new THREE.PlaneGeometry(this.tileSize, this.tileSize);
            // Make floor material slightly rougher
            const floorMaterial = new THREE.MeshStandardMaterial({
                map: roomData.textures.floor,
                roughness: 0.8,
                metalness: 0.1
            });
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
                // Adjust wall UVs to prevent excessive stretching if texture is repeated
                const wallTexture = roomData.textures.wall.clone(); // Clone to modify repeat independently
                wallTexture.needsUpdate = true; // Important after cloning
                const textureScale = 2; // Assumed real-world size represented by the texture
                wallTexture.wrapS = THREE.RepeatWrapping;
                wallTexture.wrapT = THREE.RepeatWrapping;
                // Repeat horizontally based on tileSize, vertically based on wallHeight
                wallTexture.repeat.set(this.tileSize / textureScale, wallHeight / textureScale);

                const wallGeometry = new THREE.PlaneGeometry(this.tileSize, wallHeight); // Use Plane for better UV control
                const wallMaterial = new THREE.MeshStandardMaterial({
                    map: wallTexture,
                    roughness: 0.9,
                    metalness: 0.05
                });

                const wallPositions = [
                    { x: 0, y: wallHeight / 2, z: -this.tileSize / 2, rotY: 0 },         // Back
                    { x: 0, y: wallHeight / 2, z: this.tileSize / 2, rotY: Math.PI },   // Front (Rotate plane)
                    { x: -this.tileSize / 2, y: wallHeight / 2, z: 0, rotY: -Math.PI / 2 }, // Left (Rotate plane)
                    { x: this.tileSize / 2, y: wallHeight / 2, z: 0, rotY: Math.PI / 2 }  // Right (Rotate plane)
                ];
                wallPositions.forEach(pos => {
                    const wallMesh = new THREE.Mesh(wallGeometry, wallMaterial); // Don't clone geometry if using Plane
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
                // Make ceiling material slightly rougher
                ceilingMaterial = new THREE.MeshStandardMaterial({
                    map: roomData.textures.ceiling,
                    side: THREE.DoubleSide, // Keep double-sided for ceiling plane
                    roughness: 0.9,
                    metalness: 0.1
                });
            } else {
                // Default solid color if no texture provided
                ceilingMaterial = new THREE.MeshStandardMaterial({
                    color: 0x555555,
                    side: THREE.DoubleSide,
                    roughness: 1.0, // Rough flat color
                    metalness: 0.0
                });
            }
            const ceilingMesh = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
            ceilingMesh.rotation.x = Math.PI / 2;
            ceilingMesh.position.y = wallHeight;
            this.currentRoomObjects.add(ceilingMesh);
        }

        // Add the group of room objects to the main world group
        this.worldObjects.add(this.currentRoomObjects);

        // TODO: Implement more complex room structures based on roomData.structure
        // TODO: Add objects based on roomData.objects
    }

    createCustomSkybox(skyTexture) {
        // Ensure texture mapping is correct (should be set by RoomGenerator)
        if (skyTexture.mapping !== THREE.EquirectangularReflectionMapping) {
            console.warn("Sky texture received is not EquirectangularReflectionMapping. Skybox may look incorrect.");
            skyTexture.mapping = THREE.EquirectangularReflectionMapping; // Force it just in case
            skyTexture.needsUpdate = true;
        }

        const skyMaterial = new THREE.MeshBasicMaterial({
            map: skyTexture,
            side: THREE.BackSide, // Render on the inside
            fog: false // Skybox should ignore scene fog
        });

        // Inject shader code to fade the seam
        skyMaterial.onBeforeCompile = (shader) => {
            shader.uniforms.fadeWidth = { value: 0.015 }; // Width of the fade area (0.0 to 1.0 UV space) - adjust as needed

            // Add uniform declaration if not present (safety check)
            if (!shader.fragmentShader.includes('uniform float fadeWidth;')) {
                shader.fragmentShader = 'uniform float fadeWidth;\n' + shader.fragmentShader;
            }

            // Inject seam fade logic using smoothstep for a gentle transition
            // We modify the final color *before* it's output
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <output_fragment>',
                `
                // Calculate fade factor: 1.0 in center, 0.0 at seam edges (u=0 and u=1)
                float seamFadeFactor = smoothstep(0.0, fadeWidth, vUv.x) * smoothstep(1.0, 1.0 - fadeWidth, vUv.x);
                seamFadeFactor = clamp(seamFadeFactor, 0.0, 1.0); // Ensure it stays within 0-1 range

                // Define a color to fade towards near the seam
                // A slightly darker/desaturated version of the original color can work well,
                // or a fixed atmospheric haze color. Let's try a simple haze color.
                vec4 fadeTargetColor = vec4(0.6, 0.7, 0.8, 1.0); // Haze blue/grey - adjust to match typical sky color

                // Blend the original fragment color with the fade target color based on the fade factor
                #include <output_fragment> // Get the original output color first
                gl_FragColor = mix(fadeTargetColor, gl_FragColor, seamFadeFactor);
                `
            );

            // Add varying vUv if it's somehow not standard (unlikely for MeshBasicMaterial)
            if (!shader.vertexShader.includes('varying vec2 vUv;')) {
                shader.vertexShader = shader.vertexShader.replace(
                    'void main() {',
                    'varying vec2 vUv;\nvoid main() {'
                );
                shader.vertexShader = shader.vertexShader.replace(
                    '#include <project_vertex>',
                    '#include <project_vertex>\nvUv = uv;'
                );
            }
        };

        // Use a large sphere geometry
        const skySphereGeometry = new THREE.SphereGeometry(SKYBOX_RADIUS, 64, 32);
        this.skyboxMesh = new THREE.Mesh(skySphereGeometry, skyMaterial);
        // Ensure skybox renders behind everything else
        this.skyboxMesh.renderOrder = -1;

        this.scene.add(this.skyboxMesh);
    }

    clearSkybox() {
        // Remove and dispose the custom skybox mesh if it exists
        if (this.skyboxMesh) {
            if (this.skyboxMesh.geometry) {
                this.skyboxMesh.geometry.dispose();
            }
            if (this.skyboxMesh.material) {
                // Dispose texture map if it exists
                if (this.skyboxMesh.material.map) {
                    this.skyboxMesh.material.map.dispose();
                }
                this.skyboxMesh.material.dispose();
            }
            this.scene.remove(this.skyboxMesh);
            this.skyboxMesh = null;
        }
        // Reset scene background property if it was set
        if (this.scene.background !== null && !(this.scene.background instanceof THREE.Texture)) {
            this.scene.background = null;
        }
        // Note: We intentionally don't dispose `scene.background` if it IS a texture,
        // because the custom skybox logic replaces it. If we switch back to using
        // scene.background directly, disposal logic would need adjustment there.
    }

    clearCurrentRoom() {
        if (this.currentRoomObjects) {
            // Dispose of geometry and materials to free memory
            this.currentRoomObjects.traverse(child => {
                if (child instanceof THREE.Mesh) {
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) {
                        // Handle potential arrays of materials
                        if (Array.isArray(child.material)) {
                            child.material.forEach(mat => {
                                if (mat.map) mat.map.dispose();
                                if (mat.aoMap) mat.aoMap.dispose();
                                if (mat.metalnessMap) mat.metalnessMap.dispose();
                                if (mat.normalMap) mat.normalMap.dispose();
                                if (mat.roughnessMap) mat.roughnessMap.dispose();
                                // Add other map types as needed
                                mat.dispose();
                            });
                        } else {
                            // Dispose texture maps if they exist
                            if (child.material.map) child.material.map.dispose();
                            if (child.material.aoMap) child.material.aoMap.dispose();
                            if (child.material.metalnessMap) child.material.metalnessMap.dispose();
                            if (child.material.normalMap) child.material.normalMap.dispose();
                            if (child.material.roughnessMap) child.material.roughnessMap.dispose();
                            // Add other map types as needed
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

        // Also clear the custom skybox or background color
        this.clearSkybox();
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

    addRoomToCollection(roomData) {
        // Dispose of textures *after* extracting URLs/info needed for the record
        // We keep the THREE.Texture object only for the *active* room.
        const textureUrls = {
            floor: roomData.textures.floor?.image?.src || null,
            wall: roomData.textures.wall?.image?.src || null,
            ceiling: roomData.textures.ceiling?.image?.src || null,
            sky: roomData.textures.sky?.image?.src || null
        };

        // Dispose textures that are part of the roomData structure,
        // but *not* the currently active skybox texture if it exists (handled by clearSkybox/buildRoom)
        if (roomData.textures.floor) roomData.textures.floor.dispose();
        if (roomData.textures.wall) roomData.textures.wall.dispose();
        if (roomData.textures.ceiling) roomData.textures.ceiling.dispose();
        // Sky texture from roomData is disposed here; the one attached to skyboxMesh persists until clearSkybox
        if (roomData.textures.sky && this.skyboxMesh?.material.map !== roomData.textures.sky) {
            roomData.textures.sky.dispose();
        }

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
        const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);

        const exportFileDefaultName = `llm-meridian-rooms-${new Date().toISOString().slice(0, 10)}.json`;

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
        this.clearCurrentRoom(); // Clear existing geometry, background, AND skybox

        try {
            const roomToLoad = this.rooms[index];
            console.log(`Teleporting to room ${index}: ${roomToLoad.name} (${roomToLoad.type})`);

            // Load textures from stored URLs
            // Create texture promises
            const texturePromises = {
                floor: roomToLoad.textureUrls.floor ? this.loadTextureFromUrl(roomToLoad.textureUrls.floor, false) : Promise.resolve(null),
                wall: roomToLoad.textureUrls.wall ? this.loadTextureFromUrl(roomToLoad.textureUrls.wall, false) : Promise.resolve(null),
                ceiling: roomToLoad.textureUrls.ceiling ? this.loadTextureFromUrl(roomToLoad.textureUrls.ceiling, false) : Promise.resolve(null),
                sky: roomToLoad.textureUrls.sky ? this.loadTextureFromUrl(roomToLoad.textureUrls.sky, true) : Promise.resolve(null) // Load skybox if URL exists
            };

            // Await all textures concurrently
            const textures = {
                floor: await texturePromises.floor,
                wall: await texturePromises.wall,
                ceiling: await texturePromises.ceiling,
                sky: await texturePromises.sky
            };

            // Handle potential loading errors (loadTextureFromUrl should reject on error)
            // We could add placeholder logic here if needed, but loadTextureFromUrl rejects now.

            // Create room data structure expected by buildRoom
            const roomData = {
                ...roomToLoad, // Includes prompt, type, structure, objects
                textures: textures // Pass the loaded THREE.Texture objects
            };

            this.buildRoom(roomData); // Build the room with loaded textures & create skybox if applicable
            this.currentRoomIndex = index;

            // Reset player position
            if (window.game && window.game.playerController) {
                window.game.playerController.resetPosition();
            }

            // Update UI to reflect current room
            if (window.game && window.game.uiManager) {
                window.game.uiManager.updateRoomGallery(this.rooms, this.currentRoomIndex);
                window.game.uiManager.showNotification(`Teleported to ${roomToLoad.name}.`);
            }

        } catch (error) {
            console.error("Error teleporting to room:", error);
            // Handle teleportation error - maybe load a default or show message
            this.clearCurrentRoom(); // Ensure scene is clean after error
            this.scene.background = this.defaultOutdoorBg; // Fallback background on error
            if (window.game && window.game.uiManager) {
                window.game.uiManager.showNotification('Teleport failed: Error loading room data.', 'error');
            }
        } finally {
            this.hideLoading();
        }
    }

    loadTextureFromUrl(url, isSkybox = false) {
        return new Promise((resolve, reject) => {
            if (!url) {
                console.warn(`Attempted to load texture from null or empty URL (isSkybox: ${isSkybox}).`);
                resolve(null); // Resolve with null if URL is invalid
                return;
            }
            const textureLoader = new THREE.TextureLoader();
            textureLoader.load(
                url,
                (texture) => {
                    if (isSkybox) {
                        texture.mapping = THREE.EquirectangularReflectionMapping;
                        texture.needsUpdate = true;
                        // No wrapping or repeat for skybox
                    } else {
                        texture.wrapS = THREE.RepeatWrapping;
                        texture.wrapT = THREE.RepeatWrapping;
                        // Apply repeat based on tile size and assumed texture scale
                        const textureScale = 2;
                        const repeatValue = this.tileSize / textureScale;
                        texture.repeat.set(repeatValue, repeatValue);
                        texture.needsUpdate = true;
                    }
                    resolve(texture);
                },
                undefined, // onProgress
                (error) => {
                    console.error(`Failed to load texture from URL: ${url}`, error);
                    // Rejecting will allow the teleport function's catch block to handle it
                    reject(new Error(`Failed to load texture: ${url}`));
                }
            );
        });
    }

    async loadNewDebugRoom(prompt, type = 'outdoor') {
        await this.loadNewArea(prompt, type);
    }
}