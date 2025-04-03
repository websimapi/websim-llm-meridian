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
        this.rooms = []; // Store all generated rooms data
        this.currentRoomIndex = -1; // Track the currently active room
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
            objects: roomData.objects || [] // Ensure objects array exists
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

    async generateSceneObject(description) {
        if (this.currentRoomIndex < 0) {
            console.error("No active room to add object to");
            return;
        }

        this.showLoading();
        try {
            // Use LLM to get object details
            const objectPrompt = `Create a simple 3D object based on this description: "${description}". Return JSON with properties: 
            {
              "type": "simple type name (like chair, table, crystal)",
              "description": "short visual description",
              "dimensions": {"width": number, "height": number, "depth": number},
              "color": "hex color code that fits the object",
              "position": {"x": number, "y": number, "z": number},
              "rotation": {"x": number, "y": number, "z": number}
            }
            Use reasonable dimensions and position values for a room space that's ${this.tileSize}x${this.tileSize} units. Position y=0 is the floor level.`;

            const completion = await websim.chat.completions.create({
                messages: [{ role: "user", content: objectPrompt }],
                json: true,
            });

            const objectData = JSON.parse(completion.content);
            
            // Validate the object data
            if (!objectData.type || !objectData.dimensions || !objectData.color || !objectData.position) {
                throw new Error("Invalid object data returned from LLM");
            }

            // Add object to current room's data
            const currentRoom = this.rooms[this.currentRoomIndex];
            if (!currentRoom.objects) {
                currentRoom.objects = [];
            }
            
            // Add object with unique ID and creation timestamp
            const newObject = {
                ...objectData,
                id: Date.now(), // Unique ID for the object
                createdAt: new Date().toISOString()
            };
            
            currentRoom.objects.push(newObject);
            
            // Create and add 3D object to the scene
            this.createObject3D(newObject);
            
            // Show success message
            if (window.game && window.game.uiManager) {
                window.game.uiManager.showNotification(`Created ${objectData.type}`);
            }
            
        } catch (error) {
            console.error("Error generating object:", error);
            if (window.game && window.game.uiManager) {
                window.game.uiManager.showNotification("Failed to generate object", "error");
            }
        } finally {
            this.hideLoading();
        }
    }

    createObject3D(objectData) {
        // Determine which geometry to use based on object type
        let geometry;
        const dims = objectData.dimensions;
        
        // Simple shape selection based on object type
        // Could be expanded to use more complex geometries
        if (objectData.type.includes('ball') || objectData.type.includes('sphere')) {
            const radius = Math.max(dims.width, dims.height, dims.depth) / 2;
            geometry = new THREE.SphereGeometry(radius, 32, 32);
        } else if (objectData.type.includes('cylinder') || objectData.type.includes('pillar')) {
            const radius = Math.max(dims.width, dims.depth) / 2;
            geometry = new THREE.CylinderGeometry(radius, radius, dims.height, 32);
        } else {
            // Default to box for most objects (table, chair, etc)
            geometry = new THREE.BoxGeometry(dims.width, dims.height, dims.depth);
        }
        
        // Create material
        const material = new THREE.MeshStandardMaterial({ 
            color: objectData.color,
            roughness: 0.7,
            metalness: 0.2
        });
        
        // Create mesh and position it
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(
            objectData.position.x,
            objectData.position.y + (dims.height / 2), // Adjust Y to account for object height
            objectData.position.z
        );
        
        // Apply rotation if specified
        if (objectData.rotation) {
            mesh.rotation.set(
                THREE.MathUtils.degToRad(objectData.rotation.x || 0),
                THREE.MathUtils.degToRad(objectData.rotation.y || 0),
                THREE.MathUtils.degToRad(objectData.rotation.z || 0)
            );
        }
        
        // Store object ID in the mesh for potential future manipulation
        mesh.userData.objectId = objectData.id;
        
        // Add to world objects group
        this.worldObjects.add(mesh);
        
        return mesh;
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
            
            // Recreate any objects in the room
            if (roomToLoad.objects && roomToLoad.objects.length > 0) {
                roomToLoad.objects.forEach(objectData => {
                    this.createObject3D(objectData);
                });
            }
            
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