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
        console.log("Zoom In, new scale:", this.mapScale);
    }

    zoomOut() {
        this.mapScale = Math.max(this.minZoom, this.mapScale / 1.2);
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
                const repeatX = this.floorTexture.repeat.x;
                const repeatY = this.floorTexture.repeat.y;

                // Check image dimensions before creating pattern
                if (textureImage.width === 0 || textureImage.height === 0) {
                    // Skip texture drawing if image has no dimensions yet (e.g., still loading)
                    console.warn("Minimap floor texture image has zero dimensions, skipping draw.");
                    this.texturePattern = null; // Ensure pattern is invalidated
                } else if (!this.texturePattern || this.patternNeedsUpdate) {
                    this.texturePattern = this.ctx.createPattern(textureImage, 'repeat');
                    this.patternNeedsUpdate = false;
                    console.log("Minimap pattern created/updated.");
                }

                if (this.texturePattern) {
                    this.ctx.save();
                    this.ctx.translate(centerX, centerY);
                    this.ctx.scale(this.mapScale, this.mapScale);
                    this.ctx.translate(-playerPosition.x, -playerPosition.z);

                    this.ctx.fillStyle = this.texturePattern;

                    // --- Simpler Pattern Alignment ---
                    // Instead of complex matrix, translate the context *before* filling
                    // This aligns the pattern's origin relative to the world space
                    // Calculate offset based on texture repeat and tile size
                    const texOffsetX = (0.5 * tileSize); // Adjust based on how texture maps to plane
                    const texOffsetZ = (0.5 * tileSize);
                    this.ctx.translate(-texOffsetX, -texOffsetZ); // Shift origin to match world corner

                    // Fill a large rectangle centered around the player's view
                    // This ensures the pattern covers the entire minimap area
                    const drawSize = Math.max(this.minimapCanvas.width, this.minimapCanvas.height) / this.mapScale * 1.5; // Draw larger than needed
                    this.ctx.fillRect(
                        playerPosition.x - drawSize / 2 + texOffsetX, // Center fill rect on player, adjusted by offset
                        playerPosition.z - drawSize / 2 + texOffsetZ,
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

        // Draw Player Marker (always at the center)
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

    // Helper to draw fallback room bounds
    drawFallbackBounds(playerPosition, centerX, centerY, color = '#666') {
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 1;
        const roomWidthOnMap = this.worldManager.tileSize * this.mapScale;
        const roomDepthOnMap = this.worldManager.tileSize * this.mapScale;
        // Calculate top-left corner based on centering the room relative to player position
        const roomRectX = centerX - (playerPosition.x * this.mapScale) - roomWidthOnMap / 2;
        const roomRectY = centerY - (playerPosition.z * this.mapScale) - roomDepthOnMap / 2;
        this.ctx.strokeRect(roomRectX, roomRectY, roomWidthOnMap, roomDepthOnMap);
    }

    updateFloorTexture() {
        const worldManager = window.game?.worldManager;
        if (!worldManager || !worldManager.currentRoomObjects) {
            if (this.floorTexture !== null) {
                this.patternNeedsUpdate = true;
                this.floorTexture = null;
                this.texturePattern = null; // Clear pattern too
            }
            return;
        }

        const floorMesh = worldManager.currentRoomObjects.children.find(
            child => child instanceof THREE.Mesh && child.geometry instanceof THREE.PlaneGeometry && child.receiveShadow // Be more specific if needed
        );

        const newTexture = floorMesh?.material?.map || null;

        if (newTexture !== this.floorTexture) {
            console.log("Minimap floor texture source changed.");
            this.floorTexture = newTexture;
            this.patternNeedsUpdate = true; // Signal that pattern needs recreation
            this.texturePattern = null; // Clear old pattern immediately
        }
    }
}