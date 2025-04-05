import * as THREE from 'three';

export class Minimap {
    constructor(worldManager, room) { 
        this.worldManager = worldManager;
        this.room = room; 
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
            this.minimapCanvas.width = 160; 
            this.minimapCanvas.height = 160; 
            Object.assign(this.minimapCanvas.style, {
                width: '100%', height: '100%', display: 'block', flexGrow: '1'
            });
            this.minimapContainer.appendChild(this.minimapCanvas);
        } else {
            this.minimapCanvas.width = this.minimapContainer.offsetWidth > 0 ? this.minimapContainer.offsetWidth : 160;
            this.minimapCanvas.height = this.minimapContainer.offsetHeight > 0 ? this.minimapContainer.offsetHeight : 160;
        }

        this.ctx = this.minimapCanvas.getContext('2d');
        this.mapScale = 1.5; 
        this.minZoom = 0.5; 
        this.maxZoom = 4.0; 
        this.playerMarkerSize = 3;
        this.playerDirectionLength = 10;
        this.otherPlayerMarkerSize = 2.5; 

        this.floorTexture = null; 
        this.patternNeedsUpdate = true; 
        this.texturePattern = null; 

        this.initControls();
    }

    initControls() {
        const zoomInButton = document.getElementById('zoom-in');
        const zoomOutButton = document.getElementById('zoom-out');

        if (zoomInButton && zoomOutButton) {
            zoomInButton.addEventListener('click', () => this.zoomIn());
            zoomOutButton.addEventListener('click', () => this.zoomOut());
        } else {
            console.warn("Minimap zoom controls not found.");
        }
    }

    zoomIn() {
        this.mapScale = Math.min(this.maxZoom, this.mapScale * 1.2);
        if (window.game?.playerController) this.update(window.game.playerController.getPlayerPosition());
    }

    zoomOut() {
        this.mapScale = Math.max(this.minZoom, this.mapScale / 1.2);
        if (window.game?.playerController) this.update(window.game.playerController.getPlayerPosition());
    }

    update(playerPosition) {
        if (!this.ctx || !this.room || !this.room.presence) return; 

        const currentWidth = this.minimapContainer.offsetWidth;
        const currentHeight = this.minimapContainer.offsetHeight;
        if (this.minimapCanvas.width !== currentWidth || this.minimapCanvas.height !== currentHeight) {
            this.minimapCanvas.width = currentWidth > 0 ? currentWidth : 160;
            this.minimapCanvas.height = currentHeight > 0 ? currentHeight : 160;
        }

        const centerX = this.minimapCanvas.width / 2;
        const centerY = this.minimapCanvas.height / 2;

        this.ctx.fillStyle = '#222'; 
        this.ctx.fillRect(0, 0, this.minimapCanvas.width, this.minimapCanvas.height);

        if (this.floorTexture && this.floorTexture.image && (this.floorTexture.image.complete || this.floorTexture.image instanceof HTMLCanvasElement || this.floorTexture.image instanceof ImageBitmap)) {
            try {
                const textureImage = this.floorTexture.image;
                const currentRoomId = this.room.presence[this.room.clientId]?.currentRoomId;
                const roomData = (currentRoomId && this.room.roomState.rooms) ? this.room.roomState.rooms[currentRoomId] : null;
                const roomSize = roomData?.structure?.dimensions?.width || this.worldManager.tileSize || 50;
                const tileSize = roomSize;
                const repeatX = this.floorTexture.repeat.x;
                const repeatY = this.floorTexture.repeat.y;

                if ((!this.texturePattern || this.patternNeedsUpdate) && textureImage.width > 0 && textureImage.height > 0) {
                    this.texturePattern = this.ctx.createPattern(textureImage, 'repeat');
                    this.patternNeedsUpdate = false;
                }

                if (this.texturePattern) {
                    this.ctx.save();
                    this.ctx.translate(centerX, centerY);
                    this.ctx.scale(this.mapScale, this.mapScale);
                    this.ctx.translate(-playerPosition.x, -playerPosition.z);

                    this.ctx.fillStyle = this.texturePattern;

                    try {
                        if (this.texturePattern.setTransform) {
                            const texScaleX = tileSize / repeatX / textureImage.width;
                            const texScaleY = tileSize / repeatY / textureImage.height;
                            const matrix = new DOMMatrix();
                            matrix.scaleSelf(texScaleX, texScaleY);
                            matrix.translateSelf(-tileSize / 2, -tileSize / 2);
                            this.texturePattern.setTransform(matrix);
                        }
                    } catch (e) { console.warn("Error setting pattern transform:", e); }

                    this.ctx.fillRect(-tileSize / 2, -tileSize / 2, tileSize, tileSize);
                    this.ctx.restore();
                } else {
                    this.ctx.save();
                    this.ctx.translate(centerX, centerY);
                    this.ctx.scale(this.mapScale, this.mapScale);
                    this.ctx.translate(-playerPosition.x, -playerPosition.z);
                    this.ctx.fillStyle = '#555';
                    this.ctx.fillRect(-tileSize / 2, -tileSize / 2, tileSize, tileSize);
                    this.ctx.restore();
                }
            } catch (error) {
                console.error("Error drawing minimap texture:", error);
                this.ctx.save();
                this.ctx.translate(centerX, centerY);
                this.ctx.scale(this.mapScale, this.mapScale);
                this.ctx.translate(-playerPosition.x, -playerPosition.z);
                this.ctx.fillStyle = '#444';
                this.ctx.fillRect(-roomSize / 2, -roomSize / 2, roomSize, roomSize);
                this.ctx.restore();
            }
        } else {
            const currentRoomId = this.room.presence[this.room.clientId]?.currentRoomId;
            const roomData = (currentRoomId && this.room.roomState.rooms) ? this.room.roomState.rooms[currentRoomId] : null;
            const roomSize = roomData?.structure?.dimensions?.width || this.worldManager.tileSize || 50;
            this.ctx.strokeStyle = '#666';
            this.ctx.lineWidth = 1;
            this.ctx.save();
            this.ctx.translate(centerX, centerY);
            this.ctx.scale(this.mapScale, this.mapScale);
            this.ctx.translate(-playerPosition.x, -playerPosition.z);
            this.ctx.strokeRect(-roomSize / 2, -roomSize / 2, roomSize, roomSize);
            this.ctx.restore();
        }

        const myClientId = this.room.clientId;
        const myPresence = this.room.presence[myClientId];
        const myRoomId = myPresence?.currentRoomId;

        this.ctx.fillStyle = '#4CAF50'; 
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, this.playerMarkerSize, 0, Math.PI * 2);
        this.ctx.fill();

        if (myPresence?.yaw !== undefined) {
            const playerYaw = myPresence.yaw;
            const endX = centerX - Math.sin(playerYaw) * this.playerDirectionLength;
            const endY = centerY - Math.cos(playerYaw) * this.playerDirectionLength;

            this.ctx.strokeStyle = '#4CAF50'; 
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.moveTo(centerX, centerY);
            this.ctx.lineTo(endX, endY);
            this.ctx.stroke();
        }

        for (const clientId in this.room.presence) {
            if (clientId === myClientId) continue;

            const data = this.room.presence[clientId];
            if (data?.currentRoomId === myRoomId && data.x !== undefined && data.z !== undefined) {
                const relativeX = data.x - playerPosition.x;
                const relativeZ = data.z - playerPosition.z;

                const mapX = centerX + relativeX * this.mapScale;
                const mapY = centerY + relativeZ * this.mapScale;

                const bounds = this.playerMarkerSize * 2; 
                if (mapX > -bounds && mapX < this.minimapCanvas.width + bounds &&
                    mapY > -bounds && mapY < this.minimapCanvas.height + bounds)
                {
                    const peerColor = window.game?.uiManager?.getUserColor(clientId) || '#FFA500'; 
                    this.ctx.fillStyle = peerColor;
                    this.ctx.beginPath();
                    this.ctx.arc(mapX, mapY, this.otherPlayerMarkerSize, 0, Math.PI * 2);
                    this.ctx.fill();

                    if (data.yaw !== undefined) {
                        const otherYaw = data.yaw;
                        const dirEndX = mapX - Math.sin(otherYaw) * (this.playerDirectionLength * 0.8); 
                        const dirEndY = mapY - Math.cos(otherYaw) * (this.playerDirectionLength * 0.8);
                        this.ctx.strokeStyle = peerColor;
                        this.ctx.lineWidth = 1.5;
                        this.ctx.beginPath();
                        this.ctx.moveTo(mapX, mapY);
                        this.ctx.lineTo(dirEndX, dirEndY);
                        this.ctx.stroke();
                    }
                }
            }
        }
    }

    updateFloorTexture() {
        const worldManager = window.game?.worldManager;
        if (!worldManager || !worldManager.currentRoomObjects) {
            if (this.floorTexture !== null) this.patternNeedsUpdate = true;
            this.floorTexture = null;
            return;
        }

        const floorMesh = worldManager.currentRoomObjects.children.find(
            child => child instanceof THREE.Mesh && child.geometry instanceof THREE.PlaneGeometry
        );

        const newTexture = floorMesh?.material?.map || null;

        if (newTexture !== this.floorTexture) {
            console.log("Minimap: Floor texture changed.");
            this.floorTexture = newTexture;
            this.patternNeedsUpdate = true; 
            if(window.game?.playerController) {
                this.update(window.game.playerController.getPlayerPosition());
            }
        } else if (!newTexture && this.floorTexture) {
            console.log("Minimap: Floor texture removed.");
            this.floorTexture = null;
            this.patternNeedsUpdate = true;
            this.texturePattern = null;
            if(window.game?.playerController) {
                this.update(window.game.playerController.getPlayerPosition());
            }
        }
    }
}