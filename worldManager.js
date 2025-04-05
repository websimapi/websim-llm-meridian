import * as THREE from 'three';
import { RoomGenerator } from './roomGenerator.js';
import { TextureManager } from './textureManager.js'; 
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

export class WorldManager {
    constructor(scene, room) {
        this.scene = scene;
        this.room = room;
        this.textureManager = new TextureManager(); 
        this.roomGenerator = new RoomGenerator(); 
        this.currentRoomObjects = null;
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
        if (this.isLoading) {
            console.warn("generateInitialWorld called while already loading.");
            return;
        }
        console.log("Generating initial world (checking shared state)...");
        this.showLoading();
        this.isLoading = true;
        try {
            const rooms = this.room.roomState.rooms || {};
            const roomIds = Object.keys(rooms);

            if (roomIds.length > 0) {
                const sortedRooms = Object.values(rooms).sort((a, b) => (b.timestamp && a.timestamp) ? new Date(b.timestamp) - new Date(a.timestamp) : 0);
                if (sortedRooms.length > 0) {
                    const targetRoomId = sortedRooms[0].id;
                    console.log(`Found existing rooms. Joining most recent room: ${targetRoomId}`);
                } else {
                     console.log("Found rooms object but it was empty or invalid, generating initial room.");
                     // Fall through to generate initial room
                }

            }

            let targetRoomId = null;
            let playerStartPosition = new THREE.Vector3(0, 1.6, 5); 
            if (!targetRoomId) { 
                console.log("No suitable existing rooms found. Generating initial room...");
                const initialRoomData = await this.roomGenerator.generateRoomData('A bright, grassy clearing in a fantasy forest, under a blue sky.', 'outdoor');
                targetRoomId = await this.addRoomToSharedState(initialRoomData);
                if (!targetRoomId) {
                    throw new Error("Failed to add initial room to shared state.");
                }
                console.log(`Generated initial room with ID: ${targetRoomId}`);
            }

            if (!targetRoomId) {
                 throw new Error("Could not determine a target room ID to join.");
            }

            await this.teleportToRoom(targetRoomId, playerStartPosition);

        } catch (error) {
            console.error("Failed to initialize world:", error);
            this.scene.background = this.defaultOutdoorBg; 
            if (window.game && window.game.uiManager) {
                window.game.uiManager.showNotification('Error initializing world.', 'error');
            }
            this.hideLoading();
            this.isLoading = false; 
        } finally {
            console.log("World initialization process complete.");
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
            this.hideLoading();
            this.isLoading = false;
        } finally {
            console.log("New room creation process finished.");
        }
    }

