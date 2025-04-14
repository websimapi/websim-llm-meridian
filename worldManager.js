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
        this.navigationHistory = []; // Track room navigation history
        
        // Return beam setup
        this.returnBeam = this.createReturnBeam();
        this.scene.add(this.returnBeam);
        this.returnBeam.visible = false;

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
            this.scene.background = this.defaultOutdoorBg; // Set a fallback background
            // Potentially show an error to the user
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
            
            // Add current room to navigation history if we have a valid current index
            if (this.currentRoomIndex > -1) {
                this.navigationHistory.push(this.currentRoomIndex);
            }
            
            // Update return beam visibility
            this.updateReturnBeam();
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
    
    async loadNewAreaFromObject(prompt, type = 'outdoor', sourceObject) {
        console.log(`Loading new area from object interaction: ${prompt}, Type: ${type}`);
        this.showLoading();
        this.clearCurrentRoom();

        try {
            // Enhanced prompt to make the connection with the source object clearer
            const enhancedPrompt = `${prompt}. This area is connected to the ${sourceObject.name} from the previous location.`;
            
            const newRoomData = await this.roomGenerator.generateRoomData(enhancedPrompt, type);
            
            // Store the source object that led to this room
            newRoomData.sourceObject = {
                id: sourceObject.id,
                name: sourceObject.name,
                description: sourceObject.description
            };
            
            this.buildRoom(newRoomData);
            
            // Add current room to navigation history before changing to new room
            if (this.currentRoomIndex > -1) {
                this.navigationHistory.push(this.currentRoomIndex);
            }
            
            this.addRoomToCollection(newRoomData);
            
            // Update return beam visibility
            this.updateReturnBeam();
            
            // Notify user of successful transition
            if (window.game && window.game.uiManager) {
                window.game.uiManager.showNotification(`You've traveled to: ${sourceObject.name}`, 'info', 4000);
            }
        } catch (error) {
            console.error("Error generating new area from object:", error);
            this.scene.background = type === 'indoor' ? this.defaultIndoorBg : this.defaultOutdoorBg;
            
            if (window.game && window.game.uiManager) {
                window.game.uiManager.showNotification("Failed to generate the new location.", 'error');
            }
        } finally {
            this.hideLoading();
        }
    }
    
    navigateToPreviousRoom() {
        if (this.navigationHistory.length === 0) {
            console.log("No previous room to navigate to");
            if (window.game && window.game.uiManager) {
                window.game.uiManager.showNotification("This is the starting point.", 'info');
            }
            return;
        }
        
        const previousRoomIndex = this.navigationHistory.pop();
        console.log(`Navigating back to room index: ${previousRoomIndex}`);
        
        // Use existing teleport functionality to go back
        this.teleportToRoom(previousRoomIndex);
        
        // Update return beam visibility after navigation
        this.updateReturnBeam();
        
        // Show notification about returning
        if (window.game && window.game.uiManager) {
            window.game.uiManager.showNotification("Returned to previous location", 'info');
        }
    }
    
    updateReturnBeam() {
        // Show return beam only if we have navigation history
        this.returnBeam.visible = this.navigationHistory.length > 0;
        
        if (this.returnBeam.visible) {
            // Position the beam in a visible location in the current room
            this.returnBeam.position.set(0, 5, -this.tileSize/4); // Positioned toward the back of the room
            
            // Make it gently pulse/hover
            this.returnBeam.userData.animationPhase = 0;
        }
    }
    
    createReturnBeam() {
        const group = new THREE.Group();
        
        // Light cylinder
        const cylinderGeometry = new THREE.CylinderGeometry(0.5, 2, 10, 16, 1, true);
        const cylinderMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffcc,
            transparent: true,
            opacity: 0.6,
            side: THREE.DoubleSide
        });
        const cylinder = new THREE.Mesh(cylinderGeometry, cylinderMaterial);
        cylinder.position.y = 5; // Center vertically
        group.add(cylinder);
        
        // Base glow
        const baseGeometry = new THREE.CircleGeometry(3, 32);
        const baseMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffdd,
            transparent: true,
            opacity: 0.4,
            side: THREE.DoubleSide
        });
        const base = new THREE.Mesh(baseGeometry, baseMaterial);
        base.rotation.x = -Math.PI / 2; // Lay flat
        base.position.y = 0.1; // Slightly above ground
        group.add(base);
        
        // Particles/sparkles (using points)
        const particlesGeometry = new THREE.BufferGeometry();
        const particleCount = 100;
        const positions = new Float32Array(particleCount * 3);
        
        for (let i = 0; i < particleCount; i++) {
            // Random positions around and inside the beam
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.random() * 2;
            const height = Math.random() * 10;
            
            positions[i * 3] = Math.cos(angle) * radius;
            positions[i * 3 + 1] = height;
            positions[i * 3 + 2] = Math.sin(angle) * radius;
        }
        
        particlesGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        
        const particlesMaterial = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 0.2,
            transparent: true,
            opacity: 0.8
        });
        
        const particles = new THREE.Points(particlesGeometry, particlesMaterial);
        group.add(particles);
        
        // Add text label about interaction
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 128;
        const context = canvas.getContext('2d');
        
        context.fillStyle = 'rgba(0, 0, 0, 0.8)';
        context.fillRect(0, 0, canvas.width, canvas.height);
        
        context.font = 'bold 24px Arial';
        context.textAlign = 'center';
        context.fillStyle = 'white';
        context.fillText('Return to', canvas.width/2, 40);
        context.fillText('Previous Room', canvas.width/2, 80);
        context.fillText('(Press E)', canvas.width/2, 110);
        
        const labelTexture = new THREE.CanvasTexture(canvas);
        const labelMaterial = new THREE.MeshBasicMaterial({
            map: labelTexture,
            transparent: true,
            opacity: 0.9,
            side: THREE.DoubleSide
        });
        
        const labelGeometry = new THREE.PlaneGeometry(5, 2.5);
        const label = new THREE.Mesh(labelGeometry, labelMaterial);
        label.position.set(0, 6, 0); // Position above the beam
        
        group.add(label);
        
        // Set up animation data
        group.userData = {
            animationPhase: 0,
            originalY: 5 // Original height for the center of the beam
        };
        
        return group;
    }
    
    animateReturnBeam(deltaTime) {
        if (!this.returnBeam.visible) return;
        
        // Update animation phase
        this.returnBeam.userData.animationPhase += deltaTime * 2; // Speed control
        
        // Gentle hovering motion
        const hoverOffset = Math.sin(this.returnBeam.userData.animationPhase) * 0.3;
        this.returnBeam.position.y = hoverOffset;
        
        // Make the beam slowly rotate
        this.returnBeam.rotation.y += deltaTime * 0.5;
        
        // Make sure the label always faces the camera
        if (window.game && window.game.camera) {
            // Find the label (last child)
            const label = this.returnBeam.children[this.returnBeam.children.length - 1];
            if (label) {
                // Make label face the camera
                label.lookAt(window.game.camera.position);
            }
        }
    }

    buildRoom(roomData) {
        this.currentRoomObjects = new THREE.Group(); // Group for objects of this specific room

        // Set background first
        if (roomData.type === 'outdoor') {
             if (roomData.textures.sky) {
                // The texture should already have Equirectangular mapping set by RoomGenerator
                this.scene.background = roomData.textures.sky;
                
                // Initialize object highlighter with detected objects
                if (window.game && window.game.objectHighlighter && roomData.objects) {
                    window.game.objectHighlighter.setObjects(roomData.objects);
                }
             } else {
                this.scene.background = this.defaultOutdoorBg; // Fallback blue sky
                
                // No objects to highlight
                if (window.game && window.game.objectHighlighter) {
                    window.game.objectHighlighter.setObjects([]);
                }
             }
        } else { // Indoor
            this.scene.background = this.defaultIndoorBg; // Dark background
            
            // Indoor rooms don't have panoramic highlighting yet
            if (window.game && window.game.objectHighlighter) {
                window.game.objectHighlighter.setObjects([]);
            }
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
        
        // Update return beam after building room
        this.updateReturnBeam();
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

        // Clear any highlighted objects
        if (window.game && window.game.objectHighlighter) {
            window.game.objectHighlighter.setObjects([]);
        }
    }

    showLoading() {
        this.loadingScreen.style.display = 'flex';
    }

    hideLoading() {
        this.loadingScreen.style.display = 'none';
    }

    update(playerPosition, deltaTime) {
        // Placeholder for logic to trigger loading new areas when player moves
        // Example: Check if player is near the edge of the current tile/room
        const currentTileX = Math.floor(playerPosition.x / this.tileSize);
        const currentTileZ = Math.floor(playerPosition.z / this.tileSize);

        // Update minimap if it exists
        if (window.game && window.game.minimap) {
            window.game.minimap.update(playerPosition);
        }
        
        // Animate return beam
        if (deltaTime !== undefined) {
            this.animateReturnBeam(deltaTime);
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
            objects: roomData.objects,
            sourceObject: roomData.sourceObject // Store the object that led to this room, if any
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

     // Debug function to trigger loading
    async loadNewDebugRoom(prompt, type = 'outdoor') {
        await this.loadNewArea(prompt, type);
    }
}