import * as THREE from 'three';

export class Minimap {
    constructor(worldManager) {
        this.worldManager = worldManager;
        this.minimapContainer = document.getElementById('minimap-container');
        if (!this.minimapContainer) {
            console.warn("Minimap container not found, creating one.");
            this.minimapContainer = document.createElement('div');
            this.minimapContainer.id = 'minimap-container';
            // Apply necessary styles if creating dynamically
            Object.assign(this.minimapContainer.style, {
                position: 'absolute', top: '20px', right: '20px', width: '160px', height: '160px',
                backgroundColor: 'rgba(40, 40, 40, 0.8)', border: '2px solid rgba(100, 100, 100, 0.8)',
                borderRadius: '6px', zIndex: '1000', overflow: 'hidden', boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
                display: 'flex', flexDirection: 'column'
            });
            document.body.appendChild(this.minimapContainer);
        }

        this.minimapCanvas = document.getElementById('minimap-canvas');
        if (!this.minimapCanvas) {
            console.warn("Minimap canvas not found, creating one.");
            this.minimapCanvas = document.createElement('canvas');
            this.minimapCanvas.id = 'minimap-canvas';
            Object.assign(this.minimapCanvas.style, {
                width: '100%', height: '100%', display: 'block', flexGrow: '1'
            });
            this.minimapContainer.appendChild(this.minimapCanvas);
        }
        // Set initial canvas resolution after element is confirmed/created
        this.updateCanvasSize();

        this.ctx = this.minimapCanvas.getContext('2d');
        this.mapScale = 1.5; // Initial zoom level
        this.minZoom = 0.5;
        this.maxZoom = 4.0; // Allow closer zoom
        this.playerMarkerSize = 3;
        this.playerDirectionLength = 10;

        this.floorTexture = null;
        this.textureRepeat = new THREE.Vector2(1, 1); // Store texture repeat value
        this.patternNeedsUpdate = true; // Flag to recreate pattern on texture/scale change
        this.texturePattern = null; // The canvas pattern object

        this.initControls();
    }

    updateCanvasSize() {
        const currentWidth = this.minimapContainer.offsetWidth;
        const currentHeight = this.minimapContainer.offsetHeight;
        const width = currentWidth > 0 ? currentWidth : 160;
        const height = currentHeight > 0 ? currentHeight : 160;

        if (this.minimapCanvas.width !== width || this.minimapCanvas.height !== height) {
            this.minimapCanvas.width = width;
            this.minimapCanvas.height = height;
            console.log(`Minimap canvas resized to ${width}x${height}`);
            this.patternNeedsUpdate = true; // Canvas size change might affect rendering
        }
    }

    initControls() {
        const zoomInButton = document.getElementById('zoom-in');
        const zoomOutButton = document.getElementById('zoom-out');

        if (zoomInButton && zoomOutButton) {
            zoomInButton.addEventListener('click', () => this.zoomIn());
            zoomOutButton.addEventListener('click', () => this.zoomOut());
        } else {
            console.warn("Minimap zoom controls not found.");
            // Optionally create controls dynamically if needed
        }
    }

    zoomIn() {
        this.mapScale = Math.min(this.maxZoom, this.mapScale * 1.25); // Slightly faster zoom
        this.patternNeedsUpdate = true; // Pattern transform depends on scale
        console.log("Zoom In, new scale:", this.mapScale);
    }

    zoomOut() {
        this.mapScale = Math.max(this.minZoom, this.mapScale / 1.25); // Slightly faster zoom
        this.patternNeedsUpdate = true; // Pattern transform depends on scale
        console.log("Zoom Out, new scale:", this.mapScale);
    }

