import * as THREE from 'three';

export class PlayerController {
    constructor(camera, scene, worldManager) {
        this.camera = camera;
        this.scene = scene;
        this.worldManager = worldManager; // To interact with the world (e.g., trigger zone changes)

        this.velocity = new THREE.Vector3();
        this.moveSpeed = 10.0; // Increased from 5.0 to 10.0 to match larger rooms
        this.lookSpeed = 0.002; // Radians per pixel movement

        this.moveForward = false;
        this.moveBackward = false;
        this.moveLeft = false;
        this.moveRight = false;
        this.moveUp = false; // For potential flying/jumping
        this.moveDown = false;

        this.pitchObject = new THREE.Object3D(); // For looking up/down
        this.pitchObject.add(camera);

        this.yawObject = new THREE.Object3D(); // For looking left/right
        this.yawObject.position.y = 1.6; // Player height
        this.yawObject.add(this.pitchObject);
        this.scene.add(this.yawObject);

        this.clock = new THREE.Clock();

        this.initEventListeners();
    }

    initEventListeners() {
        document.addEventListener('mousemove', this.onMouseMove.bind(this), false);
        document.addEventListener('keydown', this.onKeyDown.bind(this), false);
        document.addEventListener('keyup', this.onKeyUp.bind(this), false);
        // Lock pointer on canvas click
        document.getElementById('game-canvas').addEventListener('click', () => {
            document.body.requestPointerLock();
        });
    }

    onMouseMove(event) {
        if (document.pointerLockElement === document.body) {
            const movementX = event.movementX || event.mozMovementX || event.webkitMovementX || 0;
            const movementY = event.movementY || event.mozMovementY || event.webkitMovementY || 0;

            this.yawObject.rotation.y -= movementX * this.lookSpeed;
            this.pitchObject.rotation.x -= movementY * this.lookSpeed;

            // Clamp vertical rotation to prevent flipping
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
            case 'Space': this.moveUp = true; break; // Example jump/fly up
            case 'ShiftLeft': this.moveDown = true; break; // Example fly down
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
             case 'ShiftLeft': this.moveDown = false; break;
        }
    }

    update() {
        const delta = this.clock.getDelta(); // Time elapsed since last frame

        // Reset velocity
        this.velocity.x = 0;
        this.velocity.y = 0;
        this.velocity.z = 0;

        // Calculate direction based on input
        if (this.moveForward) this.velocity.z -= 1;
        if (this.moveBackward) this.velocity.z += 1;
        if (this.moveLeft) this.velocity.x -= 1;
        if (this.moveRight) this.velocity.x += 1;
        if (this.moveUp) this.velocity.y += 1; // Flying/vertical movement
        if (this.moveDown) this.velocity.y -= 1;

        // Normalize velocity vector if moving diagonally
        this.velocity.normalize().multiplyScalar(this.moveSpeed * delta);

        // Apply movement relative to the player's look direction
        // Use yawObject for horizontal movement direction
        this.yawObject.translateX(this.velocity.x);
        this.yawObject.translateZ(this.velocity.z);
        // Apply vertical movement directly to yawObject position
         this.yawObject.position.y += this.velocity.y;

        // TODO: Implement collision detection with world geometry
        // Simple floor collision: prevent falling below y=0 (or player height)
        if (this.yawObject.position.y < 1.6) {
            this.yawObject.position.y = 1.6;
        }

        // Let the WorldManager know the player's position
        this.worldManager.update(this.getPlayerPosition());
    }

    getPlayerPosition() {
        return this.yawObject.position;
    }
}