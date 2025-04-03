import * as THREE from 'three';

export class Minimap {
    constructor(worldManager) {
        this.worldManager = worldManager;
        this.minimapContainer = document.createElement('div');
        this.minimapContainer.id = 'minimap-container';
        document.body.appendChild(this.minimapContainer);
        
        this.minimapCanvas = document.createElement('canvas');
        this.minimapCanvas.id = 'minimap-canvas';
        this.minimapCanvas.width = 150;
        this.minimapCanvas.height = 150;
        this.minimapContainer.appendChild(this.minimapCanvas);
        
        this.ctx = this.minimapCanvas.getContext('2d');
        this.mapScale = 0.1; // Scale factor between world and minimap
        
        this.initStyles();
    }
    
    initStyles() {
        const style = document.createElement('style');
        style.textContent = `
            #minimap-container {
                position: absolute;
                top: 20px;
                right: 20px;
                width: 150px;
                height: 150px;
                background-color: rgba(40, 40, 40, 0.7);
                border: 2px solid rgba(100, 100, 100, 0.8);
                border-radius: 5px;
                z-index: 1000;
                overflow: hidden;
            }
            
            #minimap-canvas {
                width: 100%;
                height: 100%;
            }
        `;
        document.head.appendChild(style);
    }
    
    update(playerPosition) {
        // Clear the canvas
        this.ctx.fillStyle = '#222';
        this.ctx.fillRect(0, 0, this.minimapCanvas.width, this.minimapCanvas.height);
        
        // Draw the room boundaries
        this.ctx.strokeStyle = '#666';
        this.ctx.lineWidth = 2;
        
        const roomSize = this.worldManager.tileSize * this.mapScale;
        const centerX = this.minimapCanvas.width / 2;
        const centerY = this.minimapCanvas.height / 2;
        
        // Calculate room position relative to player
        const roomX = centerX - (playerPosition.x * this.mapScale);
        const roomZ = centerY - (playerPosition.z * this.mapScale);
        
        // Draw room boundary
        const halfRoomSize = roomSize / 2;
        this.ctx.strokeRect(
            roomX - halfRoomSize, 
            roomZ - halfRoomSize, 
            roomSize, 
            roomSize
        );
        
        // Draw player indicator (as a dot)
        this.ctx.fillStyle = '#4CAF50';
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, 5, 0, Math.PI * 2);
        this.ctx.fill();
        
        // Draw player direction indicator
        if (window.game && window.game.playerController) {
            const direction = window.game.playerController.yawObject.rotation.y;
            this.ctx.strokeStyle = '#4CAF50';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.moveTo(centerX, centerY);
            this.ctx.lineTo(
                centerX + Math.sin(direction) * 15,
                centerY + Math.cos(direction) * 15
            );
            this.ctx.stroke();
        }
    }
}