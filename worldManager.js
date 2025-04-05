import * as THREE from 'three';
import { RoomGenerator } from './roomGenerator.js';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'; // Import CSS2DObject if using labels

export class WorldManager {
    constructor(scene, room) {
        this.scene = scene;
        this.room = room;
        this.currentRoomObjects = null;
        this.roomGenerator = new RoomGenerator();
        this.loadingScreen = document.getElementById('loading-screen');
        this.worldObjects = new THREE.Group();
        this.scene.add(this.worldObjects);
        this.activeTiles = new Map();
        this.tileSize = 50;

        this.defaultOutdoorBg = new THREE.Color(0x87ceeb);
        this.defaultIndoorBg = new THREE.Color(0x111111);

        this.isLoading = false;
    }

    async generateInitialWorld() {
        console.log("Generating initial world (checking shared state)...");
        this.showLoading();
        this.isLoading = true;
        try {
            const rooms = this.room.roomState.rooms || {};
            const roomIds = Object.keys(rooms);

            let targetRoomId = null;
            let playerStartPosition = new THREE.Vector3(0, 1.6, 5);

            if (roomIds.length > 0) {
                // Find the most recently created room if available
                const sortedRooms = Object.values(rooms).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                targetRoomId = sortedRooms[0].id;
                console.log(`Found existing rooms. Joining most recent room: ${targetRoomId}`);
            } else {
                console.log("No existing rooms found. Generating initial room...");
                const initialRoomData = await this.roomGenerator.generateRoomData('A bright, grassy clearing in a fantasy forest, under a blue sky.', 'outdoor');
                targetRoomId = await this.addRoomToSharedState(initialRoomData);
                if (!targetRoomId) {
                    throw new Error("Failed to add initial room to shared state.");
                }
                console.log(`Generated initial room with ID: ${targetRoomId}`);
            }

            await this.teleportToRoom(targetRoomId, playerStartPosition);

        } catch (error) {
            console.error("Failed to initialize world:", error);
            this.scene.background = this.defaultOutdoorBg;
            if (window.game && window.game.uiManager) {
                window.game.uiManager.showNotification('Error initializing world.', 'error');
            }
        } finally {
            this.hideLoading();
            this.isLoading = false;
            console.log("World initialization complete.");
        }
    }

    async createAndJoinNewRoom(prompt, type = 'outdoor') {
        if (this.isLoading) {
            console.warn("Already loading/creating a room.");
            if (window.game && window.game.uiManager) window.game.uiManager.showNotification('Operation already in progress.', 'info');
            return;
        }
        console.log(`Creating new room: ${prompt}, Type: ${type}`);
        this.showLoading(`Generating ${type} room...`);
        this.isLoading = true;

        try {
            const newRoomData = await this.roomGenerator.generateRoomData(prompt, type);
            const newRoomId = await this.addRoomToSharedState(newRoomData);
            if (!newRoomId) {
                throw new Error("Failed to add new room to shared state.");
            }
            await this.teleportToRoom(newRoomId);

        } catch (error) {
            console.error("Error creating new room:", error);
            if (window.game && window.game.uiManager) window.game.uiManager.showNotification('Failed to create new room.', 'error');
        } finally {
            this.hideLoading();
            this.isLoading = false;
            console.log("New room creation process finished.");
        }
    }

