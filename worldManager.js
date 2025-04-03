import * as THREE from 'three';
import { RoomGenerator } from './roomGenerator.js';

export class WorldManager {
    constructor(scene) {
        this.scene = scene;
        this.currentRoomObjects = null;
        this.roomGenerator = new RoomGenerator();
        this.loadingScreen = document.getElementById('loading-screen');
        this.worldObjects = new THREE.Group(); 
        this.skyObjects = new THREE.Group(); 
        this.scene.add(this.worldObjects);
        this.scene.add(this.skyObjects);
        this.activeTiles = new Map();
        this.tileSize = 50;
        this.rooms = [];
        this.currentRoomIndex = -1;
        this.cloudTexture = null;

        this.defaultOutdoorBg = new THREE.Color(0x87ceeb);
        this.defaultIndoorBg = new THREE.Color(0x111111);
    }

    async generateInitialWorld() {
        console.log("Generating initial world...");
        this.showLoading();
        try {
            this.cloudTexture = await this.roomGenerator.generateCloudTexture();

            const initialRoomData = await this.roomGenerator.generateRoomData('A bright, grassy clearing in a fantasy forest, under a blue sky with fluffy white clouds.', 'outdoor');
            this.buildRoom(initialRoomData);
            this.addRoomToCollection(initialRoomData);
        } catch (error) {
            console.error("Failed to generate initial world:", error);
            this.scene.background = this.defaultOutdoorBg;
            this.clearSkyObjects(); 
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
            if (type === 'outdoor' && !this.cloudTexture) {
                this.cloudTexture = await this.roomGenerator.generateCloudTexture();
            }

            const newRoomData = await this.roomGenerator.generateRoomData(prompt, type);
            this.buildRoom(newRoomData);
            this.addRoomToCollection(newRoomData);
        } catch (error) {
            console.error("Error generating new area:", error);
            this.scene.background = type === 'indoor' ? this.defaultIndoorBg : this.defaultOutdoorBg;
            this.clearSkyObjects(); 
        } finally {
            this.hideLoading();
            console.log("New area loaded.");
        }
    }

