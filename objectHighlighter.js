import * as THREE from 'three';

export class ObjectHighlighter {
    constructor(camera, scene) {
        this.camera = camera;
        this.scene = scene;
        this.detectedObjects = [];
        this.currentlyLooking = null;
        this.highlightElement = null;
        this.infoPanel = null;
        this.raycaster = new THREE.Raycaster();
        this.lastUpdateTime = 0;
        this.updateInterval = 100; // Only check for objects every 100ms for performance
        this.objectMarkers = new THREE.Group();
        this.scene.add(this.objectMarkers);
        
        // Track click state
        this.isObjectInteractable = true;
        this.isPointerDown = false;
        
        // Track marker visibility
        this.markersVisible = true;
        
        this.initUI();
        this.initInteractions();
    }

    setObjects(objects) {
        // Clear previous objects and markers
        this.detectedObjects = objects || [];
        this.objectMarkers.clear();
        
        if (!objects || objects.length === 0) {
            this.hideInfoPanel();
            return;
        }
        
        // Create debug markers for each object (optional - can be toggled)
        // These are small spheres placed in the direction of each object
        this.createObjectMarkers();
        
        console.log(`Object highlighter set with ${objects.length} objects`);
    }
    
    createObjectMarkers() {
        // This creates visual markers for debugging
        // It can be toggled off in production
        
        const radius = 200; // Distance from camera for placing markers
        
        this.detectedObjects.forEach(obj => {
            // Convert spherical coordinates to cartesian
            const phi = THREE.MathUtils.degToRad(obj.position.direction);
            const theta = THREE.MathUtils.degToRad(90 - obj.position.elevation);
            
            // Calculate position on sphere
            const x = radius * Math.sin(theta) * Math.sin(phi);
            const y = radius * Math.cos(theta);
            const z = radius * Math.sin(theta) * Math.cos(phi);
            
            // Create marker
            const geometry = new THREE.TorusGeometry(getMarkerScale(obj.position.size) * 0.8, 0.5, 8, 24);
            const material = new THREE.MeshBasicMaterial({ 
                color: 0xff0000,
                transparent: true,
                opacity: 0.7,
                depthTest: false
            });
            const marker = new THREE.Mesh(geometry, material);
            marker.position.set(x, y, z);
            marker.userData.objectId = obj.id;
            marker.userData.objectName = obj.name;
            marker.scale.setScalar(getMarkerScale(obj.position.size));
            
            // Make marker always face the camera
            marker.lookAt(0, 0, 0);
            
            // Add text label above marker
            this.addMarkerLabel(marker, obj.name, obj.position.size);
            
            this.objectMarkers.add(marker);
        });
        
        // Helper function for scale based on size
        function getMarkerScale(size) {
            switch(size.toLowerCase()) {
                case 'large': return 5;
                case 'medium': return 3;
                case 'small': return 2;
                default: return 3;
            }
        }
    }
    
    addMarkerLabel(marker, text, size) {
        // Create canvas for the text
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        
        // Setup text style
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'white';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, canvas.width/2, canvas.height/2);
        