    async addRoomToSharedState(roomData) {
        try {
            const textureUploadPromises = Object.entries(roomData.textures)
                .filter(([key, texture]) => texture && texture.image)
                .map(async ([key, texture]) => {
                    try {
                        let file;
                        if (texture.image instanceof HTMLCanvasElement) {
                            const blob = await new Promise(resolve => texture.image.toBlob(resolve, 'image/png'));
                            file = new File([blob], `${key}_${Date.now()}.png`, { type: 'image/png' });
                        } else if (texture.image instanceof HTMLImageElement && texture.image.src.startsWith('data:')) {
                            const blob = await fetch(texture.image.src).then(res => res.blob());
                            file = new File([blob], `${key}_${Date.now()}.png`, { type: blob.type || 'image/png' });
                        } else if (texture.image instanceof HTMLImageElement && texture.image.src.startsWith('blob:')) {
                            const blob = await fetch(texture.image.src).then(res => res.blob());
                            file = new File([blob], `${key}_${Date.now()}.png`, { type: blob.type || 'image/png' });
                        } else if (texture.image instanceof ImageBitmap) {
                            const canvas = document.createElement('canvas');
                            canvas.width = texture.image.width;
                            canvas.height = texture.image.height;
                            const ctx = canvas.getContext('2d');
                            ctx.drawImage(texture.image, 0, 0);
                            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
                            file = new File([blob], `${key}_${Date.now()}.png`, { type: 'image/png' });
                        }
                        else if (texture.image instanceof HTMLImageElement) { // Handle regular image URLs
                            console.warn(`Texture image source for key '${key}' might not be directly uploadable or is assumed pre-uploaded:`, texture.image.src);
                            try {
                                const response = await fetch(texture.image.src, { mode: 'cors' }); // Ensure CORS mode if needed
                                if (!response.ok) throw new Error(`Fetch failed: ${response.statusText}`);
                                const blob = await response.blob();
                                file = new File([blob], `${key}_${Date.now()}.png`, { type: blob.type || 'image/png' });
                            } catch (fetchError) {
                                console.error(`Could not fetch texture source for upload (${key}): ${fetchError}. Storing original source URL.`);
                                return { key, url: texture.image.src };
                            }
                        } else {
                            console.warn(`Unsupported image type for texture key '${key}':`, texture.image);
                             return { key, url: texture.image?.src || null }; // Attempt to get src if possible
                        }


                        if (!file) {
                            console.warn(`Could not create file for texture key '${key}'. Using original source if available.`);
                            return { key, url: texture.image?.src || null };
                        }

                        const url = await websim.upload(file);
                        return { key, url };
                    } catch (uploadError) {
                        console.error(`Error uploading texture for key ${key}:`, uploadError);
                        return { key, url: null };
                    } finally {
                        if (texture) texture.dispose();
                    }
                });

            const uploadedTextures = await Promise.all(textureUploadPromises);
            const textureUrls = uploadedTextures.reduce((acc, { key, url }) => {
                if (url) acc[key] = url;
                return acc;
            }, { floor: null, wall: null, ceiling: null, sky: null });

            const roomId = `room_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
            const roomRecord = {
                id: roomId,
                name: roomData.prompt.substring(0,30) + (roomData.prompt.length > 30 ? '...' : ''), // Auto-name from prompt start
                prompt: roomData.prompt,
                type: roomData.type,
                textureUrls: textureUrls,
                timestamp: new Date().toISOString(),
                structure: roomData.structure,
                objects: roomData.objects || [], // Ensure objects array exists
                creatorId: this.room.clientId,
                creatorUsername: this.room.peers[this.room.clientId]?.username || 'Unknown',
            };

             // Fetch existing rooms to correctly update (avoid overwriting)
            const existingRooms = this.room.roomState.rooms || {};

            this.room.updateRoomState({
                rooms: {
                    ...existingRooms, // Preserve other rooms
                    [roomId]: roomRecord // Add the new room
                }
            });

            console.log(`Room added to shared state with ID: ${roomId}`);
            return roomId;

        } catch(error) {
            console.error("Failed to add room to shared state:", error);
            return null;
        }
    }

    buildRoom(roomData) {
        if (!roomData || !roomData.textureUrls) {
            console.error("buildRoom called with invalid roomData:", roomData);
            this.scene.background = this.defaultIndoorBg;
            return;
        }

        this.clearCurrentRoom(); // Clear previous room before building new one
        this.currentRoomObjects = new THREE.Group();
        this.currentRoomObjects.name = `RoomObjects_${roomData.id || 'unknown'}`;

        if (roomData.type === 'outdoor') {
            if (roomData.textureUrls.sky) {
                this.loadTextureFromUrl(roomData.textureUrls.sky, true).then(skyTexture => {
                    if (skyTexture) this.scene.background = skyTexture;
                    else this.scene.background = this.defaultOutdoorBg;
                }).catch(() => this.scene.background = this.defaultOutdoorBg);
            } else {
                this.scene.background = this.defaultOutdoorBg;
            }
        } else {
            this.scene.background = this.defaultIndoorBg;
        }

        const textureLoadPromises = [];
        const roomSize = roomData.structure?.dimensions?.width || this.tileSize; // Use room-specific size

        if (roomData.textureUrls.floor) {
            textureLoadPromises.push(
                this.loadTextureFromUrl(roomData.textureUrls.floor, false, roomSize).then(floorTexture => { // Pass roomSize
                    if (!floorTexture) return;
                    const floorGeometry = new THREE.PlaneGeometry(roomSize, roomSize);
                    const floorMaterial = new THREE.MeshStandardMaterial({ map: floorTexture });
                    const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
                    floorMesh.name = "FloorMesh";
                    floorMesh.rotation.x = -Math.PI / 2;
                    floorMesh.position.y = 0;
                    this.currentRoomObjects.add(floorMesh);
                }).catch(e => console.error("Error loading floor texture:", e))
            );
        } else {
            console.warn("No floor texture URL available for room.");
            // Optionally add a default placeholder floor
            const floorGeometry = new THREE.PlaneGeometry(roomSize, roomSize);
            const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x555555 });
            const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
            floorMesh.name = "PlaceholderFloorMesh";
            floorMesh.rotation.x = -Math.PI / 2;
            floorMesh.position.y = 0;
            this.currentRoomObjects.add(floorMesh);
        }

        if (roomData.type === 'indoor') {
            const wallHeight = roomData.structure?.dimensions?.height || 4;

            if (roomData.textureUrls.wall) {
                textureLoadPromises.push(
                    this.loadTextureFromUrl(roomData.textureUrls.wall, false, roomSize, wallHeight).then(wallTexture => { // Pass sizes
                        if (!wallTexture) return;
                        const wallMaterial = new THREE.MeshStandardMaterial({ map: wallTexture });
                        const wallPositions = [
                            // Note: Using PlaneGeometry for simpler walls
                            { geometry: new THREE.PlaneGeometry(roomSize, wallHeight), x: 0, y: wallHeight / 2, z: -roomSize / 2, rotY: 0 },
                            { geometry: new THREE.PlaneGeometry(roomSize, wallHeight), x: 0, y: wallHeight / 2, z: roomSize / 2, rotY: Math.PI },
                            { geometry: new THREE.PlaneGeometry(roomSize, wallHeight), x: -roomSize / 2, y: wallHeight / 2, z: 0, rotY: Math.PI / 2 },
                            { geometry: new THREE.PlaneGeometry(roomSize, wallHeight), x: roomSize / 2, y: wallHeight / 2, z: 0, rotY: -Math.PI / 2 }
                        ];
                        wallPositions.forEach((pos, i) => {
                            const wallMesh = new THREE.Mesh(pos.geometry, wallMaterial);
                            wallMesh.name = `WallMesh_${i}`;
                            wallMesh.position.set(pos.x, pos.y, pos.z);
                            wallMesh.rotation.y = pos.rotY;
                            this.currentRoomObjects.add(wallMesh);
                        });
                    }).catch(e => console.error("Error loading wall texture:", e))
                );
            } else {
                 console.warn("No wall texture URL available for indoor room. Adding placeholder walls.");
                 const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xAAAAAA });
                 const wallHeight = roomData.structure?.dimensions?.height || 4;
                 const wallPositions = [
                     { geometry: new THREE.PlaneGeometry(roomSize, wallHeight), x: 0, y: wallHeight / 2, z: -roomSize / 2, rotY: 0 },
                     { geometry: new THREE.PlaneGeometry(roomSize, wallHeight), x: 0, y: wallHeight / 2, z: roomSize / 2, rotY: Math.PI },
                     { geometry: new THREE.PlaneGeometry(roomSize, wallHeight), x: -roomSize / 2, y: wallHeight / 2, z: 0, rotY: Math.PI / 2 },
                     { geometry: new THREE.PlaneGeometry(roomSize, wallHeight), x: roomSize / 2, y: wallHeight / 2, z: 0, rotY: -Math.PI / 2 }
                 ];
                 wallPositions.forEach((pos, i) => {
                     const wallMesh = new THREE.Mesh(pos.geometry, wallMaterial);
                     wallMesh.name = `PlaceholderWallMesh_${i}`;
                     wallMesh.position.set(pos.x, pos.y, pos.z);
                     wallMesh.rotation.y = pos.rotY;
                     this.currentRoomObjects.add(wallMesh);
                 });
            }

            const ceilingGeometry = new THREE.PlaneGeometry(roomSize, roomSize);
            if (roomData.textureUrls.ceiling) {
                textureLoadPromises.push(
                    this.loadTextureFromUrl(roomData.textureUrls.ceiling, false, roomSize).then(ceilingTexture => { // Pass roomSize
                        if (!ceilingTexture) { // Add default if texture fails
                            const ceilingMaterial = new THREE.MeshStandardMaterial({ color: 0x555555, side: THREE.DoubleSide });
                            const ceilingMesh = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
                             ceilingMesh.name = "PlaceholderCeilingMesh";
                            ceilingMesh.rotation.x = Math.PI / 2;
                            ceilingMesh.position.y = wallHeight;
                            this.currentRoomObjects.add(ceilingMesh);
                            return;
                        }
                        const ceilingMaterial = new THREE.MeshStandardMaterial({ map: ceilingTexture, side: THREE.DoubleSide });
                        const ceilingMesh = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
                        ceilingMesh.name = "CeilingMesh";
                        ceilingMesh.rotation.x = Math.PI / 2;
                        ceilingMesh.position.y = wallHeight;
                        this.currentRoomObjects.add(ceilingMesh);
                    }).catch(e => {
                        console.error("Error loading ceiling texture:", e);
                        // Add default ceiling on error
                        const ceilingMaterial = new THREE.MeshStandardMaterial({ color: 0x555555, side: THREE.DoubleSide });
                        const ceilingMesh = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
                        ceilingMesh.name = "ErrorCeilingMesh";
                        ceilingMesh.rotation.x = Math.PI / 2;
                        ceilingMesh.position.y = wallHeight;
                        this.currentRoomObjects.add(ceilingMesh);
                    })
                );
            } else {
                console.warn("No ceiling texture URL available for indoor room. Adding placeholder.");
                const ceilingMaterial = new THREE.MeshStandardMaterial({ color: 0x555555, side: THREE.DoubleSide });
                const ceilingMesh = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
                ceilingMesh.name = "DefaultCeilingMesh";
                ceilingMesh.rotation.x = Math.PI / 2;
                ceilingMesh.position.y = wallHeight;
                this.currentRoomObjects.add(ceilingMesh);
            }
        }

        Promise.all(textureLoadPromises).then(() => {
            this.worldObjects.add(this.currentRoomObjects);
            console.log(`Room geometry added to scene for room ${roomData.id}`);
            // Update minimap *after* textures are potentially loaded and meshes added
            if (window.game?.minimap) {
                window.game.minimap.updateFloorTexture();
                if (window.game?.playerController) {
                   window.game.minimap.update(window.game.playerController.getPlayerPosition());
                }
            }
        }).catch(error => {
            console.error("Error loading one or more textures for the room:", error);
            // Still add whatever was built
             this.worldObjects.add(this.currentRoomObjects);
             if (window.game?.minimap) {
                window.game.minimap.updateFloorTexture(); // Update with potentially missing textures
             }
        });
    }


    clearCurrentRoom() {
        // Only clear background if it's a texture (don't clear default colors)
        if (this.scene.background instanceof THREE.Texture) {
            this.scene.background.dispose();
            this.scene.background = null; // Set to null, it will be reset by buildRoom
            console.log("Cleared background texture.");
        }

        if (this.currentRoomObjects) {
            console.log(`Clearing current room objects (${this.currentRoomObjects.name})...`);
             const objectsToRemove = [];
             this.currentRoomObjects.traverse(child => {
                 objectsToRemove.push(child); // Collect all children
             });

             objectsToRemove.forEach(child => {
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
                 } else if (child instanceof CSS2DObject) {
                     child.removeFromParent(); // Ensure CSS2DObjects are removed
                     if (child.element && child.element.parentNode) {
                         child.element.parentNode.removeChild(child.element);
                     }
                 }
                 // Ensure removal from the scene graph group
                 if(child.parent) child.parent.remove(child);
             });

            // Remove the main group itself after clearing children
            this.worldObjects.remove(this.currentRoomObjects);
            this.currentRoomObjects = null; // Set to null after removal
            console.log("Room objects cleared.");
        } else {
            console.log("No current room objects to clear.");
        }

        // Reset minimap texture state
        if (window.game?.minimap) {
            window.game.minimap.floorTexture = null;
            window.game.minimap.texturePattern = null; // Also clear the canvas pattern
            window.game.minimap.patternNeedsUpdate = true;
            // Optionally trigger a redraw with the default background
             if (window.game?.playerController) {
                   window.game.minimap.update(window.game.playerController.getPlayerPosition());
             }
        }
    }

    showLoading(message = 'Loading...') {
        if (this.loadingScreen) {
            this.loadingScreen.querySelector('p').textContent = message;
            this.loadingScreen.style.display = 'flex';
        } else {
             console.warn("Loading screen element not found.");
        }
    }

    hideLoading() {
        if (this.loadingScreen) {
            this.loadingScreen.style.display = 'none';
        }
    }

    update(playerPosition) {
        // Potential future use: check player position for loading adjacent areas, etc.
    }

    async teleportToRoom(roomId, position = new THREE.Vector3(0, 1.6, 5), rotation = { yaw: 0, pitch: 0 }) {
        if (this.isLoading) {
            console.warn("Already loading a room, teleport cancelled.");
            if (window.game?.uiManager) window.game.uiManager.showNotification('Loading already in progress.', 'info');
            return;
        }

        const rooms = this.room.roomState.rooms || {};
        if (!roomId || !rooms[roomId]) {
            console.error("Invalid or non-existent room ID for teleport:", roomId);
            if (window.game && window.game.uiManager) {
                window.game.uiManager.showNotification(`Teleport failed: Room ID "${roomId}" not found.`, 'error');
            }
            return;
        }

        const currentPresence = this.room.presence[this.room.clientId] || {};
        if (currentPresence.currentRoomId === roomId && this.currentRoomObjects) { // Check if objects exist too
            console.log(`Already in room ${roomId}. Teleport skipped.`);
            // Ensure player position is correct even if skipping full teleport
             if (window.game && window.game.playerController) {
                window.game.playerController.resetPosition(position, rotation);
             }
            return;
        }

        this.showLoading(`Teleporting to ${rooms[roomId].name}...`);
        this.isLoading = true;
        // Clear happens within buildRoom now
        // this.clearCurrentRoom();

        try {
            const roomToLoad = rooms[roomId];
            console.log(`Teleporting to room ${roomId}: ${roomToLoad.name} (${roomToLoad.type})`);

             // Update presence *before* building the room visually
             // This ensures others see you disappear from the old room sooner
            this.room.updatePresence({
                ...currentPresence,
                currentRoomId: roomId,
                // Update position/rotation immediately for the new room
                x: position.x,
                y: position.y,
                z: position.z,
                yaw: rotation.yaw,
                pitch: rotation.pitch
            });


            // Build the visual representation of the room
            this.buildRoom(roomToLoad); // This now handles clearing implicitly

            // Allow some time for assets to potentially load/render before placing player
            await new Promise(resolve => setTimeout(resolve, 150));

            if (window.game && window.game.playerController) {
                window.game.playerController.resetPosition(position, rotation);
                 // Force a presence update after reset to ensure sync
                window.game.playerController.sendPresenceUpdate();
            }

            if (window.game && window.game.uiManager) {
                window.game.uiManager.showNotification(`Teleported to ${roomToLoad.name}.`);
                window.game.uiManager.updateRoomGallery(); // Update gallery to show current room
            }


        } catch (error) {
            console.error("Error teleporting to room:", error);
            // Reset to a safe state
            this.clearCurrentRoom();
            this.scene.background = this.defaultOutdoorBg;
            this.room.updatePresence({ ...currentPresence, currentRoomId: null }); // Indicate no room
            if (window.game && window.game.uiManager) {
                window.game.uiManager.showNotification('Teleport failed: Error loading room data.', 'error');
                window.game.uiManager.updateRoomGallery();
            }
        } finally {
            this.hideLoading();
            this.isLoading = false;
        }
    }

    loadTextureFromUrl(url, isSkybox = false, repeatTargetWidth = this.tileSize, repeatTargetHeight = this.tileSize) {
        if (!url || typeof url !== 'string' || (!url.startsWith('http') && !url.startsWith('blob:') && !url.startsWith('data:'))) {
            console.warn(`Invalid or missing URL provided for texture loading: ${url}`);
            return Promise.resolve(null);
        }

        console.log(`Loading texture: ${url.substring(0, 100)}... (Skybox: ${isSkybox})`);
        return new Promise((resolve, reject) => {
            const textureLoader = new THREE.TextureLoader();
            textureLoader.load(
                url,
                (texture) => {
                    console.log(`Successfully loaded texture: ${url.substring(0, 100)}...`);
                    if (isSkybox) {
                        texture.mapping = THREE.EquirectangularReflectionMapping;
                        // Optional: Add seam processing here if needed again
                        // this.roomGenerator.processSkyboxSeam(texture);
                    } else {
                        texture.wrapS = THREE.RepeatWrapping;
                        texture.wrapT = THREE.RepeatWrapping;
                        const textureScale = 2; // How many world units the texture covers once
                        const repeatX = repeatTargetWidth / textureScale;
                        const repeatY = repeatTargetHeight / textureScale;
                        texture.repeat.set(repeatX, repeatY);
                    }
                    texture.needsUpdate = true; // Ensure texture flags update
                    resolve(texture);
                },
                undefined, // onProgress callback (optional)
                (error) => {
                    console.error(`Failed to load texture from URL: ${url}`, error);
                    resolve(null); // Resolve with null on error, don't reject promise chain
                }
            );
        });
    }


    async loadNewDebugRoom(prompt, type = 'outdoor') {
        // Wrapper for the main creation function
        await this.createAndJoinNewRoom(prompt, type);
    }
}