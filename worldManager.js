import * as THREE from 'three';
import { RoomGenerator } from './roomGenerator.js';

export class WorldManager {
    constructor(scene) {
        this.scene = scene;
        this.currentRoomObjects = null;
        this.roomGenerator = new RoomGenerator();
        this.loadingScreen = document.getElementById('loading-screen');
        this.worldObjects = new THREE.Group();
        this.scene.add(this.worldObjects);
        this.activeTiles = new Map();
        this.tileSize = 50;
        this.rooms = [];
        this.currentRoomIndex = -1;

        this.defaultOutdoorBg = new THREE.Color(0x87ceeb);
        this.defaultIndoorBg = new THREE.Color(0x111111);
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
            this.scene.background = this.defaultOutdoorBg;
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
             this.scene.background = type === 'indoor' ? this.defaultIndoorBg : this.defaultOutdoorBg;
         } finally {
            this.hideLoading();
            console.log("New area loaded.");
         }
    }

    buildRoom(roomData) {
        this.currentRoomObjects = new THREE.Group();

        // Set background
        if (roomData.type === 'outdoor') {
             if (roomData.textures.sky) {
                this.scene.background = roomData.textures.sky;
                this.scene.environment = roomData.textures.sky; 
             } else {
                this.scene.background = this.defaultOutdoorBg;
                this.scene.environment = null; 
             }
        } else {
            this.scene.background = this.defaultIndoorBg;
            this.scene.environment = null; 
        }

        // Floor
        if (roomData.textures.floor) {
            const floorGeometry = new THREE.PlaneGeometry(this.tileSize, this.tileSize);
            const floorMaterial = new THREE.MeshStandardMaterial({
                map: roomData.textures.floor,
                roughness: 0.8, 
                metalness: 0.1
            });
            const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
            floorMesh.rotation.x = -Math.PI / 2;
            floorMesh.position.y = 0;
            floorMesh.receiveShadow = true; 
            this.currentRoomObjects.add(floorMesh);
        } else {
            console.warn("No floor texture available for room.");
             // Add placeholder floor that can receive shadows
             const floorGeometry = new THREE.PlaneGeometry(this.tileSize, this.tileSize);
             const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x808080, roughness: 1.0 });
             const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
             floorMesh.rotation.x = -Math.PI / 2;
             floorMesh.position.y = 0;
             floorMesh.receiveShadow = true;
             this.currentRoomObjects.add(floorMesh);
        }

        // Walls & Ceiling (Indoor only)
        if (roomData.type === 'indoor') {
            const wallHeight = roomData.structure?.dimensions?.height || 4; 

            // Walls
            if (roomData.textures.wall) {
                const wallGeometry = new THREE.BoxGeometry(this.tileSize, wallHeight, 0.1);
                const wallMaterial = new THREE.MeshStandardMaterial({
                    map: roomData.textures.wall,
                    roughness: 0.9,
                    metalness: 0.1
                });
                const wallPositions = [
                    { x: 0, y: wallHeight / 2, z: -this.tileSize / 2, rotY: 0 },
                    { x: 0, y: wallHeight / 2, z: this.tileSize / 2, rotY: Math.PI },
                    { x: -this.tileSize / 2, y: wallHeight / 2, z: 0, rotY: Math.PI / 2 },
                    { x: this.tileSize / 2, y: wallHeight / 2, z: 0, rotY: -Math.PI / 2 }
                ];
                wallPositions.forEach(pos => {
                    const wallMesh = new THREE.Mesh(wallGeometry.clone(), wallMaterial.clone()); 
                    wallMesh.position.set(pos.x, pos.y, pos.z);
                    wallMesh.rotation.y = pos.rotY;
                    wallMesh.castShadow = true; 
                    wallMesh.receiveShadow = true; 
                    this.currentRoomObjects.add(wallMesh);
                });
            } else {
                console.warn("No wall texture available for indoor room.");
                 // Add placeholder walls
                 const wallGeometry = new THREE.BoxGeometry(this.tileSize, wallHeight, 0.1);
                 const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xA0A0A0, roughness: 1.0 });
                 const wallPositions = [ 
                    { x: 0, y: wallHeight / 2, z: -this.tileSize / 2, rotY: 0 },
                    { x: 0, y: wallHeight / 2, z: this.tileSize / 2, rotY: Math.PI },
                    { x: -this.tileSize / 2, y: wallHeight / 2, z: 0, rotY: Math.PI / 2 },
                    { x: this.tileSize / 2, y: wallHeight / 2, z: 0, rotY: -Math.PI / 2 }
                 ];
                 wallPositions.forEach(pos => {
                     const wallMesh = new THREE.Mesh(wallGeometry.clone(), wallMaterial.clone());
                     wallMesh.position.set(pos.x, pos.y, pos.z);
                     wallMesh.rotation.y = pos.rotY;
                     wallMesh.castShadow = true;
                     wallMesh.receiveShadow = true;
                     this.currentRoomObjects.add(wallMesh);
                 });
            }

            // Ceiling
            const ceilingGeometry = new THREE.PlaneGeometry(this.tileSize, this.tileSize);
            let ceilingMaterial;
             if (roomData.textures.ceiling) {
                 ceilingMaterial = new THREE.MeshStandardMaterial({
                    map: roomData.textures.ceiling,
                    side: THREE.DoubleSide, 
                    roughness: 0.9,
                    metalness: 0.1
                 });
             } else {
                 ceilingMaterial = new THREE.MeshStandardMaterial({
                    color: 0x555555,
                    side: THREE.DoubleSide,
                    roughness: 1.0
                 });
             }
            const ceilingMesh = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
            ceilingMesh.rotation.x = Math.PI / 2;
            ceilingMesh.position.y = wallHeight;
            ceilingMesh.receiveShadow = true; 
            this.currentRoomObjects.add(ceilingMesh);
        }

        // Add the group of room objects to the main world group
        this.worldObjects.add(this.currentRoomObjects);

        // Update minimap texture cache since room changed
        if (window.game && window.game.minimap) {
             window.game.minimap.floorTexture = null; 
             window.game.minimap.patternNeedsUpdate = true;
        }
    }

    clearCurrentRoom() {
         if (this.currentRoomObjects) {
            this.currentRoomObjects.traverse(child => {
                if (child instanceof THREE.Mesh) {
                    child.geometry?.dispose();
                    if (Array.isArray(child.material)) {
                        child.material.forEach(mat => {
                            mat.map?.dispose();
                            mat.dispose();
                        });
                    } else if (child.material) {
                        child.material.map?.dispose();
                        child.material.dispose();
                    }
                }
            });
            this.worldObjects.remove(this.currentRoomObjects);
            this.currentRoomObjects.clear();
            this.currentRoomObjects = null;
        }
         // Also clear the background texture and environment map
         if (this.scene.background instanceof THREE.Texture) {
            this.scene.background.dispose();
         }
         if (this.scene.environment instanceof THREE.Texture) {
            this.scene.environment.dispose();
         }
         this.scene.background = null;
         this.scene.environment = null;
    }

    showLoading() {
        this.loadingScreen.style.display = 'flex';
    }

    hideLoading() {
        this.loadingScreen.style.display = 'none';
    }

    update(playerPosition) {
        // Existing logic...

        // Update minimap if it exists
        if (window.game && window.game.minimap) {
            window.game.minimap.update(playerPosition);
        }
    }

    addRoomToCollection(roomData) {
         // Dispose textures immediately after getting URLs, EXCEPT skybox if used for environment
         const textureUrls = {
             floor: roomData.textures.floor?.image?.src || null,
             wall: roomData.textures.wall?.image?.src || null,
             ceiling: roomData.textures.ceiling?.image?.src || null,
             sky: roomData.textures.sky?.image?.src || null
         };

         if (roomData.textures.floor) roomData.textures.floor.dispose();
         if (roomData.textures.wall) roomData.textures.wall.dispose();
         if (roomData.textures.ceiling) roomData.textures.ceiling.dispose();
         // Keep sky texture if it's currently set as scene background/environment
         // It will be disposed during clearCurrentRoom or when a new sky is loaded
         // if (roomData.textures.sky && this.scene.background !== roomData.textures.sky) {
         //     roomData.textures.sky.dispose();
         // }


        const roomRecord = {
            id: Date.now() + Math.random(),
            name: `Room ${this.rooms.length + 1}`,
            prompt: roomData.prompt,
            type: roomData.type,
            textureUrls: textureUrls,
            timestamp: new Date().toISOString(),
            structure: roomData.structure,
            objects: roomData.objects
        };

        this.rooms.push(roomRecord);
        this.currentRoomIndex = this.rooms.length - 1;

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
             this.currentRoomIndex = -1; 

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
        this.clearCurrentRoom(); 

        try {
            const roomToLoad = this.rooms[index];
            console.log(`Teleporting to room ${index}: ${roomToLoad.name} (${roomToLoad.type})`);

            // Load textures from stored URLs
            const textures = {
                 floor: roomToLoad.textureUrls.floor ? await this.loadTextureFromUrl(roomToLoad.textureUrls.floor, false) : null,
                 wall: roomToLoad.textureUrls.wall ? await this.loadTextureFromUrl(roomToLoad.textureUrls.wall, false) : null,
                 ceiling: roomToLoad.textureUrls.ceiling ? await this.loadTextureFromUrl(roomToLoad.textureUrls.ceiling, false) : null,
                 sky: roomToLoad.textureUrls.sky ? await this.loadTextureFromUrl(roomToLoad.textureUrls.sky, true) : null 
            };

            const roomData = {
                ...roomToLoad,
                textures: textures
            };

            this.buildRoom(roomData);
            this.currentRoomIndex = index;

             if (window.game && window.game.playerController) {
                 window.game.playerController.resetPosition(); 
             }

            if (window.game && window.game.uiManager) {
                window.game.uiManager.updateRoomGallery(this.rooms, this.currentRoomIndex);
                 window.game.uiManager.showNotification(`Teleported to ${roomToLoad.name}.`);
            }

        } catch (error) {
            console.error("Error teleporting to room:", error);
             this.scene.background = this.defaultOutdoorBg;
             this.scene.environment = null;
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
                     texture.colorSpace = THREE.SRGBColorSpace; 
                     if (isSkybox) {
                         texture.mapping = THREE.EquirectangularReflectionMapping;
                         // Consider processing seam if needed here too
                         // if (window.game?.roomGenerator) window.game.roomGenerator.processSkyboxSeam(texture);
                         // No wrapping or repeat for skybox
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
                    reject(error);
                }
            );
        });
    }

     async loadNewDebugRoom(prompt, type = 'outdoor') {
        await this.loadNewArea(prompt, type);
    }
}