    update(playerPosition) {
        this.updateCanvasSize(); // Ensure canvas resolution is up-to-date

        const canvasWidth = this.minimapCanvas.width;
        const canvasHeight = this.minimapCanvas.height;
        const centerX = canvasWidth / 2;
        const centerY = canvasHeight / 2;

        // Background clear
        this.ctx.fillStyle = '#222'; // Dark background
        this.ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        this.updateFloorTexture(); // Check if floor texture changed

        // Check if texture is valid and loaded
        const textureValid = this.floorTexture && this.floorTexture.image &&
                             (this.floorTexture.image.complete || this.floorTexture.image instanceof HTMLCanvasElement || this.floorTexture.image instanceof ImageBitmap) &&
                             this.floorTexture.image.width > 0 && this.floorTexture.image.height > 0;

        if (textureValid) {
            try {
                const textureImage = this.floorTexture.image;
                const tileSize = this.worldManager.tileSize; // World size of the floor plane

                // Recreate pattern only if texture changed, scale changed, or canvas resized
                if (!this.texturePattern || this.patternNeedsUpdate) {
                    this.texturePattern = this.ctx.createPattern(textureImage, 'repeat');
                    if (!this.texturePattern) {
                        console.error("Failed to create canvas pattern.");
                        this.patternNeedsUpdate = false; // Don't retry constantly if it fails
                    } else {
                        console.log(`Minimap pattern created/updated. Texture repeats: ${this.textureRepeat.x},${this.textureRepeat.y}. Map scale: ${this.mapScale}`);
                        this.patternNeedsUpdate = false; // Reset flag
                    }
                }

                if (this.texturePattern) {
                    this.ctx.save();

                    // 1. Center the view on the canvas center
                    this.ctx.translate(centerX, centerY);

                    // 2. Apply the zoom scale
                    this.ctx.scale(this.mapScale, this.mapScale);

                    // 3. Translate the view based on player position (negative)
                    // This makes the world move under the player marker
                    this.ctx.translate(-playerPosition.x, -playerPosition.z);

                    // --- Apply Pattern Transform ---
                    // Calculate the scaling required for the pattern itself so that
                    // one repetition of the texture drawn on the canvas corresponds
                    // to the correct size in world units.
                    const worldUnitsPerTextureRepeatX = tileSize / this.textureRepeat.x;
                    const worldUnitsPerTextureRepeatY = tileSize / this.textureRepeat.y;

                    // Scale the pattern so that its native size (textureImage.width/height)
                    // maps to the world size it represents.
                    const patternScaleX = worldUnitsPerTextureRepeatX / textureImage.width;
                    const patternScaleY = worldUnitsPerTextureRepeatY / textureImage.height;

                    // Create a matrix for the pattern transformation (Scale only)
                    // The translation is handled by the main context transform
                    const matrix = new DOMMatrix();
                    matrix.scaleSelf(patternScaleX, patternScaleY);
                    this.texturePattern.setTransform(matrix);
                    // -----------------------------

                    this.ctx.fillStyle = this.texturePattern;

                    // Draw the pattern covering the floor area
                    // The floor is centered at (0,0) world coords, size tileSize x tileSize
                    const halfSize = tileSize / 2;
                    // The rectangle is drawn in the world coordinate space (transformed by scale and player pos)
                    this.ctx.fillRect(-halfSize, -halfSize, tileSize, tileSize);

                    this.ctx.restore();
                } else {
                    // Fallback grey rect if pattern failed creation
                     this.drawFallbackBounds(playerPosition, centerX, centerY, '#444');
                }

            } catch (error) {
                console.error("Error drawing minimap texture:", error);
                 this.drawFallbackBounds(playerPosition, centerX, centerY, '#533'); // Error color
            }
        } else {
            // Draw room bounds outline if texture is unavailable or still loading
            this.drawFallbackBounds(playerPosition, centerX, centerY);
        }

        // --- Draw Player Marker and Direction (on top, not affected by world transforms) ---
        this.ctx.save();
        this.ctx.translate(centerX, centerY); // Center coordinates

        // Player Marker (circle)
        this.ctx.fillStyle = '#4CAF50'; // Green marker
        this.ctx.beginPath();
        this.ctx.arc(0, 0, this.playerMarkerSize, 0, Math.PI * 2);
        this.ctx.fill();

        // Player Direction Line (triangle or line)
        if (window.game && window.game.playerController) {
            const playerYaw = window.game.playerController.yawObject.rotation.y;
            // Calculate direction vector based on yaw
            // In 2D top-down, +Z is often down, +X is right. Yaw 0 faces -Z.
            const dirX = Math.sin(playerYaw);
            const dirZ = Math.cos(playerYaw);

             // Draw a triangle pointer
             this.ctx.fillStyle = '#4CAF50';
             this.ctx.beginPath();
             // Tip of the triangle points in the look direction
             const tipX = 0 - dirX * this.playerDirectionLength;
             const tipY = 0 - dirZ * this.playerDirectionLength; // Z maps to Y in 2D canvas
             // Base points perpendicular to look direction
             const baseX1 = 0 + dirZ * (this.playerMarkerSize);
             const baseY1 = 0 - dirX * (this.playerMarkerSize);
             const baseX2 = 0 - dirZ * (this.playerMarkerSize);
             const baseY2 = 0 + dirX * (this.playerMarkerSize);

             this.ctx.moveTo(tipX, tipY);
             this.ctx.lineTo(baseX1, baseY1);
             this.ctx.lineTo(baseX2, baseY2);
             this.ctx.closePath();
             this.ctx.fill();

            // // Alternative: Simple Line
            // const endX = centerX - dirX * this.playerDirectionLength;
            // const endY = centerY - dirZ * this.playerDirectionLength;
            // this.ctx.strokeStyle = '#4CAF50'; // Green line
            // this.ctx.lineWidth = 2;
            // this.ctx.beginPath();
            // this.ctx.moveTo(centerX, centerY);
            // this.ctx.lineTo(endX, endY);
            // this.ctx.stroke();
        }
        this.ctx.restore(); // Restore context after drawing player stuff
    }

