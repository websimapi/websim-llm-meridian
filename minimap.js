import * as THREE from 'three';

export class Minimap {
    constructor(worldManager, renderer) { 
        this.worldManager = worldManager;
        this.renderer = renderer; 
        this.minimapContainer = document.getElementById('minimap-container');
        if (!this.minimapContainer) {
            console.warn("Minimap container not found, creating one.");
            this.minimapContainer = document.createElement('div');
            this.minimapContainer.id = 'minimap-container';
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
        this.updateCanvasSize();

        this.ctx = this.minimapCanvas.getContext('2d');
        this.mapScale = 1.5; 
        this.minZoom = 0.5;
        this.maxZoom = 5.0; 
        this.playerMarkerSize = 4; 
        this.playerDirectionLength = 12; 

        this.floorTexture = null;
        this.patternNeedsUpdate = true;
        this.texturePattern = null;

        this.initControls();
    }

    updateCanvasSize() {
        const currentWidth = this.minimapContainer.clientWidth; 
        const currentHeight = this.minimapContainer.clientHeight;
        const width = currentWidth > 0 ? currentWidth : 160;
        const height = currentHeight > 0 ? currentHeight : 160;

        if (this.minimapCanvas.width !== width || this.minimapCanvas.height !== height) {
            this.minimapCanvas.width = width;
            this.minimapCanvas.height = height;
            console.log(`Minimap canvas internal size set to ${width}x${height}`);
            this.patternNeedsUpdate = true; 
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
        this.mapScale = Math.min(this.maxZoom, this.mapScale * 1.3); 
        console.log("Zoom In, new scale:", this.mapScale.toFixed(2));
    }

    zoomOut() {
        this.mapScale = Math.max(this.minZoom, this.mapScale / 1.3); 
        console.log("Zoom Out, new scale:", this.mapScale.toFixed(2));
    }

    update(playerPosition) {
        this.updateCanvasSize(); 

        const canvasWidth = this.minimapCanvas.width;
        const canvasHeight = this.minimapCanvas.height;
        const centerX = canvasWidth / 2;
        const centerY = canvasHeight / 2;

        this.ctx.fillStyle = '#282828'; 
        this.ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        this.updateFloorTexture();

        this.ctx.save();
        this.ctx.translate(centerX, centerY);
        this.ctx.scale(this.mapScale, this.mapScale);
        this.ctx.translate(-playerPosition.x, -playerPosition.z);

        if (this.floorTexture && this.floorTexture.image && (this.floorTexture.image.complete || this.floorTexture.image instanceof HTMLCanvasElement || this.floorTexture.image instanceof ImageBitmap)) {
            try {
                const textureImage = this.floorTexture.image;
                const tileSize = this.worldManager.tileSize; 

                if (!this.texturePattern || this.patternNeedsUpdate) {
                    if (textureImage.width > 0 && textureImage.height > 0) {
                        this.texturePattern = this.ctx.createPattern(textureImage, 'repeat');
                        this.patternNeedsUpdate = false;
                        console.log("Minimap pattern created/updated.");
                    } else {
                        this.texturePattern = null; 
                    }
                }

                if (this.texturePattern) {
                    this.ctx.fillStyle = this.texturePattern;

                    const textureRepeatX = this.floorTexture.repeat.x; 
                    const textureRepeatY = this.floorTexture.repeat.y;
                    const textureWorldWidth = tileSize;
                    const textureWorldHeight = tileSize;
                    const singleTexturePixelWidth = textureWorldWidth / textureRepeatX / textureImage.width;
                    const singleTexturePixelHeight = textureWorldHeight / textureRepeatY / textureImage.height;

                    const patternScaleMatrix = new DOMMatrix();
                    patternScaleMatrix.scaleSelf(singleTexturePixelWidth, singleTexturePixelHeight);

                    this.texturePattern.setTransform(patternScaleMatrix);

                    const halfSize = tileSize / 2;
                    this.ctx.fillRect(-halfSize, -halfSize, tileSize, tileSize);
                } else {
                    this.drawFallbackBounds(tileSize, '#555');
                }

            } catch (error) {
                console.error("Error drawing minimap texture:", error);
                this.drawFallbackBounds(this.worldManager.tileSize, '#444'); 
            }
        } else {
            this.drawFallbackBounds(this.worldManager.tileSize, '#666');
        }

        this.ctx.restore(); 

        this.ctx.fillStyle = 'rgba(76, 175, 80, 1)'; 
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)'; 
        this.ctx.lineWidth = 1.5;
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, this.playerMarkerSize, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.stroke();

        if (window.game && window.game.playerController) {
            const playerYaw = window.game.playerController.yawObject.rotation.y;

            const endX = centerX - Math.sin(playerYaw) * this.playerDirectionLength;
            const endY = centerY - Math.cos(playerYaw) * this.playerDirectionLength; 

            this.ctx.strokeStyle = 'rgba(76, 175, 80, 1)'; 
            this.ctx.lineWidth = 2.5; 
            this.ctx.beginPath();
            this.ctx.moveTo(centerX, centerY);
            this.ctx.lineTo(endX, endY);
            this.ctx.stroke();
        }
    }

    drawFallbackBounds(tileSize, color = '#666') {
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 1 / this.mapScale; 
        const halfSize = tileSize / 2;
        this.ctx.strokeRect(-halfSize, -halfSize, tileSize, tileSize);
    }

    updateFloorTexture() {
        const worldManager = window.game?.worldManager;
        if (!worldManager || !worldManager.currentRoomObjects) {
            if (this.floorTexture !== null) {
                this.patternNeedsUpdate = true;
                this.floorTexture = null;
                this.texturePattern = null; 
            }
            return;
        }

        const floorMesh = worldManager.currentRoomObjects.children.find(
            child => child instanceof THREE.Mesh && child.geometry instanceof THREE.PlaneGeometry && Math.abs(child.rotation.x + Math.PI / 2) < 0.01
        );

        const newTexture = floorMesh?.material?.map || null;

        if (newTexture !== this.floorTexture) {
            console.log("Minimap floor texture source changed.", newTexture);
            this.floorTexture = newTexture;
            this.patternNeedsUpdate = true; 
            this.texturePattern = null; 
        }
    }
}