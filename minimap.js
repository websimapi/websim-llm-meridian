import * as THREE from 'three';

export class Minimap {
    constructor(worldManager) {
        this.worldManager = worldManager;
        this.minimapContainer = document.getElementById('minimap-container'); 
        if (!this.minimapContainer) {
            console.warn("Minimap container not found, creating one.");
            this.minimapContainer = document.createElement('div');
            this.minimapContainer.id = 'minimap-container';
            document.body.appendChild(this.minimapContainer);
        }

        this.minimapCanvas = document.getElementById('minimap-canvas'); 
        if (!this.minimapCanvas) {
            console.warn("Minimap canvas not found, creating one.");
            this.minimapCanvas = document.createElement('canvas');
            this.minimapCanvas.id = 'minimap-canvas';
            this.minimapCanvas.width = 160; 
            this.minimapCanvas.height = 160; 
            this.minimapContainer.appendChild(this.minimapCanvas);
        }

        this.ctx = this.minimapCanvas.getContext('2d');
        this.mapScale = 1.5; 
        this.playerMarkerSize = 3; 
        this.playerDirectionLength = 10; 

    }

    update(playerPosition) {
        const centerX = this.minimapCanvas.width / 2;
        const centerY = this.minimapCanvas.height / 2;

        this.ctx.fillStyle = '#222'; 
        this.ctx.fillRect(0, 0, this.minimapCanvas.width, this.minimapCanvas.height);

        this.ctx.strokeStyle = '#666'; 
        this.ctx.lineWidth = 1; 

        const roomWidthOnMap = this.worldManager.tileSize * this.mapScale;
        const roomDepthOnMap = this.worldManager.tileSize * this.mapScale;

        const roomCenterXOnMap = centerX - playerPosition.x * this.mapScale;
        const roomCenterZOnMap = centerY - playerPosition.z * this.mapScale; 

        const roomRectX = roomCenterXOnMap - roomWidthOnMap / 2;
        const roomRectY = roomCenterZOnMap - roomDepthOnMap / 2; 

        this.ctx.strokeRect(roomRectX, roomRectY, roomWidthOnMap, roomDepthOnMap);

        this.ctx.fillStyle = '#4CAF50'; 
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, this.playerMarkerSize, 0, Math.PI * 2);
        this.ctx.fill();

        if (window.game && window.game.playerController) {
            const playerYaw = window.game.playerController.yawObject.rotation.y;

            const endX = centerX + Math.sin(playerYaw) * this.playerDirectionLength;
            const endY = centerY - Math.cos(playerYaw) * this.playerDirectionLength; 

            this.ctx.strokeStyle = '#4CAF50'; 
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.moveTo(centerX, centerY);
            this.ctx.lineTo(endX, endY);
            this.ctx.stroke();
        }

    }
}