    async addRoomToSharedState(roomData) {
        try {
            console.log("Starting texture upload process...");
            const textureUploadPromises = Object.entries(roomData.textures)
                .filter(([key, texture]) => texture && texture.image) 
                .map(async ([key, texture]) => {
                    try {
                        console.log(`Preparing texture '${key}' for upload...`);
                        let file;
                        const timestamp = Date.now();
                        const filename = `${key}_${timestamp}.png`;

                        if (texture.image instanceof HTMLImageElement && !texture.image.complete) {
                            console.log(`Waiting for image '${key}' to load before upload...`);
                            await new Promise((resolve, reject) => {
                                texture.image.onload = resolve;
                                texture.image.onerror = reject;
                            });
                            console.log(`Image '${key}' loaded.`);
                        }

                        if (texture.image instanceof HTMLCanvasElement) {
                            console.log(`Converting canvas texture '${key}' to blob...`);
                            const blob = await new Promise(resolve => texture.image.toBlob(resolve, 'image/png'));
                            file = new File([blob], filename, { type: 'image/png' });
                        } else if (texture.image instanceof ImageBitmap) {
                            console.log(`Converting ImageBitmap texture '${key}' to blob via canvas...`);
                            const canvas = document.createElement('canvas');
                            canvas.width = texture.image.width;
                            canvas.height = texture.image.height;
                            const ctx = canvas.getContext('2d');
                            ctx.drawImage(texture.image, 0, 0);
                            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
                            file = new File([blob], filename, { type: 'image/png' });
                        } else if (texture.image instanceof HTMLImageElement) {
                            console.log(`Processing HTMLImageElement texture '${key}' (src type: ${texture.image.src.substring(0,10)})...`);
                            let blob;
                            if (texture.image.src.startsWith('data:') || texture.image.src.startsWith('blob:')) {
                                blob = await fetch(texture.image.src).then(res => res.blob());
                            } else {
                                try {
                                    console.log(`Fetching external image source for '${key}': ${texture.image.src.substring(0, 60)}...`);
                                    const response = await fetch(texture.image.src, { mode: 'cors' });
                                    if (!response.ok) throw new Error(`Fetch failed: ${response.statusText}`);
                                    blob = await response.blob();
                                    console.log(`Fetch successful for '${key}'.`);
                                } catch (fetchError) {
                                    console.error(`Could not fetch texture source for upload (${key}): ${fetchError}. Storing original source URL might fail later.`);
                                    return { key, url: texture.image.src };
                                }
                            }
                            file = new File([blob], filename, { type: blob.type || 'image/png' });

                        } else {
                            console.warn(`Unsupported image type for texture key '${key}':`, texture.image);
                            return { key, url: null }; 
                        }

                        if (!file) {
                            console.warn(`Could not create file for texture key '${key}'.`);
                            return { key, url: null };
                        }

                        console.log(`Uploading file for texture '${key}' (size: ${file.size})...`);
                        const url = await websim.upload(file);
                        console.log(`Upload successful for '${key}', URL: ${url.substring(0,60)}...`);
                        return { key, url };

                    } catch (uploadError) {
                        console.error(`Error processing/uploading texture for key ${key}:`, uploadError);
                        return { key, url: null }; 
                    } finally {
                        if (texture) texture.dispose();
                        console.log(`Disposed THREE.Texture object for key '${key}'.`);
                    }
                });

            const uploadedTextures = await Promise.all(textureUploadPromises);
            console.log("Texture upload process finished.");

            const textureUrls = uploadedTextures.reduce((acc, { key, url }) => {
                if (url) acc[key] = url;
                else console.warn(`Texture URL for key '${key}' is null after upload attempt.`);
                return acc;
            }, { floor: null, wall: null, ceiling: null, sky: null }); 

            const roomId = `room_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
            const roomRecord = {
                id: roomId,
                name: roomData.prompt.substring(0,30) + (roomData.prompt.length > 30 ? '...' : ''),
                prompt: roomData.prompt,
                type: roomData.type,
                textureUrls: textureUrls, 
                timestamp: new Date().toISOString(),
                structure: roomData.structure,
                objects: roomData.objects || [],
                creatorId: this.room.clientId,
                creatorUsername: this.room.peers[this.room.clientId]?.username || 'Unknown',
            };

            const existingRooms = this.room.roomState.rooms || {};

            this.room.updateRoomState({
                rooms: {
                    ...existingRooms,
                    [roomId]: roomRecord
                }
            });

            console.log(`Room added to shared state with ID: ${roomId}`);
            return roomId;

        } catch(error) {
            console.error("Failed to add room to shared state:", error);
            Object.values(roomData.textures || {}).forEach(tex => tex?.dispose());
            return null;
        }
    }

    async buildRoom(roomData) {
        if (!roomData || !roomData.textureUrls) {
            console.error("buildRoom called with invalid roomData:", roomData);
            this.scene.background = this.defaultIndoorBg; 
            return;
        }

        console.log(`Building room ${roomData.id} (${roomData.type})...`);
        this.clearCurrentRoom();
        this.currentRoomObjects = new THREE.Group();
        this.currentRoomObjects.name = `RoomObjects_${roomData.id}`;

        const textureLoadPromises = [];
        const roomSize = roomData.structure?.dimensions?.width || this.tileSize;
        const textureScale = 2; 

        if (roomData.type === 'outdoor') {
            if (roomData.textureUrls.sky) {
                this.textureManager.loadTextureFromUrl(roomData.textureUrls.sky, true)
                    .then(skyTexture => {
                        if (skyTexture) {
                            if (this.scene.background instanceof THREE.Texture) {
                                this.scene.background.dispose();
                            }
                            this.scene.background = skyTexture;
                            console.log("Skybox texture applied.");
                        } else {
                            console.warn("Skybox texture failed to load, using default.");
                            this.scene.background = this.defaultOutdoorBg;
                        }
                    }).catch(e => {
                        console.error("Error loading sky texture, using default:", e);
                        this.scene.background = this.defaultOutdoorBg;
                    });
            } else {
                console.log("No sky texture URL, using default outdoor background.");
                this.scene.background = this.defaultOutdoorBg;
            }
        } else {
            console.log("Indoor room, using default indoor background.");
            this.scene.background = this.defaultIndoorBg;
        }

        if (roomData.textureUrls.floor) {
            textureLoadPromises.push(
                this.textureManager.loadTextureFromUrl(roomData.textureUrls.floor, false, roomSize, roomSize, textureScale).then(floorTexture => {
                    const floorGeometry = new THREE.PlaneGeometry(roomSize, roomSize);
                    const floorMaterial = new THREE.MeshStandardMaterial({
                        map: floorTexture || this.textureManager.createPlaceholderTexture(0xffffff, roomSize, textureScale), 
                        roughness: 0.8, metalness: 0.1 
                    });
                    const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
                    floorMesh.name = "FloorMesh";
                    floorMesh.rotation.x = -Math.PI / 2;
                    floorMesh.position.y = 0;
                    floorMesh.receiveShadow = true; 
                    this.currentRoomObjects.add(floorMesh);
                    console.log("Floor mesh added.");
                }).catch(e => console.error("Error processing floor texture promise:", e)) 
            );
        } else {
            console.warn("No floor texture URL available for room. Adding placeholder floor.");
            const floorGeometry = new THREE.PlaneGeometry(roomSize, roomSize);
            const floorMaterial = new THREE.MeshStandardMaterial({
                map: this.textureManager.createPlaceholderTexture(0xffffff, roomSize, textureScale),
                roughness: 0.8, metalness: 0.1
            });
            const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
            floorMesh.name = "PlaceholderFloorMesh";
            floorMesh.rotation.x = -Math.PI / 2;
            floorMesh.position.y = 0;
            floorMesh.receiveShadow = true;
            this.currentRoomObjects.add(floorMesh);
        }

        if (roomData.type === 'indoor') {
            const wallHeight = roomData.structure?.dimensions?.height || 4;
            const wallTextureUrl = roomData.textureUrls.wall;

            textureLoadPromises.push(
                this.textureManager.loadTextureFromUrl(wallTextureUrl, false, roomSize, wallHeight, textureScale).then(wallTexture => {
                    const wallMaterial = new THREE.MeshStandardMaterial({
                        map: wallTexture || this.textureManager.createPlaceholderTexture(0xaaaaaa, roomSize, textureScale), 
                        roughness: 0.8, metalness: 0.1
                    });
                    if (!wallTextureUrl) console.warn("No wall texture URL, using placeholder material.");

                    const wallPositions = [
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
                        wallMesh.receiveShadow = true; 
                        this.currentRoomObjects.add(wallMesh);
                    });
                    console.log("Wall meshes added.");
                }).catch(e => console.error("Error processing wall texture promise:", e))
            );

            const ceilingTextureUrl = roomData.textureUrls.ceiling;
            textureLoadPromises.push(
                this.textureManager.loadTextureFromUrl(ceilingTextureUrl, false, roomSize, roomSize, textureScale).then(ceilingTexture => {
                    const ceilingGeometry = new THREE.PlaneGeometry(roomSize, roomSize);
                    const ceilingMaterial = new THREE.MeshStandardMaterial({
                        map: ceilingTexture || this.textureManager.createPlaceholderTexture(0x555555, roomSize, textureScale), 
                        side: THREE.DoubleSide, 
                        roughness: 0.9, metalness: 0.1
                    });
                    if (!ceilingTextureUrl) console.warn("No ceiling texture URL, using placeholder material.");

                    const ceilingMesh = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
                    ceilingMesh.name = "CeilingMesh";
                    ceilingMesh.rotation.x = Math.PI / 2;
                    ceilingMesh.position.y = wallHeight;
                    ceilingMesh.receiveShadow = true;
                    this.currentRoomObjects.add(ceilingMesh);
                    console.log("Ceiling mesh added.");
                }).catch(e => console.error("Error processing ceiling texture promise:", e))
            );
        }

        try {
            await Promise.all(textureLoadPromises);
            console.log("All essential geometry promises resolved.");
            this.worldObjects.add(this.currentRoomObjects);
            console.log(`Room geometry group added to scene for room ${roomData.id}`);

            if (window.game?.minimap) {
                window.game.minimap.updateFloorTexture(); 
                if (window.game?.playerController) {
                    window.game.minimap.update(window.game.playerController.getPlayerPosition()); 
                }
            }
        } catch (error) {
            console.error("Error loading one or more textures for the room:", error);
            this.worldObjects.add(this.currentRoomObjects);
            console.warn("Added potentially incomplete room geometry to scene after texture errors.");
            if (window.game?.minimap) {
                window.game.minimap.updateFloorTexture(); 
            }
        } finally {
            console.log(`Finished building room ${roomData.id}.`);
        }
    }

    clearCurrentRoom() {
        if (this.scene.background instanceof THREE.Texture) {
            let isCached = false;
            this.textureManager.cachedTextures.forEach(cachedTex => {
                if (cachedTex === this.scene.background) {
                    isCached = true;
                }
            });

            if (!isCached) {
                console.log("Disposing non-cached background texture.");
                this.scene.background.dispose();
            } else {
                console.log("Keeping cached background texture in memory, removing from scene background.");
            }
            this.scene.background = null; 
        }

        if (this.currentRoomObjects) {
            console.log(`Clearing current room objects (${this.currentRoomObjects.name})...`);
            const objectsToRemove = [];
            this.currentRoomObjects.traverse(child => {
                objectsToRemove.push(child);
            });

            objectsToRemove.forEach(child => {
                if (child instanceof THREE.Mesh) {
                    child.geometry?.dispose();
                    const materials = Array.isArray(child.material) ? child.material : [child.material];
                    materials.forEach(mat => {
                        if (mat) {
                            let isMapCached = false;
                            if (mat.map instanceof THREE.Texture) {
                                this.textureManager.cachedTextures.forEach(cachedTex => {
                                    if (cachedTex === mat.map) {
                                        isMapCached = true;
                                    }
                                });
                                if (!isMapCached) {
                                    mat.map.dispose();
                                }
                            }
                            mat.dispose();
                        }
                    });
                } else if (child instanceof CSS2DObject) {
                    child.removeFromParent();
                    if (child.element && child.element.parentNode) {
                        child.element.parentNode.removeChild(child.element);
                    }
                }
                child.removeFromParent();
            });

            this.worldObjects.remove(this.currentRoomObjects);
            this.currentRoomObjects = null;
            console.log("Room objects cleared.");
        } else {
            // console.log("No current room objects to clear.");
        }

        if (window.game?.minimap) {
            window.game.minimap.updateFloorTexture(); 
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
        const roomToLoad = rooms[roomId];

        if (!roomId || !roomToLoad) {
            console.error("Invalid or non-existent room ID for teleport:", roomId);
            if (window.game?.uiManager) {
                window.game.uiManager.showNotification(`Teleport failed: Room ID "${roomId}" not found.`, 'error');
            }
            return;
        }

        const currentPresence = this.room.presence[this.room.clientId] || {};
        if (currentPresence.currentRoomId === roomId && this.currentRoomObjects) {
            console.log(`Already in room ${roomId}. Teleport skipped.`);
            if (window.game?.playerController) {
                window.game.playerController.resetPosition(position, rotation);
            }
            if (window.game?.uiManager) {
                window.game.uiManager.updateRoomGallery();
            }
            return;
        }

        console.log(`Teleporting to room ${roomId}: ${roomToLoad.name} (${roomToLoad.type})`);
        this.showLoading(`Teleporting to ${roomToLoad.name}...`);
        this.isLoading = true;

        try {
            this.room.updatePresence({
                ...currentPresence,
                currentRoomId: roomId,
                x: position.x,
                y: position.y,
                z: position.z,
                yaw: rotation.yaw,
                pitch: rotation.pitch
            });
            console.log(`Presence updated for room ${roomId}.`);

            await this.buildRoom(roomToLoad); 

            console.log(`Room ${roomId} built. Resetting player position.`);
            if (window.game && window.game.playerController) {
                window.game.playerController.resetPosition(position, rotation);
                window.game.playerController.sendPresenceUpdate();
            } else {
                console.warn("Player controller not available to reset position after teleport.");
            }

            if (window.game && window.game.uiManager) {
                window.game.uiManager.showNotification(`Teleported to ${roomToLoad.name}.`);
                window.game.uiManager.updateRoomGallery();
            }

        } catch (error) {
            console.error("Error during teleport process:", error);
            this.clearCurrentRoom(); 
            this.scene.background = this.defaultOutdoorBg; 
            this.room.updatePresence({ ...currentPresence, currentRoomId: null });
            if (window.game && window.game.uiManager) {
                window.game.uiManager.showNotification('Teleport failed: Error loading room.', 'error');
                window.game.uiManager.updateRoomGallery(); 
            }
        } finally {
            this.hideLoading();
            this.isLoading = false;
            console.log(`Teleport process for ${roomId} finished.`);
        }
    }

    async loadNewDebugRoom(prompt, type = 'outdoor') {
        await this.createAndJoinNewRoom(prompt, type);
    }

    dispose() {
        console.log("Disposing WorldManager resources...");
        this.clearCurrentRoom(); 
        this.textureManager.disposeCache(); 
        this.scene.remove(this.worldObjects); 
    }
}