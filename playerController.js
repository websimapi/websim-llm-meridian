import * as THREE from 'three';

export class PlayerController {
    constructor(camera, scene, worldManager, uiManager, room) {
        this.camera = camera;
        this.scene = scene;
        this.worldManager = worldManager;
        this.uiManager = uiManager;
        this.room = room;

        this.velocity = new THREE.Vector3();
        this.moveSpeed = 10.0;
        this.lookSpeed = 0.002;

        this.lastPosition = new THREE.Vector3();
        this.lastYaw = 0;
        this.lastPitch = 0;
        this.updateThreshold = 0.01;
        this.updateInterval = 100;
        this.lastUpdateTime = 0;

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

        this.initEventListeners();
        this.resetPosition();
    }

    initEventListeners() {
        document.addEventListener('mousemove', this.onMouseMove.bind(this), false);
        document.addEventListener('keydown', this.onKeyDown.bind(this), false);
        document.addEventListener('keyup', this.onKeyUp.bind(this), false);
        document.getElementById('game-canvas').addEventListener('click', () => {
            this.lockPointer();
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
        const now = performance.now();
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

        const currentRoomId = this.room.presence[this.room.clientId]?.currentRoomId;
        let halfSize = 25;
        if (currentRoomId && this.room.roomState.rooms && this.room.roomState.rooms[currentRoomId]) {
            const roomData = this.room.roomState.rooms[currentRoomId];
            halfSize = (roomData.structure?.dimensions?.width || this.worldManager.tileSize) / 2 - 0.5;
        }

        this.yawObject.position.x = Math.max(-halfSize, Math.min(halfSize, this.yawObject.position.x));
        this.yawObject.position.z = Math.max(-halfSize, Math.min(halfSize, this.yawObject.position.z));

        const playerHeight = 1.6;
        this.yawObject.position.y = Math.max(playerHeight, this.yawObject.position.y);

        const positionChanged = this.yawObject.position.distanceToSquared(this.lastPosition) > this.updateThreshold * this.updateThreshold;
        const rotationChanged = Math.abs(this.yawObject.rotation.y - this.lastYaw) > this.updateThreshold ||
                                Math.abs(this.pitchObject.rotation.x - this.lastPitch) > this.updateThreshold;

        if ((positionChanged || rotationChanged) || (now - this.lastUpdateTime > this.updateInterval)) {
            this.sendPresenceUpdate();
            this.lastPosition.copy(this.yawObject.position);
            this.lastYaw = this.yawObject.rotation.y;
            this.lastPitch = this.pitchObject.rotation.x;
            this.lastUpdateTime = now;
        }
    }

    sendPresenceUpdate() {
        if (this.room && this.room.clientId) {
            const currentPresence = this.room.presence[this.room.clientId] || {};
            this.room.updatePresence({
                x: this.yawObject.position.x,
                y: this.yawObject.position.y,
                z: this.yawObject.position.z,
                yaw: this.yawObject.rotation.y,
                pitch: this.pitchObject.rotation.x,
                currentRoomId: currentPresence.currentRoomId || null
            });
        }
    }

    getPlayerPosition() {
        return this.yawObject.position;
    }

    resetPosition(position = new THREE.Vector3(0, 1.6, 5), rotation = { yaw: 0, pitch: 0 }) {
        this.yawObject.position.copy(position);
        this.yawObject.rotation.y = rotation.yaw;
        this.pitchObject.rotation.x = rotation.pitch;

        this.velocity.set(0, 0, 0);
        this.moveForward = this.moveBackward = this.moveLeft = this.moveRight = this.moveUp = this.moveDown = false;
        console.log("Player position reset to", position);

        this.sendPresenceUpdate();
        this.lastPosition.copy(this.yawObject.position);
        this.lastYaw = this.yawObject.rotation.y;
        this.lastPitch = this.pitchObject.rotation.x;
        this.lastUpdateTime = performance.now();
    }
}