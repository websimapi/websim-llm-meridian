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
        this.playerMarkerSize = 3;
        this.playerDirectionLength = 10;

        this.floorTexture = null;
        this.textureRepeat = new THREE.Vector2(1, 1); // Store texture repeat value
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
        this.patternNeedsUpdate = true; // Pattern transform depends on scale
        console.log("Zoom In, new scale:", this.mapScale);
    }

    zoomOut() {
        this.mapScale = Math.max(this.minZoom, this.mapScale / 1.2);
        this.patternNeedsUpdate = true; // Pattern transform depends on scale
        console.log("Zoom Out, new scale:", this.mapScale);
    }

    update(playerPosition) {
        this.updateCanvasSize(); // Ensure canvas resolution is up-to-date

        const centerX = this.minimapCanvas.width / 2;
        const centerY = this.minimapCanvas.height / 2;

        this.ctx.fillStyle = '#222';
        this.ctx.fillRect(0, 0, this.minimapCanvas.width, this.minimapCanvas.height);

        this.updateFloorTexture();

        if (this.floorTexture && this.floorTexture.image && (this.floorTexture.image.complete || this.floorTexture.image instanceof HTMLCanvasElement || this.floorTexture.image instanceof ImageBitmap)) {
            try {
                const textureImage = this.floorTexture.image;
                const tileSize = this.worldManager.tileSize;

                // Check image dimensions before creating pattern
                if (textureImage.width === 0 || textureImage.height === 0) {
                    console.warn("Minimap floor texture image has zero dimensions, skipping draw.");
                    this.texturePattern = null; // Ensure pattern is invalidated
                } else {
                    if (!this.texturePattern || this.patternNeedsUpdate) {
                        // Recreate pattern if needed
                        this.texturePattern = this.ctx.createPattern(textureImage, 'repeat');

                        if (this.texturePattern) {
                            // Calculate the scale needed for the pattern to match world units
                            // One repetition of the texture covers (tileSize / repeat) world units.
                            // This should correspond to textureImage.width pixels in the pattern source.
                            // We want to scale the pattern so textureImage.width maps to the correct size *on the canvas*.
                            // The size on canvas is (tileSize / repeat) * mapScale pixels.
                            const patternScaleX = (tileSize / this.textureRepeat.x * this.mapScale) / textureImage.width;
                            const patternScaleY = (tileSize / this.textureRepeat.y * this.mapScale) / textureImage.height;

                            // Create an SVGMatrix for the transformation
                            const matrix = new DOMMatrix();
                            matrix.scaleSelf(patternScaleX, patternScaleY); // Apply scaling

                            // Apply the transformation to the pattern
                            this.texturePattern.setTransform(matrix);
                            this.patternNeedsUpdate = false;
                            console.log(`Minimap pattern created/updated. Texture repeats: ${this.textureRepeat.x},${this.textureRepeat.y}. Pattern scale: ${patternScaleX.toFixed(3)}, ${patternScaleY.toFixed(3)}`);
                        } else {
                             console.error("Failed to create canvas pattern.");
                        }
                    }
                }

                if (this.texturePattern) {
                    this.ctx.save();
                    // Center the view on the player's position
                    this.ctx.translate(centerX, centerY);

                    // --- IMPORTANT: Translate *before* scaling ---
                    // We want the player's world coordinates (playerX, playerZ) to map to (0,0) in this translated space.
                    this.ctx.translate(-playerPosition.x * this.mapScale, -playerPosition.z * this.mapScale);

                    this.ctx.fillStyle = this.texturePattern;

                    // --- Pattern Alignment (Origin) ---
                    // The pattern's origin (0,0) needs to align with the world's origin (0,0)
                    // or more accurately, the corner of the floor plane (-tileSize/2, -tileSize/2).
                    // Our current transform has player pos at the center. We need to shift the fill relative to this.
                    const tileSize = this.worldManager.tileSize;

                    // We translate the context fill origin to align the pattern correctly
                    this.ctx.translate(-tileSize/2 * this.mapScale, -tileSize/2 * this.mapScale);

                    // Fill a large rectangle covering the minimap area, adjusted for the translated origin
                    const fillWidth = this.minimapCanvas.width;
                    const fillHeight = this.minimapCanvas.height;
                    const drawSize = Math.max(fillWidth, fillHeight) * 1.5; // Extra buffer

                    this.ctx.fillRect(
                        -fillWidth/2 - drawSize/2 + tileSize/2 * this.mapScale, 
                        -fillHeight/2 - drawSize/2 + tileSize/2 * this.mapScale,
                        drawSize,
                        drawSize
                    );

                    this.ctx.restore();
                } else {
                    // Fallback grey rect if no pattern
                    this.drawFallbackBounds(playerPosition, centerX, centerY);
                }

            } catch (error) {
                console.error("Error drawing minimap texture:", error);
                this.drawFallbackBounds(playerPosition, centerX, centerY, '#444'); // Darker error color
            }
        } else {
            // Draw room bounds outline if texture is unavailable or still loading
            this.drawFallbackBounds(playerPosition, centerX, centerY);
        }

        // Draw Player Marker (always at the center of the canvas)
        this.ctx.fillStyle = '#4CAF50'; // Green marker
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, this.playerMarkerSize, 0, Math.PI * 2);
        this.ctx.fill();

        // Draw Player Direction Line
        if (window.game && window.game.playerController) {
            const playerYaw = window.game.playerController.yawObject.rotation.y;

            // Direction line points opposite to camera look direction in top-down view
            const endX = centerX - Math.sin(playerYaw) * this.playerDirectionLength;
            const endY = centerY - Math.cos(playerYaw) * this.playerDirectionLength;

            this.ctx.strokeStyle = '#4CAF50'; // Green line
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.moveTo(centerX, centerY);
            this.ctx.lineTo(endX, endY);
            this.ctx.stroke();
        }
    }

    // Helper to draw fallback room bounds centered on player
    drawFallbackBounds(playerPosition, centerX, centerY, color = '#666') {
        this.ctx.save();
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 1;

        // Translate to center, scale, translate by negative player pos
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
        if (!worldManager || !worldManager.currentRoomObjects) {
            if (this.floorTexture !== null) {
                this.patternNeedsUpdate = true;
                this.floorTexture = null;
                this.texturePattern = null; // Clear pattern too
                this.textureRepeat.set(1, 1); // Reset repeat
            }
            return;
        }

        const floorMesh = worldManager.currentRoomObjects.children.find(
            // Find the mesh used for the floor
             child => child instanceof THREE.Mesh &&
                      child.geometry instanceof THREE.PlaneGeometry &&
                      child.rotation.x === -Math.PI / 2 // Check rotation to be sure it's the floor
        );

        const newTexture = floorMesh?.material?.map || null;

        if (newTexture !== this.floorTexture) {
            console.log("Minimap floor texture source changed.");
            this.floorTexture = newTexture;
            this.patternNeedsUpdate = true; // Signal that pattern needs recreation
            this.texturePattern = null; // Clear old pattern immediately

            // Store the repeat value from the texture
            if (this.floorTexture && this.floorTexture.repeat) {
                this.textureRepeat.copy(this.floorTexture.repeat);
                 console.log("Minimap updated texture repeat:", this.textureRepeat.x, this.textureRepeat.y);
            } else {
                this.textureRepeat.set(1, 1); // Default if no texture or repeat property
            }
        }
    }
}