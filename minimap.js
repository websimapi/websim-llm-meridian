import * as THREE from 'three';

export class Minimap {
    constructor(worldManager) {
        this.worldManager = worldManager;
        this.minimapContainer = document.createElement('div');
        this.minimapContainer.id = 'minimap-container';
        document.body.appendChild(this.minimapContainer);
        
        this.minimapRenderer = new THREE.WebGLRenderer({ alpha: true });
        this.minimapRenderer.setSize(150, 150);
        this.minimapCamera = new THREE.OrthographicCamera(-25, 25, 25, -25, 0.1, 1000);
        this.minimapCamera.position.set(0, 30, 0);
        this.minimapCamera.lookAt(0, 0, 0);
        this.minimapCamera.rotation.z = Math.PI; // Rotate to match player orientation
        
        this.minimapContainer.appendChild(this.minimapRenderer.domElement);
        
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
        `;
        document.head.appendChild(style);
    }
    
    update(playerPosition) {
        if (!window.game || !window.game.scene) return;
        
        // Update camera position to follow player from above
        this.minimapCamera.position.set(
            playerPosition.x,
            30,
            playerPosition.z
        );
        
        // Draw player indicator as a small sphere
        this.ensurePlayerIndicator();
        this.playerIndicator.position.set(playerPosition.x, 0.5, playerPosition.z);
        
        // Render the scene from above
        this.minimapRenderer.render(window.game.scene, this.minimapCamera);
    }
    
    ensurePlayerIndicator() {
        if (!this.playerIndicator) {
            const geometry = new THREE.SphereGeometry(1, 16, 16);
            const material = new THREE.MeshBasicMaterial({ color: 0x4CAF50 });
            this.playerIndicator = new THREE.Mesh(geometry, material);
            this.playerIndicator.position.y = 0.5; // Just above the floor
            window.game.scene.add(this.playerIndicator);
        }
    }
}