import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class PlayerController {
    constructor(camera, scene, worldManager, uiManager) {
        this.camera = camera;
        this.scene = scene;
        this.worldManager = worldManager;
        this.uiManager = uiManager;

        this.velocity = new THREE.Vector3();
        this.moveSpeed = 5.0; 
        this.lookSpeed = 0.002;
        this.playerHeight = 1.6; 

        this.moveForward = false;
        this.moveBackward = false;
        this.moveLeft = false;
        this.moveRight = false;
        this.moveUp = false; 
        this.moveDown = false; 
        this.isMoving = false; 

        this.pitchObject = new THREE.Object3D();
        this.pitchObject.add(camera);

        this.yawObject = new THREE.Object3D();
        this.yawObject.position.y = this.playerHeight; 
        this.yawObject.add(this.pitchObject);
        this.scene.add(this.yawObject);

        this.clock = new THREE.Clock();

        this.playerModel = null; 
        this.mixer = null; 
        this.animations = {}; 
        this.currentAction = null; 

        this.initEventListeners();
        this.resetPosition();
    }

    async loadPlayerModel(url) {
        const createPlaceholder = () => {
            console.log("Creating placeholder first-person view model.");
            const group = new THREE.Group();
            const handGeo = new THREE.BoxGeometry(0.1, 0.2, 0.15);
            const handMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.7 });

            const rightHand = new THREE.Mesh(handGeo, handMat);
            rightHand.position.set(0.3, -0.3, -0.5); 
            rightHand.rotation.set(0, -0.2, 0.1);
            rightHand.castShadow = true;

            const leftHand = new THREE.Mesh(handGeo, handMat);
            leftHand.position.set(-0.3, -0.3, -0.5);
            leftHand.rotation.set(0, 0.2, -0.1);
            leftHand.castShadow = true;

            group.add(rightHand);
            group.add(leftHand);
            return group;
        };

        if (!url) {
            this.playerModel = createPlaceholder();
            this.pitchObject.add(this.playerModel);
            return; 
        }

        return new Promise((resolve, reject) => {
            const loader = new GLTFLoader();
            loader.load(url, (gltf) => {
                console.log("Player model loaded:", url);
                this.playerModel = gltf.scene;

                this.playerModel.traverse(node => {
                    if (node.isMesh) {
                        node.castShadow = true;
                    }
                });

                this.pitchObject.add(this.playerModel);

                if (gltf.animations && gltf.animations.length > 0) {
                    this.mixer = new THREE.AnimationMixer(this.playerModel);
                    gltf.animations.forEach((clip) => {
                        this.animations[clip.name] = this.mixer.clipAction(clip);
                        console.log(`Found animation: ${clip.name}`);
                    });

                    this.playAnimation('Idle'); 
                } else {
                    console.log("No animations found in the model.");
                }

                resolve();

            }, undefined, (error) => {
                console.error(`Error loading player model from ${url}:`, error);
                this.playerModel = createPlaceholder();
                this.pitchObject.add(this.playerModel);
                reject(error);
            });
        });
    }

    playAnimation(name, loop = true) {
        if (!this.mixer || !this.animations[name]) {
            return;
        }

        const newAction = this.animations[name];
        if (newAction === this.currentAction) return; 

        if (this.currentAction) {
            this.currentAction.fadeOut(0.2);
        }

        newAction.reset()
                 .setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity)
                 .setEffectiveTimeScale(1)
                 .setEffectiveWeight(1)
                 .fadeIn(0.2)
                 .play();

        this.currentAction = newAction;
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
        const activeElement = document.activeElement;
        if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'BUTTON' || activeElement.closest('.gallery-container'))) {
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
        }
    }

    update(delta) {
        this.velocity.x = 0;
        this.velocity.y = 0; 
        this.velocity.z = 0;

        let currentlyMoving = false;
        if (this.moveForward) { this.velocity.z -= 1; currentlyMoving = true; }
        if (this.moveBackward) { this.velocity.z += 1; currentlyMoving = true; }
        if (this.moveLeft) { this.velocity.x -= 1; currentlyMoving = true; }
        if (this.moveRight) { this.velocity.x += 1; currentlyMoving = true; }

        this.isMoving = currentlyMoving;

        if (this.velocity.lengthSq() > 0) { 
            this.velocity.normalize().multiplyScalar(this.moveSpeed * delta);
            this.yawObject.translateX(this.velocity.x);
            this.yawObject.translateZ(this.velocity.z);
        }

        const halfSize = this.worldManager.tileSize / 2 - 0.5; 
        this.yawObject.position.x = Math.max(-halfSize, Math.min(halfSize, this.yawObject.position.x));
        this.yawObject.position.z = Math.max(-halfSize, Math.min(halfSize, this.yawObject.position.z));

        if (this.yawObject.position.y < this.playerHeight) {
            this.yawObject.position.y = this.playerHeight;
        }

        if (this.mixer) {
            this.mixer.update(delta);
            if (this.isMoving) {
                this.playAnimation('Walk'); 
            } else {
                this.playAnimation('Idle'); 
            }
        }
    }

    getPlayerPosition() {
        return this.yawObject.position;
    }

    resetPosition(position = new THREE.Vector3(0, this.playerHeight, 5)) {
        this.yawObject.position.copy(position);
        this.yawObject.rotation.y = 0;
        this.pitchObject.rotation.x = 0;
        this.velocity.set(0, 0, 0);
        this.moveForward = this.moveBackward = this.moveLeft = this.moveRight = this.moveUp = this.moveDown = false;
        this.isMoving = false;
        this.playAnimation('Idle'); 
        console.log("Player position reset to", position);
    }
}