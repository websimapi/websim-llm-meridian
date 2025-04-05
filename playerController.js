import * as THREE from 'three';

export class PlayerController {
    constructor(camera, scene, worldManager, uiManager, room) {
        this.camera = camera;
        this.scene = scene;
        this.worldManager = worldManager;
        this.uiManager = uiManager;
        this.room = room;

        this.velocity = new THREE.Vector3();
        this.moveSpeed = 5.0; 
        this.lookSpeed = 0.002;

        this.lastPosition = new THREE.Vector3();
        this.lastYaw = 0;
        this.lastPitch = 0;
        this.positionUpdateThresholdSq = 0.01 * 0.01; 
        this.rotationUpdateThreshold = 0.01; 
        this.forceUpdateInterval = 1000; 
        this.minUpdateInterval = 50; 
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
        this.yawObject.position.y = 1.6; 
        this.yawObject.add(this.pitchObject); 
        this.scene.add(this.yawObject); 

        this.clock = new THREE.Clock(); 

        this.isPointerLocked = false;

        this.initEventListeners();
        this.resetPosition(); 
    }

    initEventListeners() {
        document.addEventListener('mousemove', this.onMouseMove.bind(this), false);
        document.addEventListener('keydown', this.onKeyDown.bind(this), false);
        document.addEventListener('keyup', this.onKeyUp.bind(this), false);
        const gameCanvas = document.getElementById('game-canvas');
        if (gameCanvas) {
            gameCanvas.addEventListener('click', () => {
                if (!this.isPointerLocked) { 
                    this.lockPointer();
                }
            });
        } else {
            console.error("Game canvas not found for pointer lock listener.");
        }

        document.addEventListener('pointerlockchange', this.onPointerLockChange.bind(this), false);
        document.addEventListener('pointerlockerror', this.onPointerLockError.bind(this), false); 

        document.addEventListener('keydown', (event) => {
            if (event.code === 'Escape') {
                if (this.isPointerLocked) {
                    document.exitPointerLock();
                }
                if (this.uiManager.roomGalleryVisible) {
                    this.uiManager.toggleRoomGallery();
                }
            }
        });
    }

    lockPointer() {
        const gameCanvas = document.getElementById('game-canvas');
        if (gameCanvas) {
            gameCanvas.requestPointerLock = gameCanvas.requestPointerLock ||
                                            gameCanvas.mozRequestPointerLock ||
                                            gameCanvas.webkitRequestPointerLock;
            if (gameCanvas.requestPointerLock) {
                gameCanvas.requestPointerLock();
            } else {
                console.error("Pointer Lock API not supported by this browser.");
            }
        }
    }

    onPointerLockChange() {
        const gameCanvas = document.getElementById('game-canvas');
        if (document.pointerLockElement === gameCanvas) {
            console.log("Pointer locked");
            this.isPointerLocked = true;
        } else {
            console.log("Pointer unlocked");
            this.isPointerLocked = false;
            this.moveForward = false;
            this.moveBackward = false;
            this.moveLeft = false;
            this.moveRight = false;
            this.moveUp = false;
            this.moveDown = false;
        }
    }

    onPointerLockError() {
        console.error("Pointer lock failed.");
        this.isPointerLocked = false; 
    }

