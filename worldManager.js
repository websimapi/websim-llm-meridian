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
                targetRoomId = roomIds[0];
                console.log(`Found existing rooms. Joining room: ${targetRoomId}`);
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
        this.showLoading();
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
                        else {
                            console.warn(`Texture image source type for key '${key}' might not be directly uploadable or is assumed pre-uploaded:`, texture.image.src);
                            try {
                                const response = await fetch(texture.image.src);
                                if (!response.ok) throw new Error(`Fetch failed: ${response.statusText}`);
                                const blob = await response.blob();
                                file = new File([blob], `${key}_${Date.now()}.png`, { type: blob.type || 'image/png' });
                            } catch (fetchError) {
                                console.error(`Could not fetch texture source for upload (${key}): ${fetchError}. Storing original source URL.`);
                                return { key, url: texture.image.src }; 
                            }

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
                name: `Room ${Object.keys(this.room.roomState.rooms || {}).length + 1}`, 
                prompt: roomData.prompt,
                type: roomData.type,
                textureUrls: textureUrls, 
                timestamp: new Date().toISOString(),
                structure: roomData.structure,
                objects: roomData.objects,
                creatorId: this.room.clientId, 
                creatorUsername: this.room.peers[this.room.clientId]?.username || 'Unknown',
            };

            this.room.updateRoomState({
                rooms: {
                    [roomId]: roomRecord
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

        this.currentRoomObjects = new THREE.Group(); 

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

        if (roomData.textureUrls.floor) {
            textureLoadPromises.push(
                this.loadTextureFromUrl(roomData.textureUrls.floor, false).then(floorTexture => {
                    if (!floorTexture) return; 
                    const floorGeometry = new THREE.PlaneGeometry(this.tileSize, this.tileSize);
                    const floorMaterial = new THREE.MeshStandardMaterial({ map: floorTexture });
                    const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
                    floorMesh.rotation.x = -Math.PI / 2;
                    floorMesh.position.y = 0;
                    this.currentRoomObjects.add(floorMesh);
                    window.game?.minimap?.updateFloorTexture(); 
                })
            );
        } else {
            console.warn("No floor texture URL available for room.");
        }

        if (roomData.type === 'indoor') {
            const wallHeight = roomData.structure?.dimensions?.height || 4;

            if (roomData.textureUrls.wall) {
                textureLoadPromises.push(
                    this.loadTextureFromUrl(roomData.textureUrls.wall, false).then(wallTexture => {
                        if (!wallTexture) return; 
                        const wallGeometry = new THREE.BoxGeometry(this.tileSize, wallHeight, 0.1); 
                        const wallMaterial = new THREE.MeshStandardMaterial({ map: wallTexture });
                        const wallPositions = [
                            { x: 0, y: wallHeight / 2, z: -this.tileSize / 2, rotY: 0 },
                            { x: 0, y: wallHeight / 2, z: this.tileSize / 2, rotY: Math.PI },
                            { x: -this.tileSize / 2, y: wallHeight / 2, z: 0, rotY: Math.PI / 2 },
                            { x: this.tileSize / 2, y: wallHeight / 2, z: 0, rotY: -Math.PI / 2 }
                        ];
                        wallPositions.forEach(pos => {
                            const wallMesh = new THREE.Mesh(wallGeometry.clone(), wallMaterial); 
                            wallMesh.position.set(pos.x, pos.y, pos.z);
                            wallMesh.rotation.y = pos.rotY;
                            this.currentRoomObjects.add(wallMesh);
                        });
                    })
                );
            } else {
                console.warn("No wall texture URL available for indoor room.");
            }

            const ceilingGeometry = new THREE.PlaneGeometry(this.tileSize, this.tileSize);
            if (roomData.textureUrls.ceiling) {
                textureLoadPromises.push(
                    this.loadTextureFromUrl(roomData.textureUrls.ceiling, false).then(ceilingTexture => {
                        if (!ceilingTexture) return; 
                        const ceilingMaterial = new THREE.MeshStandardMaterial({ map: ceilingTexture, side: THREE.DoubleSide });
                        const ceilingMesh = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
                        ceilingMesh.rotation.x = Math.PI / 2;
                        ceilingMesh.position.y = wallHeight;
                        this.currentRoomObjects.add(ceilingMesh);
                    })
                );
            } else {
                const ceilingMaterial = new THREE.MeshStandardMaterial({ color: 0x555555, side: THREE.DoubleSide });
                const ceilingMesh = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
                ceilingMesh.rotation.x = Math.PI / 2;
                ceilingMesh.position.y = wallHeight;
                this.currentRoomObjects.add(ceilingMesh);
            }
        }

        Promise.all(textureLoadPromises).then(() => {
            this.worldObjects.add(this.currentRoomObjects);
            console.log("Room geometry added to scene.");
        }).catch(error => {
            console.error("Error loading one or more textures for the room:", error);
            this.worldObjects.add(this.currentRoomObjects);
        });
    }

    clearCurrentRoom() {
        if (this.scene.background instanceof THREE.Texture) {
            this.scene.background.dispose();
            this.scene.background = null; 
            console.log("Cleared background texture.");
        }

        if (this.currentRoomObjects) {
            console.log("Clearing current room objects...");
            this.currentRoomObjects.traverse(child => {
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
                    child.removeFromParent();
                }
            });
            this.worldObjects.remove(this.currentRoomObjects);
            this.currentRoomObjects.children.length = 0; 
            this.currentRoomObjects = null;
            console.log("Room objects cleared.");
        } else {
            console.log("No current room objects to clear.");
        }
        if (window.game?.minimap) {
            window.game.minimap.floorTexture = null;
            window.game.minimap.patternNeedsUpdate = true;
        }
    }

    showLoading(message = 'Loading...') {
        this.loadingScreen.querySelector('p').textContent = message;
        this.loadingScreen.style.display = 'flex';
    }

    hideLoading() {
        this.loadingScreen.style.display = 'none';
    }

    update(playerPosition) {
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
        if (currentPresence.currentRoomId === roomId) {
            console.log(`Already in room ${roomId}. Teleport skipped.`);
            return;
        }

        this.showLoading(`Teleporting to ${rooms[roomId].name}...`);
        this.isLoading = true;
        this.clearCurrentRoom(); 

        try {
            const roomToLoad = rooms[roomId];
            console.log(`Teleporting to room ${roomId}: ${roomToLoad.name} (${roomToLoad.type})`);

            this.room.updatePresence({
                ...currentPresence, 
                currentRoomId: roomId
            });

            this.buildRoom(roomToLoad);

            await new Promise(resolve => setTimeout(resolve, 100));

            if (window.game && window.game.playerController) {
                window.game.playerController.resetPosition(position, rotation); 
            }

            if (window.game && window.game.uiManager) {
                window.game.uiManager.showNotification(`Teleported to ${roomToLoad.name}.`);
            }

        } catch (error) {
            console.error("Error teleporting to room:", error);
            this.scene.background = this.defaultOutdoorBg; 
            if (window.game && window.game.uiManager) {
                window.game.uiManager.showNotification('Teleport failed: Error loading room data.', 'error');
            }
        } finally {
            this.hideLoading();
            this.isLoading = false;
        }
    }

    loadTextureFromUrl(url, isSkybox = false) {
        if (!url || typeof url !== 'string' || (!url.startsWith('http') && !url.startsWith('blob:') && !url.startsWith('data:'))) {
            console.warn(`Invalid URL provided for texture loading: ${url}`);
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
                    } else {
                        texture.wrapS = THREE.RepeatWrapping;
                        texture.wrapT = THREE.RepeatWrapping;
                        const textureScale = 2;
                        const repeatValue = this.tileSize / textureScale;
                        texture.repeat.set(repeatValue, repeatValue);
                    }
                    resolve(texture);
                },
                undefined, 
                (error) => {
                    console.error(`Failed to load texture from URL: ${url}`, error);
                    resolve(null); 
                }
            );
        });
    }

    async loadNewDebugRoom(prompt, type = 'outdoor') {
        await this.createAndJoinNewRoom(prompt, type);
    }
}