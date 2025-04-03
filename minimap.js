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
        this.mapScale = 1.5;
        this.minZoom = 0.5;
        this.maxZoom = 4.0;
        this.playerMarkerSize = 4; // Slightly larger marker
        this.playerDirectionLength = 12; // Slightly longer direction indicator

        this.floorTexture = null;
        this.patternNeedsUpdate = true;
        this.texturePattern = null;

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
            this.patternNeedsUpdate = true; // Pattern might need adjusting if size changes
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
        this.mapScale = Math.min(this.maxZoom, this.mapScale * 1.2);
        console.log("Zoom In, new scale:", this.mapScale);
    }

    zoomOut() {
        this.mapScale = Math.max(this.minZoom, this.mapScale / 1.2);
        console.log("Zoom Out, new scale:", this.mapScale);
    }

    update(playerPosition) {
        this.updateCanvasSize(); // Ensure canvas resolution is up-to-date

        const canvasWidth = this.minimapCanvas.width;
        const canvasHeight = this.minimapCanvas.height;
        const centerX = canvasWidth / 2;
        const centerY = canvasHeight / 2;

        // Clear canvas
        this.ctx.fillStyle = '#222'; // Dark background
        this.ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        this.updateFloorTexture();

        // Save context state before applying transformations
        this.ctx.save();

        // --- Transformation Setup ---
        // 1. Translate origin to the center of the canvas (where the player marker will be)
        this.ctx.translate(centerX, centerY);
        // 2. Scale the context based on zoom level
        this.ctx.scale(this.mapScale, this.mapScale);
        // 3. Translate the context *inversely* to the player's position.
        //    This makes the player's position the center of the scaled view.
        this.ctx.translate(-playerPosition.x, -playerPosition.z);

        // --- Draw Background/Floor ---
        if (this.floorTexture && this.floorTexture.image && (this.floorTexture.image.complete || this.floorTexture.image instanceof HTMLCanvasElement || this.floorTexture.image instanceof ImageBitmap)) {
            try {
                const textureImage = this.floorTexture.image;
                const tileSize = this.worldManager.tileSize;

                // Check image dimensions before creating pattern
                if (textureImage.width > 0 && textureImage.height > 0) {
                     // Create or update the pattern if needed
                     if (!this.texturePattern || this.patternNeedsUpdate) {
                        this.texturePattern = this.ctx.createPattern(textureImage, 'repeat');
                        this.patternNeedsUpdate = false;
                        console.log("Minimap pattern created/updated.");
                    }

                    // Apply the pattern as fill style
                    this.ctx.fillStyle = this.texturePattern;

                    // --- Align Pattern ---
                    // The pattern needs its own transformation relative to the texture's mapping on the floor.
                    // The THREE.PlaneGeometry is centered at (0,0) and the texture is repeated.
                    // We need to find the effective "origin" of the texture pattern in world space.
                    // Let's assume the texture starts mapping from the corner (-tileSize/2, -tileSize/2).
                    const textureOffsetX = -tileSize / 2;
                    const textureOffsetZ = -tileSize / 2;

                    // The pattern needs to be scaled according to the texture's repeat settings.
                    // This is tricky because the pattern itself doesn't inherently know the repeat scale.
                    // A simpler approach: Draw the pattern in a way that accounts for the texture's size.

                    this.ctx.save(); // Save before applying pattern specific transform

                    // Translate to align pattern origin
                    this.ctx.translate(textureOffsetX, textureOffsetZ);

                    // Calculate the drawing area in the *transformed* coordinate space
                    // We want to fill the rectangle corresponding to the floor area
                     // This rectangle is defined in world coordinates:
                    const worldX = -tileSize / 2;
                    const worldZ = -tileSize / 2;
                    const worldWidth = tileSize;
                    const worldDepth = tileSize;

                    this.ctx.fillRect(worldX, worldZ, worldWidth, worldDepth);

                    this.ctx.restore(); // Restore context after drawing pattern


                } else {
                    // Texture image has no dimensions, draw fallback bounds
                    console.warn("Minimap floor texture image has zero dimensions, drawing fallback.");
                    this.drawFallbackBounds(tileSize, '#555'); // Grey bounds
                    this.texturePattern = null; // Invalidate pattern
                }

            } catch (error) {
                console.error("Error drawing minimap texture:", error);
                const tileSize = this.worldManager.tileSize;
                this.drawFallbackBounds(tileSize, '#444'); // Darker error color
            }
        } else {
            // Draw room bounds outline if texture is unavailable or still loading
            const tileSize = this.worldManager.tileSize;
            this.drawFallbackBounds(tileSize, '#666'); // Standard fallback color
        }


        // Restore context to remove world transformations (scale, player position translation)
        // Now the coordinate system is back to having (0,0) at the canvas center.
        this.ctx.restore();

        // --- Draw Player Marker (always at the center) ---
        this.ctx.fillStyle = '#4CAF50'; // Green marker
        this.ctx.strokeStyle = '#FFFFFF'; // White outline
        this.ctx.lineWidth = 1.5;
        this.ctx.beginPath();
        // Draw a triangle pointing up (representing player view direction)
        const markerHalfWidth = this.playerMarkerSize;
        const markerHeight = this.playerMarkerSize * 1.5;
        this.ctx.moveTo(centerX, centerY - markerHeight / 2); // Top point
        this.ctx.lineTo(centerX - markerHalfWidth, centerY + markerHeight / 2); // Bottom left
        this.ctx.lineTo(centerX + markerHalfWidth, centerY + markerHeight / 2); // Bottom right
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.stroke();


        // --- Draw Player Direction (using player's actual yaw) ---
        if (window.game && window.game.playerController) {
            const playerYaw = window.game.playerController.yawObject.rotation.y;

             // Calculate endpoint based on yaw.
             // In the minimap's top-down view:
             // - Positive Z in world -> Negative Y on map (down)
             // - Positive X in world -> Positive X on map (right)
             // Camera looks along negative Z axis when yaw is 0.
             // So, direction line should point 'up' (negative Y) on map when yaw is 0.
            const dirX = Math.sin(playerYaw); // Correct: Yaw increases counter-clockwise from -Z axis
            const dirY = -Math.cos(playerYaw); // Correct: Y points down map, Cos gives Z component

            const endX = centerX + dirX * this.playerDirectionLength;
            const endY = centerY + dirY * this.playerDirectionLength; // Add because dirY is likely negative for forward

            this.ctx.strokeStyle = '#FFEB3B'; // Yellow line for contrast
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            // Start slightly offset from center marker
            const startX = centerX + dirX * (markerHeight / 2);
            const startY = centerY + dirY * (markerHeight / 2);
            this.ctx.moveTo(startX, startY);
            this.ctx.lineTo(endX, endY);
            this.ctx.stroke();
        }
    }

    // Helper to draw fallback room bounds in the *transformed* context
    // This ensures the bounds are positioned correctly relative to the player center
    drawFallbackBounds(tileSize, color = '#666') {
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 1 / this.mapScale; // Adjust line width based on zoom
        const halfSize = tileSize / 2;
        this.ctx.strokeRect(-halfSize, -halfSize, tileSize, tileSize);
    }

    updateFloorTexture() {
        const worldManager = window.game?.worldManager;
        // Check if currentRoomObjects exists and has children
        if (!worldManager || !worldManager.currentRoomObjects || worldManager.currentRoomObjects.children.length === 0) {
            if (this.floorTexture !== null) {
                this.patternNeedsUpdate = true;
                this.floorTexture = null;
                this.texturePattern = null; // Clear pattern too
            }
            return;
        }

        // Find the floor mesh more robustly
        const floorMesh = worldManager.currentRoomObjects.children.find(
            child => child instanceof THREE.Mesh &&
                     child.geometry instanceof THREE.PlaneGeometry && // Check geometry type
                     Math.abs(child.rotation.x - (-Math.PI / 2)) < 0.01 // Check rotation
        );

        const newTexture = floorMesh?.material?.map || null;

        if (newTexture !== this.floorTexture) {
            console.log("Minimap floor texture source changed.");
            this.floorTexture = newTexture;
            // If the texture image is already loaded, mark pattern for update
            if (this.floorTexture && this.floorTexture.image && (this.floorTexture.image.complete || this.floorTexture.image instanceof HTMLCanvasElement || this.floorTexture.image instanceof ImageBitmap)) {
                 this.patternNeedsUpdate = true;
                 this.texturePattern = null; // Clear old pattern immediately
                 console.log("Texture seems loaded, marking pattern for update.");
            } else if (this.floorTexture) {
                // Texture exists but image might not be loaded yet. Wait for onload.
                // Add an onload listener if it doesn't exist.
                 const textureImage = this.floorTexture.image;
                if (textureImage && textureImage instanceof HTMLImageElement && !textureImage.onload) {
                    console.log("Adding onload listener to minimap texture image.");
                    textureImage.onload = () => {
                        console.log("Minimap texture image loaded via onload.");
                        this.patternNeedsUpdate = true;
                        this.texturePattern = null;
                        // Force an update in the next frame maybe? Or rely on the regular update loop.
                    };
                } else {
                     this.patternNeedsUpdate = true; // Mark anyway, might be Canvas/Bitmap
                     this.texturePattern = null;
                }

            } else {
                // No texture found
                this.patternNeedsUpdate = true;
                this.texturePattern = null;
            }
        }
    }
}