    // Helper to draw fallback room bounds centered on player
    drawFallbackBounds(playerPosition, centerX, centerY, color = '#666') {
        this.ctx.save();
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 1;

        // Apply transforms: center, scale, move by player pos
        this.ctx.translate(centerX, centerY);
        this.ctx.scale(this.mapScale, this.mapScale);
        this.ctx.translate(-playerPosition.x, -playerPosition.z);

        // Draw the rectangle representing the tile centered at world origin (0,0)
        const halfSize = this.worldManager.tileSize / 2;
        this.ctx.strokeRect(-halfSize, -halfSize, this.worldManager.tileSize, this.worldManager.tileSize);

        this.ctx.restore();
    }

    updateFloorTexture() {
        const worldManager = window.game?.worldManager;
        // Ensure currentRoomObjects and its children are accessible
        if (!worldManager || !worldManager.currentRoomObjects || !worldManager.currentRoomObjects.children) {
            if (this.floorTexture !== null) {
                 console.log("Minimap clearing floor texture (no room objects).");
                this.patternNeedsUpdate = true;
                this.floorTexture = null;
                this.texturePattern = null;
                this.textureRepeat.set(1, 1);
            }
            return;
        }

        const floorMesh = worldManager.currentRoomObjects.children.find(
             child => child instanceof THREE.Mesh &&
                      child.geometry instanceof THREE.PlaneGeometry &&
                      Math.abs(child.rotation.x - (-Math.PI / 2)) < 0.01 // More robust check for floor rotation
        );

        const newTexture = floorMesh?.material?.map || null;
        const newRepeat = floorMesh?.material?.map?.repeat || new THREE.Vector2(1, 1);

        // Check if texture object itself or its repeat value changed
        if (newTexture !== this.floorTexture || !newRepeat.equals(this.textureRepeat)) {
            console.log("Minimap floor texture source or repeat changed.");
            this.floorTexture = newTexture;
            this.texturePattern = null; // Clear old pattern immediately
            this.patternNeedsUpdate = true; // Signal that pattern needs recreation/transform update

            // Store the repeat value from the texture
            if (this.floorTexture && this.floorTexture.repeat) {
                this.textureRepeat.copy(this.floorTexture.repeat);
            } else {
                this.textureRepeat.set(1, 1); // Default if no texture or repeat property
            }
             console.log("Minimap updated texture repeat:", this.textureRepeat.x, this.textureRepeat.y);
        }
    }
}