        // Create texture and material
        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            depthTest: false,
            side: THREE.DoubleSide
        });
        
        // Create plane for label
        const labelGeometry = new THREE.PlaneGeometry(10, 2.5);
        const label = new THREE.Mesh(labelGeometry, material);
        
        // Position label above marker
        let offsetY = getMarkerScale(size) * 1.2;
        label.position.set(0, offsetY, 0);
        
        // Make label face the camera
        label.lookAt(0, 0, 0);
        
        // Add label as child of marker
        marker.add(label);
        
        // Helper function for scale based on size
        function getMarkerScale(size) {
            switch(size.toLowerCase()) {
                case 'large': return 5;
                case 'medium': return 3;
                case 'small': return 2;
                default: return 3;
            }
        }
    }

    update() {
        const now = Date.now();
        if (now - this.lastUpdateTime < this.updateInterval) return;
        this.lastUpdateTime = now;
        
        if (this.detectedObjects.length === 0) return;
        
        // Update orientation of all markers to face camera
        this.objectMarkers.children.forEach(marker => {
            if (marker.children.length > 0) {
                // Make the ring face the camera
                marker.lookAt(this.camera.position);
                
                // Make the label face the camera (should already be facing origin)
                // But ensure it's readable by aligning with camera up vector
                const label = marker.children[0];
                if (label) {
                    label.lookAt(this.camera.position);
                    // Align with camera up vector
                    label.up.copy(this.camera.up);
                }
            }
        });
        
        // Get camera direction vector
        const cameraDirection = new THREE.Vector3(0, 0, -1);
        cameraDirection.applyQuaternion(this.camera.quaternion);
        
        // Find the object that best matches the direction
        let bestMatch = null;
        let bestMatchScore = 0;
        const minMatchThreshold = 0.9; // Minimum direction match required (0-1)
        
        this.detectedObjects.forEach(obj => {
            // Convert spherical coordinates to direction vector
            const phi = THREE.MathUtils.degToRad(obj.position.direction);
            const theta = THREE.MathUtils.degToRad(90 - obj.position.elevation);
            
            const objDirection = new THREE.Vector3();
            objDirection.setFromSphericalCoords(1, theta, phi);
            
            // Calculate how well the direction matches (dot product)
            const matchScore = cameraDirection.dot(objDirection);
            
            // Check size to adjust match threshold
            let sizeMultiplier = 1;
            if (obj.position.size === 'large') sizeMultiplier = 1.2;
            if (obj.position.size === 'small') sizeMultiplier = 0.8;
            
            if (matchScore > bestMatchScore && matchScore > minMatchThreshold * sizeMultiplier) {
                bestMatch = obj;
                bestMatchScore = matchScore;
            }
        });
        
        // Update highlighting if the best match changed
        if (bestMatch !== this.currentlyLooking) {
            this.currentlyLooking = bestMatch;
            
            if (bestMatch) {
                this.showObjectHighlight(bestMatch);
            } else {
                this.hideObjectHighlight();
            }
        }
    }
    
    showObjectHighlight(object) {
        // Display highlight elements
        if (!this.highlightElement) return;
        
        this.highlightElement.style.display = 'block';
        this.infoPanel.style.display = 'block';
        
        // Update info panel content
        const nameElement = this.infoPanel.querySelector('.object-name');
        const descElement = this.infoPanel.querySelector('.object-description');
        const interactElement = this.infoPanel.querySelector('.object-interact-hint');
        
        if (nameElement) nameElement.textContent = object.name;
        if (descElement) descElement.textContent = object.description;
        if (interactElement) interactElement.textContent = 'Click to explore this area';
        
        // Mark the highlight as interactive
        this.highlightElement.classList.add('interactive');
        
        // Update position in world coordinates
        const radius = 200; // Same radius used for markers
        const phi = THREE.MathUtils.degToRad(object.position.direction);
        const theta = THREE.MathUtils.degToRad(90 - object.position.elevation);
        
        // Calculate position
        const x = radius * Math.sin(theta) * Math.sin(phi);
        const y = radius * Math.cos(theta);
        const z = radius * Math.sin(theta) * Math.cos(phi);
        
        // Project 3D position to screen coordinates
        const position = new THREE.Vector3(x, y, z);
        const screenPosition = this.worldToScreen(position);
        
        // Center the highlight on the object
        if (screenPosition) {
            // Adjust highlight size based on object size
            let size;
            switch (object.position.size.toLowerCase()) {
                case 'large': size = 200; break;
                case 'medium': size = 150; break;
                case 'small': size = 100; break;
                default: size = 150;
            }
            
            this.highlightElement.style.width = `${size}px`;
            this.highlightElement.style.height = `${size}px`;
            this.highlightElement.style.left = `${screenPosition.x - size/2}px`;
            this.highlightElement.style.top = `${screenPosition.y - size/2}px`;
            
            // Add destination label to highlight
            this.highlightElement.setAttribute('data-label', object.name);
            
            // Position info panel near highlight but ensure it stays on screen
            const panelWidth = 300;
            const panelHeight = 150; // Increased for interact hint
            let panelX = screenPosition.x + size/2 + 20;
            let panelY = screenPosition.y - panelHeight/2;
            
            // Keep panel on screen
            if (panelX + panelWidth > window.innerWidth) {
                panelX = screenPosition.x - size/2 - panelWidth - 20;
            }
            if (panelY < 0) panelY = 10;
            if (panelY + panelHeight > window.innerHeight) {
                panelY = window.innerHeight - panelHeight - 10;
            }
            
            this.infoPanel.style.left = `${panelX}px`;
            this.infoPanel.style.top = `${panelY}px`;
        }
    }
    
    hideObjectHighlight() {
        if (this.highlightElement) {
            this.highlightElement.style.display = 'none';
            this.highlightElement.classList.remove('interactive');
        }
        this.hideInfoPanel();
    }
    
    hideInfoPanel() {
        if (this.infoPanel) this.infoPanel.style.display = 'none';
    }
    
    worldToScreen(worldPosition) {
        // Convert 3D position to screen coordinates
        const vector = worldPosition.clone();
        vector.project(this.camera);
        
        const x = (vector.x + 1) / 2 * window.innerWidth;
        const y = -(vector.y - 1) / 2 * window.innerHeight;
        
        // Check if position is in front of camera
        if (vector.z > 1) return null;
        
        return { x, y };
    }
    
    initUI() {
        // Create highlight element
        this.highlightElement = document.createElement('div');
        this.highlightElement.className = 'object-highlight';
        document.body.appendChild(this.highlightElement);
        
        // Create info panel
        this.infoPanel = document.createElement('div');
        this.infoPanel.className = 'object-info-panel';
        
        const nameElement = document.createElement('div');
        nameElement.className = 'object-name';
        
        const descElement = document.createElement('div');
        descElement.className = 'object-description';
        
        const interactElement = document.createElement('div');
        interactElement.className = 'object-interact-hint';
        
        this.infoPanel.appendChild(nameElement);
        this.infoPanel.appendChild(descElement);
        this.infoPanel.appendChild(interactElement);
        document.body.appendChild(this.infoPanel);
        
        // Create highlight controls
        const controlsPanel = document.createElement('div');
        controlsPanel.className = 'object-highlight-controls';
        
        const toggleButton = document.createElement('button');
        toggleButton.textContent = 'Toggle Object Markers';
        toggleButton.onclick = () => this.toggleMarkersVisibility();
        controlsPanel.appendChild(toggleButton);
        
        document.body.appendChild(controlsPanel);
        
        // Initially hide elements
        this.hideObjectHighlight();
    }
    
    initInteractions() {
        // Add click event listener to the game canvas
        const gameCanvas = document.getElementById('game-canvas');
        
        // Mouse down event
        gameCanvas.addEventListener('mousedown', (event) => {
            this.isPointerDown = true;
        });
        
        // Mouse up event with interaction logic
        gameCanvas.addEventListener('mouseup', (event) => {
            if (!this.isPointerDown) return;
            this.isPointerDown = false;
            
            // Only process if we're looking at an object and pointer lock is active
            if (this.currentlyLooking && document.pointerLockElement === document.body) {
                this.handleObjectInteraction(this.currentlyLooking);
            }
        });
        
        // Handle return beam interaction with both E key and mouse click
        document.addEventListener('keydown', (event) => {
            if (event.code === 'KeyE' && window.game?.worldManager?.returnBeam?.visible) {
                this.handleReturnBeamInteraction();
            }
        });
        
        // Add click detection for return beam
        document.addEventListener('click', (event) => {
            // Only if pointer lock is not active (so UI clicks work)
            if (document.pointerLockElement !== document.body) {
                this.checkReturnBeamClick(event);
            }
        });
    }
    
    checkReturnBeamClick(event) {
        if (!window.game?.worldManager?.returnBeam?.visible) return;
        
        // Create a raycaster from mouse position
        const mouse = new THREE.Vector2();
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        
        this.raycaster.setFromCamera(mouse, this.camera);
        
        // Check intersection with return beam
        const intersects = this.raycaster.intersectObject(window.game.worldManager.returnBeam, true);
        
        if (intersects.length > 0) {
            this.handleReturnBeamInteraction();
        }
    }
    
    handleObjectInteraction(object) {
        if (!this.isObjectInteractable) return;
        
        // Generate a new room prompt based on the object's description
        const basePrompt = object.description || object.name;
        const explorationPrompt = `Exploring the ${object.name}: ${basePrompt}`;
        
        console.log(`Interacting with object: ${object.name}`);
        console.log(`New room prompt: ${explorationPrompt}`);
        
        // Start room transition through world manager
        if (window.game && window.game.worldManager) {
            window.game.worldManager.loadNewAreaFromObject(explorationPrompt, 'outdoor', object);
            
            // Temporarily disable interaction to prevent spam clicks
            this.isObjectInteractable = false;
            setTimeout(() => {
                this.isObjectInteractable = true;
            }, 2000);
        }
    }
    
    handleReturnBeamInteraction() {
        if (window.game && window.game.worldManager) {
            window.game.worldManager.navigateToPreviousRoom();
        }
    }
    
    toggleMarkersVisibility(visible) {
        this.markersVisible = visible === undefined ? !this.markersVisible : visible;
        this.objectMarkers.visible = this.markersVisible;
        
        // Notify about state change
        if (window.game?.uiManager) {
            window.game.uiManager.showNotification(`Object markers ${this.markersVisible ? 'visible' : 'hidden'}`);
        }
    }
    
    dispose() {
        // Clean up resources
        if (this.highlightElement && document.body.contains(this.highlightElement)) {
            document.body.removeChild(this.highlightElement);
        }
        
        if (this.infoPanel && document.body.contains(this.infoPanel)) {
            document.body.removeChild(this.infoPanel);
        }
        
        this.scene.remove(this.objectMarkers);
        this.objectMarkers.clear();
    }
}