    buildRoom(roomData) {
        this.clearCurrentRoom(); 
        this.currentRoomObjects = new THREE.Group(); 

        if (roomData.type === 'outdoor') {
            if (roomData.textures.sky) {
                this.scene.background = roomData.textures.sky;
                this.scene.environment = roomData.textures.sky;
            } else {
                this.scene.background = this.defaultOutdoorBg;
                this.scene.environment = null;
            }
            this.createClouds();

        } else { 
            this.scene.background = this.defaultIndoorBg;
            this.scene.environment = null;
            this.clearSkyObjects(); 
        }

        let floorMaterial;
        if (roomData.textures.floor) {
            floorMaterial = new THREE.MeshStandardMaterial({
                map: roomData.textures.floor,
                roughness: 0.8,
                metalness: 0.1
            });
        } else {
            console.warn("No floor texture available for room.");
            floorMaterial = new THREE.MeshStandardMaterial({ color: 0x808080, roughness: 1.0 });
        }
        const floorGeometry = new THREE.PlaneGeometry(this.tileSize, this.tileSize);
        const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
        floorMesh.rotation.x = -Math.PI / 2;
        floorMesh.position.y = 0;
        floorMesh.receiveShadow = true;
        this.currentRoomObjects.add(floorMesh);

        if (roomData.type === 'indoor') {
            const wallHeight = roomData.structure?.dimensions?.height || 4;

            let wallMaterial;
            if (roomData.textures.wall) {
                wallMaterial = new THREE.MeshStandardMaterial({
                    map: roomData.textures.wall,
                    roughness: 0.9,
                    metalness: 0.1
                });
            } else {
                console.warn("No wall texture available for indoor room.");
                wallMaterial = new THREE.MeshStandardMaterial({ color: 0xA0A0A0, roughness: 1.0 });
            }
            const wallGeometry = new THREE.BoxGeometry(this.tileSize, wallHeight, 0.1);
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

        this.worldObjects.add(this.currentRoomObjects);

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
        this.clearSkyObjects(); 

        if (this.scene.background instanceof THREE.Texture) {
            this.scene.background.dispose();
        }
        if (this.scene.environment instanceof THREE.Texture) {
            if (this.scene.environment !== this.scene.background) {
                this.scene.environment.dispose();
            }
        }
        this.scene.background = null;
        this.scene.environment = null;
    }

    clearSkyObjects() {
        if (this.skyObjects) {
            this.skyObjects.traverse(child => {
                if (child instanceof THREE.Mesh) {
                    child.geometry?.dispose();
                    if (child.material && child.material.map !== this.cloudTexture) {
                        child.material.map?.dispose();
                    }
                    child.material?.dispose();
                }
            });
            while(this.skyObjects.children.length > 0){
                this.skyObjects.remove(this.skyObjects.children[0]);
            }
        }
    }

    createClouds() {
        this.clearSkyObjects(); 

        if (!this.cloudTexture) {
            console.warn("Cannot create clouds, texture not loaded.");
            return;
        }

        const cloudCount = 15; 
        const cloudMaterial = new THREE.MeshBasicMaterial({
            map: this.cloudTexture,
            transparent: true,
            opacity: 0.85, 
            depthWrite: false, 
            side: THREE.DoubleSide, 
        });

        const cloudBaseHeight = 80; 
        const cloudHeightVariance = 20;
        const cloudSpread = this.tileSize * 2.5; 

        for (let i = 0; i < cloudCount; i++) {
            const cloudSize = Math.random() * 30 + 20; 
            const cloudGeometry = new THREE.PlaneGeometry(cloudSize, cloudSize * (Math.random() * 0.3 + 0.85)); 

            const cloudMesh = new THREE.Mesh(cloudGeometry, cloudMaterial);

            cloudMesh.position.set(
                (Math.random() - 0.5) * cloudSpread,
                cloudBaseHeight + (Math.random() - 0.5) * cloudHeightVariance,
                (Math.random() - 0.5) * cloudSpread
            );

            cloudMesh.rotation.x = Math.random() * 0.1 - 0.05; 
            cloudMesh.rotation.y = Math.random() * Math.PI * 2;
            cloudMesh.rotation.z = Math.random() * 0.1 - 0.05; 

            this.skyObjects.add(cloudMesh);
        }
        console.log(`Created ${cloudCount} cloud objects.`);
    }

    showLoading() {
        this.loadingScreen.style.display = 'flex';
    }

    hideLoading() {
        this.loadingScreen.style.display = 'none';
    }

    update(playerPosition) {
        const cloudDriftSpeed = 0.05;
        if (this.skyObjects && this.skyObjects.children.length > 0 && window.game?.playerController?.clock) {
            const delta = window.game.playerController.clock.getDelta();
            this.skyObjects.children.forEach(cloud => {
                cloud.position.x += cloudDriftSpeed * delta;
                const wrapLimit = this.tileSize * 1.5;
                if (cloud.position.x > wrapLimit) {
                    cloud.position.x -= wrapLimit * 2;
                }
            });
        }

        if (window.game && window.game.minimap) {
            window.game.minimap.update(playerPosition);
        }
    }

    addRoomToCollection(roomData) {
        const textureUrls = {
            floor: roomData.textures.floor?.image?.src || null,
            wall: roomData.textures.wall?.image?.src || null,
            ceiling: roomData.textures.ceiling?.image?.src || null,
            sky: roomData.textures.sky?.image?.src || null
        };

        if (roomData.textures.floor) roomData.textures.floor.dispose();
        if (roomData.textures.wall) roomData.textures.wall.dispose();
        if (roomData.textures.ceiling) roomData.textures.ceiling.dispose();

        const roomRecord = {
            id: Date.now() + Math.random(),
            name: roomData.prompt.substring(0, 30) + '...' || `Room ${this.rooms.length + 1}`, 
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
        if (window.game && window.game.uiManager) {
            window.game.uiManager.showNotification('Rooms exported.', 'info');
        }
    }

    async importRoomsFromJSON(jsonData) {
        let importSuccessful = false;
        this.showLoading(); 
        try {
            const importedRooms = JSON.parse(jsonData);
            if (!Array.isArray(importedRooms)) {
                throw new Error("Invalid rooms data: expected an array");
            }

            let validRooms = 0;
            importedRooms.forEach((room, index) => {
                if (room.id && room.prompt && room.type && room.textureUrls) {
                    validRooms++;
                } else {
                    console.warn(`Room at index ${index} is missing required properties. Skipping.`);
                }
            });

            if (validRooms === 0 && importedRooms.length > 0) {
                throw new Error("No valid rooms found in the imported file.");
            }

            this.rooms = importedRooms.filter(room => room.id && room.prompt && room.type && room.textureUrls); 
            this.currentRoomIndex = -1; 

            this.clearCurrentRoom();
            this.scene.background = this.defaultIndoorBg; 

            if (window.game && window.game.uiManager) {
                window.game.uiManager.updateRoomGallery(this.rooms, this.currentRoomIndex);
                window.game.uiManager.showNotification(`Imported ${this.rooms.length} rooms. Select one from the gallery to load.`, 'info');
            }

            importSuccessful = true;

        } catch (error) {
            console.error("Failed to import rooms data:", error);
            if (window.game && window.game.uiManager) {
                window.game.uiManager.showNotification(`Import failed: ${error.message}`, 'error');
            }
        } finally {
            this.hideLoading(); 
            return importSuccessful; 
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

        const roomToLoad = this.rooms[index];
        console.log(`Teleporting to room ${index}: ${roomToLoad.name} (${roomToLoad.type})`);

        this.showLoading();
        this.clearCurrentRoom(); 

        try {
            if (roomToLoad.type === 'outdoor' && !this.cloudTexture) {
                this.cloudTexture = await this.roomGenerator.generateCloudTexture();
            }

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
                const startPos = new THREE.Vector3(0, window.game.playerController.playerHeight, 5);
                window.game.playerController.resetPosition(startPos);
            }

            if (window.game && window.game.uiManager) {
                window.game.uiManager.updateRoomGallery(this.rooms, this.currentRoomIndex);
                window.game.uiManager.showNotification(`Teleported to ${roomToLoad.name || `Room ${index + 1}`}.`, 'info');
            }

        } catch (error) {
            console.error("Error teleporting to room:", error);
            this.clearCurrentRoom();
            this.scene.background = this.defaultOutdoorBg; 
            this.scene.environment = null;
            this.currentRoomIndex = -1; 

            if (window.game && window.game.uiManager) {
                window.game.uiManager.updateRoomGallery(this.rooms, this.currentRoomIndex);
                window.game.uiManager.showNotification('Teleport failed: Error loading room data or textures.', 'error');
            }
        } finally {
            this.hideLoading();
        }
    }

    loadTextureFromUrl(url, isSkybox = false) {
        return new Promise((resolve, reject) => {
            if (!url) {
                console.warn(`Tried to load texture from null URL (isSkybox: ${isSkybox})`);
                resolve(null); 
                return;
            }
            const textureLoader = new THREE.TextureLoader();
            textureLoader.load(
                url,
                (texture) => {
                    if (isSkybox) {
                        texture.mapping = THREE.EquirectangularReflectionMapping;
                    } else { 
                        texture.wrapS = THREE.RepeatWrapping;
                        texture.wrapT = THREE.RepeatWrapping;
                        const textureScale = 2; 
                        const repeatValue = this.tileSize / textureScale;
                        texture.repeat.set(repeatValue, repeatValue);
                    }
                    texture.needsUpdate = true; 
                    resolve(texture); 
                },
                undefined, 
                (error) => {
                    console.error(`Failed to load texture from URL: ${url}`, error);
                    reject(new Error(`Failed to load texture: ${url}`)); 
                }
            );
        });
    }

    async loadNewDebugRoom(prompt, type = 'outdoor') {
        await this.loadNewArea(prompt, type);
    }
}