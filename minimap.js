import * as THREE from 'three';

export class Minimap {
    constructor(worldManager) {
        this.worldManager = worldManager;
        this.minimapContainer = document.createElement('div');
        this.minimapContainer.id = 'minimap-container';
        document.body.appendChild(this.minimapContainer);

        this.minimapCanvas = document.createElement('canvas');
        this.minimapCanvas.id = 'minimap-canvas';
        this.minimapCanvas.width = 160; 
        this.minimapCanvas.height = 160;
        this.minimapContainer.appendChild(this.minimapCanvas);

        this.ctx = this.minimapCanvas.getContext('2d');
        this.mapScale = 0.1; 
        this.zoomLevel = 1.0; 
        this.maxZoom = 5.0;
        this.minZoom = 0.2;
        this.zoomStep = 0.1; 

        this.initStyles();
        this.addZoomControls();
    }

    initStyles() {
        const style = document.createElement('style');
        style.textContent = `
            #minimap-container {
                position: absolute;
                top: 20px;
                right: 20px;
                width: 160px;
                height: 160px;
                background-color: rgba(40, 40, 40, 0.8);
                border: 2px solid rgba(100, 100, 100, 0.8);
                border-radius: 6px;
                z-index: 1000;
                overflow: hidden;
                box-shadow: 0 2px 5px rgba(0,0,0,0.2);
                display: flex; 
                justify-content: center;
                align-items: center;
            }

            #minimap-canvas {
                 /* Canvas size is controlled by its width/height attributes */
                /* Let container handle layout */
                display: block;
            }

            .minimap-zoom-controls {
                position: absolute;
                bottom: 5px;
                right: 5px;
                display: flex;
                gap: 3px;
            }

            .minimap-zoom-button {
                background-color: rgba(80, 80, 80, 0.9);
                color: white;
                border: 1px solid rgba(120, 120, 120, 0.7);
                width: 20px;
                height: 20px;
                font-size: 14px;
                font-weight: bold;
                line-height: 18px; 
                text-align: center;
                border-radius: 3px;
                cursor: pointer;
                padding: 0;
                transition: background-color 0.2s;
            }

            .minimap-zoom-button:hover {
                background-color: rgba(100, 100, 100, 0.9);
            }
        `;
        document.head.appendChild(style);
    }

    addZoomControls() {
        const zoomControls = document.createElement('div');
        zoomControls.className = 'minimap-zoom-controls';

        const zoomInButton = document.createElement('button');
        zoomInButton.textContent = '+';
        zoomInButton.className = 'minimap-zoom-button';
        zoomInButton.onclick = () => this.zoomIn();

        const zoomOutButton = document.createElement('button');
        zoomOutButton.textContent = '-';
        zoomOutButton.className = 'minimap-zoom-button';
        zoomOutButton.onclick = () => this.zoomOut();

        zoomControls.appendChild(zoomOutButton);
        zoomControls.appendChild(zoomInButton);
        this.minimapContainer.appendChild(zoomControls);

        this.minimapContainer.addEventListener('wheel', (event) => {
            event.preventDefault(); 
            if (event.deltaY < 0) {
                this.zoomIn();
            } else {
                this.zoomOut();
            }
        }, { passive: false }); 
    }

    zoomIn() {
        this.zoomLevel = Math.min(this.maxZoom, this.zoomLevel + this.zoomStep);
    }

    zoomOut() {
        this.zoomLevel = Math.max(this.minZoom, this.zoomLevel - this.zoomStep);
    }

    update(playerPosition) {
        this.ctx.fillStyle = '#282828'; 
        this.ctx.fillRect(0, 0, this.minimapCanvas.width, this.minimapCanvas.height);

        const centerX = this.minimapCanvas.width / 2;
        const centerY = this.minimapCanvas.height / 2;

        const effectiveScale = this.mapScale * this.zoomLevel;

        this.ctx.save();

        this.ctx.translate(centerX, centerY);
        this.ctx.scale(this.zoomLevel, this.zoomLevel);
        this.ctx.translate(-playerPosition.x * this.mapScale, -playerPosition.z * this.mapScale);

        this.ctx.strokeStyle = '#888'; 
        this.ctx.lineWidth = 1 / this.zoomLevel; 

        const roomSizeWorld = this.worldManager.tileSize;
        const roomSizeMap = roomSizeWorld * this.mapScale;
        const halfRoomSizeMap = roomSizeMap / 2;

        this.ctx.strokeRect(
            -halfRoomSizeMap, 
            -halfRoomSizeMap, 
            roomSizeMap,
            roomSizeMap
        );

        const playerMapX = playerPosition.x * this.mapScale;
        const playerMapZ = playerPosition.z * this.mapScale;

        this.ctx.fillStyle = '#5cb85c'; 
        this.ctx.beginPath();
        const playerDotRadius = 4 / this.zoomLevel;
        this.ctx.arc(playerMapX, playerMapZ, playerDotRadius, 0, Math.PI * 2);
        this.ctx.fill();

        if (window.game && window.game.playerController) {
            const directionRad = window.game.playerController.yawObject.rotation.y; 

            const triangleBaseWidth = 8 / this.zoomLevel;
            const triangleHeight = 12 / this.zoomLevel;

            const tipX = playerMapX + Math.sin(directionRad) * triangleHeight / 2;
            const tipZ = playerMapZ + Math.cos(directionRad) * triangleHeight / 2;

            const baseAngle1 = directionRad + Math.PI / 2;
            const baseAngle2 = directionRad - Math.PI / 2;

            const base1X = playerMapX + Math.sin(baseAngle1) * triangleBaseWidth / 2 - Math.sin(directionRad) * triangleHeight / 2;
            const base1Z = playerMapZ + Math.cos(baseAngle1) * triangleBaseWidth / 2 - Math.cos(directionRad) * triangleHeight / 2;

            const base2X = playerMapX + Math.sin(baseAngle2) * triangleBaseWidth / 2 - Math.sin(directionRad) * triangleHeight / 2;
            const base2Z = playerMapZ + Math.cos(baseAngle2) * triangleBaseWidth / 2 - Math.cos(directionRad) * triangleHeight / 2;

            this.ctx.fillStyle = '#4CAF50'; 
            this.ctx.strokeStyle = '#388E3C'; 
            this.ctx.lineWidth = 0.5 / this.zoomLevel;
            this.ctx.beginPath();
            this.ctx.moveTo(tipX, tipZ);
            this.ctx.lineTo(base1X, base1Z);
            this.ctx.lineTo(base2X, base2Z);
            this.ctx.closePath();
            this.ctx.fill();
            this.ctx.stroke();
        }

        this.ctx.restore(); 

        this.ctx.fillStyle = '#ccc';
        this.ctx.font = `${10}px sans-serif`; 
        this.ctx.textAlign = 'center';
        this.ctx.fillText('N', centerX, 12); 
    }
}