    onMouseMove(event) {
        if (!this.isPointerLocked) return; 

        const movementX = event.movementX || event.mozMovementX || event.webkitMovementX || 0;
        const movementY = event.movementY || event.mozMovementY || event.webkitMovementY || 0;

        this.yawObject.rotation.y -= movementX * this.lookSpeed;

        this.pitchObject.rotation.x -= movementY * this.lookSpeed;
        this.pitchObject.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.pitchObject.rotation.x));
    }

    onKeyDown(event) {
        if (document.activeElement === this.uiManager?.chatInput) {
            return;
        }

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

    isMoving() {
        return this.moveForward || this.moveBackward || this.moveLeft || this.moveRight || this.moveUp || this.moveDown;
    }

    update(delta) {
        const now = performance.now();
        const moveSpeed = this.moveSpeed * delta; 

        this.velocity.set(0, 0, 0);

        if (this.moveForward) this.velocity.z -= 1;
        if (this.moveBackward) this.velocity.z += 1;
        if (this.moveLeft) this.velocity.x -= 1;
        if (this.moveRight) this.velocity.x += 1;
        if (this.moveUp) this.velocity.y += 1;
        if (this.moveDown) this.velocity.y -= 1;

        if (this.velocity.lengthSq() > 0) {
            this.velocity.normalize().multiplyScalar(moveSpeed);
        }

        this.yawObject.translateX(this.velocity.x);
        this.yawObject.translateZ(this.velocity.z);
        this.yawObject.position.y += this.velocity.y; 

        const currentRoomId = this.room.presence[this.room.clientId]?.currentRoomId;
        let halfSizeX = 25; 
        let halfSizeZ = 25;
        let roomFloorY = 0; 
        let roomCeilingY = Infinity; 
        const playerHeight = 1.6;
        const playerRadius = 0.3; 

        if (currentRoomId && this.room.roomState.rooms && this.room.roomState.rooms[currentRoomId]) {
            const roomData = this.room.roomState.rooms[currentRoomId];
            const dims = roomData.structure?.dimensions;
            if (dims) {
                halfSizeX = (dims.width || this.worldManager.tileSize) / 2 - playerRadius;
                halfSizeZ = (dims.depth || this.worldManager.tileSize) / 2 - playerRadius; 
                if (roomData.type === 'indoor') {
                    roomCeilingY = (dims.height || 4) - playerRadius; 
                }
            }
        }

        this.yawObject.position.x = Math.max(-halfSizeX, Math.min(halfSizeX, this.yawObject.position.x));
        this.yawObject.position.z = Math.max(-halfSizeZ, Math.min(halfSizeZ, this.yawObject.position.z));
        this.yawObject.position.y = Math.max(roomFloorY + playerHeight, this.yawObject.position.y); 
        this.yawObject.position.y = Math.min(roomCeilingY, this.yawObject.position.y); 


        this.sendPresenceUpdateIfNeeded(now);
    }

    sendPresenceUpdateIfNeeded(currentTime = performance.now()) {
        if (!this.room || !this.room.clientId) return; 

        if (currentTime - this.lastUpdateTime < this.minUpdateInterval) {
            return; 
        }

        const positionChanged = this.yawObject.position.distanceToSquared(this.lastPosition) > this.positionUpdateThresholdSq;
        const rotationChanged = Math.abs(this.yawObject.rotation.y - this.lastYaw) > this.rotationUpdateThreshold ||
                                Math.abs(this.pitchObject.rotation.x - this.lastPitch) > this.rotationUpdateThreshold;
        const forceUpdate = currentTime - this.lastUpdateTime > this.forceUpdateInterval;

        if (positionChanged || rotationChanged || forceUpdate) {
            this.sendPresenceUpdate();
            this.lastPosition.copy(this.yawObject.position);
            this.lastYaw = this.yawObject.rotation.y;
            this.lastPitch = this.pitchObject.rotation.x;
            this.lastUpdateTime = currentTime;
        }
    }

    sendPresenceUpdate() {
        if (!this.room || !this.room.clientId) return;

        const currentPresence = this.room.presence[this.room.clientId] || {};
        const updateData = {
            x: parseFloat(this.yawObject.position.x.toFixed(3)), 
            y: parseFloat(this.yawObject.position.y.toFixed(3)),
            z: parseFloat(this.yawObject.position.z.toFixed(3)),
            yaw: parseFloat(this.yawObject.rotation.y.toFixed(3)),
            pitch: parseFloat(this.pitchObject.rotation.x.toFixed(3)),
            ...(currentPresence.currentRoomId !== this.getCurrentRoomIdFromState() && { currentRoomId: this.getCurrentRoomIdFromState() })
        };

        this.room.updatePresence(updateData);
    }

    getCurrentRoomIdFromState() {
        return this.room.presence[this.room.clientId]?.currentRoomId || null;
    }

    getPlayerPosition() {
        return this.yawObject.position;
    }

    getRotation() {
        return {
            y: this.yawObject.rotation.y, 
            x: this.pitchObject.rotation.x 
        };
    }

    resetPosition(position = new THREE.Vector3(0, 1.6, 5), rotation = { yaw: 0, pitch: 0 }) {
        this.yawObject.position.copy(position);
        this.yawObject.rotation.y = rotation.yaw;
        this.pitchObject.rotation.x = rotation.pitch;

        this.velocity.set(0, 0, 0); 
        this.moveForward = this.moveBackward = this.moveLeft = this.moveRight = this.moveUp = this.moveDown = false;
        console.log("Player position reset to", position, "Rotation:", rotation);

        this.sendPresenceUpdate();
        this.lastPosition.copy(this.yawObject.position);
        this.lastYaw = this.yawObject.rotation.y;
        this.lastPitch = this.pitchObject.rotation.x;
        this.lastUpdateTime = performance.now();
    }
}