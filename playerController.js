import * as THREE from 'three';

export class PlayerController {
    constructor(camera, scene, worldManager, uiManager) {
        this.camera = camera;
        this.scene = scene;
        this.worldManager = worldManager;
        this.uiManager = uiManager;

        this.velocity = new THREE.Vector3();
        this.moveSpeed = 10.0;
        this.lookSpeed = 0.002;

        this.moveForward = false;
        this.moveBackward = false;
        this.moveLeft = false;
        this.moveRight = false;
        this.moveUp = false;
        this.moveDown = false;

        this.pitchObject = new THREE.Object3D();
        this.pitchObject.add(camera);

        this.yawObject = new THREE.Object3D();
        this.yawObject.add(this.pitchObject);
        this.scene.add(this.yawObject);

        this.clock = new THREE.Clock();
        
        // For object interaction
        this.raycaster = new THREE.Raycaster();
        this.interactionDistance = 5; // How far objects can be interacted with

        this.initEventListeners();
        this.resetPosition();
    }

    initEventListeners() {
        document.addEventListener('mousemove', this.onMouseMove.bind(this), false);
        document.addEventListener('keydown', this.onKeyDown.bind(this), false);
        document.addEventListener('keyup', this.onKeyUp.bind(this), false);
        document.getElementById('game-canvas').addEventListener('click', (event) => {
            // For uninterrupted clicks on objects, only lock if not already locked and not clicking an interactive highlight
            if (!document.pointerLockElement && !event.target.closest('.object-highlight.interactive')) {
                this.lockPointer();
            } 
            // Object interactions handled by ObjectHighlighter
        });
        document.addEventListener('pointerlockchange', this.onPointerLockChange.bind(this), false);
    }

    lockPointer() {
        document.body.requestPointerLock();
    }

    onPointerLockChange() {
        if (document.pointerLockElement !== document.body) {
            console.log("Pointer unlocked");
        } else {
            console.log("Pointer locked");
        }
    }

    onMouseMove(event) {
        if (document.pointerLockElement === document.body) {
            const movementX = event.movementX || event.mozMovementX || event.webkitMovementX || 0;
            const movementY = event.movementY || event.mozMovementY || event.webkitMovementY || 0;

            this.yawObject.rotation.y -= movementX * this.lookSpeed;
            this.pitchObject.rotation.x -= movementY * this.lookSpeed;

            this.pitchObject.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.pitchObject.rotation.x));
        }
    }

    onKeyDown(event) {
        switch (event.code) {
            case 'ArrowUp':
            case 'KeyW': this.moveForward = true; break;
            case 'ArrowLeft':
            case 'KeyA': this.moveLeft = true; break;
            case 'ArrowDown':
            case 'KeyS': this.moveBackward = true; break;
            case 'ArrowRight':
            case 'KeyD': this.moveRight = true; break;
            case 'Space': this.moveUp = true; break;
            case 'ShiftLeft':
            case 'KeyC': this.moveDown = true; break;
        }
    }

    onKeyUp(event) {
        switch (event.code) {
            case 'ArrowUp':
            case 'KeyW': this.moveForward = false; break;
            case 'ArrowLeft':
            case 'KeyA': this.moveLeft = false; break;
            case 'ArrowDown':
            case 'KeyS': this.moveBackward = false; break;
            case 'ArrowRight':
            case 'KeyD': this.moveRight = false; break;
            case 'Space': this.moveUp = false; break;
            case 'ShiftLeft':
            case 'KeyC': this.moveDown = false; break;
        }
    }

    update(delta) {
        this.velocity.x = 0;
        this.velocity.y = 0;
        this.velocity.z = 0;

        if (this.moveForward) this.velocity.z -= 1;
        if (this.moveBackward) this.velocity.z += 1;
        if (this.moveLeft) this.velocity.x -= 1;
        if (this.moveRight) this.velocity.x += 1;
        if (this.moveUp) this.velocity.y += 1;
        if (this.moveDown) this.velocity.y -= 1;

        this.velocity.normalize().multiplyScalar(this.moveSpeed * delta);

        this.yawObject.translateX(this.velocity.x);
        this.yawObject.translateZ(this.velocity.z);
        this.yawObject.position.y += this.velocity.y;

        const halfSize = this.worldManager.tileSize / 2 - 0.5;
        this.yawObject.position.x = Math.max(-halfSize, Math.min(halfSize, this.yawObject.position.x));
        this.yawObject.position.z = Math.max(-halfSize, Math.min(halfSize, this.yawObject.position.z));

        const playerHeight = 1.6;
        if (this.yawObject.position.y < playerHeight) {
            this.yawObject.position.y = playerHeight;
        }
        
        // Check if player is near the return beam
        if (this.worldManager.returnBeam && this.worldManager.returnBeam.visible) {
            const distance = this.yawObject.position.distanceTo(this.worldManager.returnBeam.position);
            if (distance < 8) { // If player is within 8 units of the beam
                // Optionally show a hint about the 'E' key to use the beam
                if (window.game && window.game.uiManager) {
                    // Possibly add a UI hint here about the 'E' key
                }
            }
        }
    }

    getPlayerPosition() {
        return this.yawObject.position;
    }

    resetPosition(position = new THREE.Vector3(0, 1.6, 5)) {
        this.yawObject.position.copy(position);
        this.yawObject.rotation.y = 0;
        this.pitchObject.rotation.x = 0;
        this.velocity.set(0, 0, 0);
        this.moveForward = this.moveBackward = this.moveLeft = this.moveRight = this.moveUp = this.moveDown = false;
        console.log("Player position reset to", position);
    }
}