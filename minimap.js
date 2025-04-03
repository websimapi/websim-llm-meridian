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
        this.minZoom = 0.5; // Minimum zoom out
        this.maxZoom = 10.0; // Increased maximum zoom in
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
            this.patternNeedsUpdate = true; // Resize might affect pattern rendering/scale perception
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
        this.mapScale = Math.min(this.maxZoom, this.mapScale * 1.25); // Slightly faster zoom in
        this.patternNeedsUpdate = true; // Pattern transform depends on scale
        console.log("Zoom In, new scale:", this.mapScale.toFixed(2));
    }

    zoomOut() {
        this.mapScale = Math.max(this.minZoom, this.mapScale / 1.25); // Slightly faster zoom out
        this.patternNeedsUpdate = true; // Pattern transform depends on scale
        console.log("Zoom Out, new scale:", this.mapScale.toFixed(2));
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
                    this.drawFallbackBounds(playerPosition, centerX, centerY, '#555'); // Indicate missing texture visually
                } else {
                    if (!this.texturePattern || this.patternNeedsUpdate) {
                        // Recreate pattern if needed
                        this.texturePattern = this.ctx.createPattern(textureImage, 'repeat');

                        if (this.texturePattern) {
                            // Calculate the scale needed for the pattern to match world units
                            const patternScaleX = (tileSize / this.textureRepeat.x * this.mapScale) / textureImage.width;
                            const patternScaleY = (tileSize / this.textureRepeat.y * this.mapScale) / textureImage.height;

                            // Create an SVGMatrix/DOMMatrix for the transformation
                            const matrix = new DOMMatrix();
                            matrix.scaleSelf(patternScaleX, patternScaleY); // Apply scaling

                            // Apply the transformation to the pattern
                            this.texturePattern.setTransform(matrix);
                            this.patternNeedsUpdate = false; // Reset flag only if pattern creation and transform setting succeed
                            // console.log(`Minimap pattern created/updated. Texture repeats: ${this.textureRepeat.x},${this.textureRepeat.y}. Pattern scale: ${patternScaleX.toFixed(3)}, ${patternScaleY.toFixed(3)}`);
                        } else {
                             console.error("Failed to create canvas pattern.");
                             this.texturePattern = null; // Ensure pattern is null if creation failed
                             this.drawFallbackBounds(playerPosition, centerX, centerY, '#444'); // Darker error color
                        }
                    }
                }

                if (this.texturePattern) {
                    this.ctx.save();
                    // Center the view on the player's position
                    this.ctx.translate(centerX, centerY);

                    // --- Translate *before* scaling pattern fill ---
                    // This aligns the pattern relative to the player's position in the world.
                    this.ctx.translate(-playerPosition.x * this.mapScale, -playerPosition.z * this.mapScale);

                    this.ctx.fillStyle = this.texturePattern;

                     // Align pattern origin (0,0) with world origin (0,0) which corresponds to
                     // the center of the floor plane in this setup (PlaneGeometry centered by default).
                     // Since the context is already translated by (-playerPos * scale), we just need to
                     // ensure the fill covers the visible area.

                    // Fill a large rectangle covering the minimap area, centered around the player position.
                    // The rectangle needs to be larger than the minimap canvas to ensure coverage when zoomed/panned.
                    const drawSize = Math.max(this.minimapCanvas.width, this.minimapCanvas.height) / this.mapScale * 1.5; // Larger draw area in world units

                    this.ctx.fillRect(
                         playerPosition.x - drawSize / 2, // Centered on player x
                         playerPosition.z - drawSize / 2, // Centered on player z
                         drawSize, // Width in world units
                         drawSize  // Height in world units
                     );

                     // --- DEBUG: Draw World Origin Marker ---
                     // this.ctx.fillStyle = 'red';
                     // this.ctx.beginPath();
                     // this.ctx.arc(0, 0, 5 / this.mapScale, 0, Math.PI * 2); // Small red dot at (0,0) world coords
                     // this.ctx.fill();
                     // --- END DEBUG ---


                    this.ctx.restore();
                }
                // Note: If pattern creation fails or texture is invalid, the fallback bounds might be drawn below

            } catch (error) {
                console.error("Error drawing minimap texture:", error);
                this.texturePattern = null; // Invalidate pattern on error
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
             child => child instanceof THREE.Mesh &&
                      child.geometry instanceof THREE.PlaneGeometry &&
                      Math.abs(child.rotation.x - (-Math.PI / 2)) < 0.01 // More robust rotation check
        );

        const newTexture = floorMesh?.material?.map || null;
        const newRepeat = floorMesh?.material?.map?.repeat || new THREE.Vector2(1, 1);

        // Check if texture itself or its repeat value has changed
        if (newTexture !== this.floorTexture || !newRepeat.equals(this.textureRepeat)) {
            // console.log("Minimap floor texture source or repeat changed.");
            this.floorTexture = newTexture;
            this.patternNeedsUpdate = true; // Signal that pattern needs recreation
            this.texturePattern = null; // Clear old pattern immediately

            // Store the repeat value from the texture
             this.textureRepeat.copy(newRepeat);
             // console.log("Minimap updated texture repeat:", this.textureRepeat.x, this.textureRepeat.y);

        }
    }
}