import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class PlayerController {
    constructor(camera, scene, worldManager, uiManager) {
        this.camera = camera;
        this.scene = scene;
        this.worldManager = worldManager;
        this.uiManager = uiManager;

        this.velocity = new THREE.Vector3();
        this.moveSpeed = 5.0; // Slightly reduced speed for potentially more detailed scenes
        this.lookSpeed = 0.002;
        this.playerHeight = 1.6; // Standard eye height

        this.moveForward = false;
        this.moveBackward = false;
        this.moveLeft = false;
        this.moveRight = false;
        this.moveUp = false; // Keep for free-cam mode? Maybe disable later?
        this.moveDown = false; // Keep for free-cam mode? Maybe disable later?
        this.isMoving = false; // Track if player is currently moving for animation

        this.pitchObject = new THREE.Object3D();
        this.pitchObject.add(camera);

        this.yawObject = new THREE.Object3D();
        this.yawObject.position.y = this.playerHeight; // Set initial height
        this.yawObject.add(this.pitchObject);
        this.scene.add(this.yawObject);

        this.clock = new THREE.Clock();

        // --- First Person View Model ---
        this.playerModel = null; // Placeholder for the GLTF model
        this.mixer = null; // Animation mixer
        this.animations = {}; // Store animation clips by name
        this.currentAction = null; // Track the currently playing animation

        this.initEventListeners();
        this.resetPosition();
    }

    async loadPlayerModel(url) {
        // Optional: Create a placeholder if no URL is provided or loading fails
        const createPlaceholder = () => {
            console.log("Creating placeholder first-person view model.");
            // Basic representation (e.g., simple hands)
            const group = new THREE.Group();
            const handGeo = new THREE.BoxGeometry(0.1, 0.2, 0.15);
            const handMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.7 });

            const rightHand = new THREE.Mesh(handGeo, handMat);
            rightHand.position.set(0.3, -0.3, -0.5); // Position relative to camera
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
             // Attach placeholder directly to pitchObject (camera's parent)
             this.pitchObject.add(this.playerModel);
            return; // No animations for placeholder
        }

        return new Promise((resolve, reject) => {
            const loader = new GLTFLoader();
            loader.load(url, (gltf) => {
                console.log("Player model loaded:", url);
                this.playerModel = gltf.scene;

                // Scale and position the model appropriately for first-person view
                // This will likely need adjustment based on the specific model
                // this.playerModel.scale.set(0.1, 0.1, 0.1);
                // this.playerModel.position.set(0, -this.playerHeight, 0); // Position relative to camera? Or attach differently?

                // Make model cast shadows
                this.playerModel.traverse(node => {
                    if (node.isMesh) {
                        node.castShadow = true;
                        // Optionally disable frustum culling if parts disappear
                        // node.frustumCulled = false;
                    }
                });

                // Attach model to the camera's parent (pitchObject) so it moves with view pitch
                this.pitchObject.add(this.playerModel);

                // --- Animation Setup ---
                if (gltf.animations && gltf.animations.length > 0) {
                    this.mixer = new THREE.AnimationMixer(this.playerModel);
                    gltf.animations.forEach((clip) => {
                        // Use clip names directly (ensure they are named correctly in Blender/modeling software)
                        // Common names: 'Idle', 'Walk', 'Run', 'Jump' etc.
                        this.animations[clip.name] = this.mixer.clipAction(clip);
                        console.log(`Found animation: ${clip.name}`);
                    });

                    // Play a default animation (e.g., 'Idle')
                    this.playAnimation('Idle'); // <<<--- ADJUST 'Idle' to your actual idle animation name
                } else {
                    console.log("No animations found in the model.");
                }

                resolve();

            }, undefined, (error) => {
                console.error(`Error loading player model from ${url}:`, error);
                // Use placeholder on failure
                this.playerModel = createPlaceholder();
                this.pitchObject.add(this.playerModel);
                reject(error);
            });
        });
    }

    playAnimation(name, loop = true) {
        if (!this.mixer || !this.animations[name]) {
            // console.warn(`Animation "${name}" not found or mixer not ready.`);
            return;
        }

        const newAction = this.animations[name];
        if (newAction === this.currentAction) return; // Already playing

        if (this.currentAction) {
            // Smoothly fade out the old action
            this.currentAction.fadeOut(0.2);
        }

        // Reset, set looping, fade in and play the new action
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
        // Check if interacting with UI elements (e.g., gallery)
         const activeElement = document.activeElement;
         if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'BUTTON' || activeElement.closest('.gallery-container'))) {
             return; // Don't process movement keys if interacting with UI
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
            // Disable Up/Down movement for typical FPS controls
            // case 'Space': this.moveUp = true; break;
            // case 'ShiftLeft':
            // case 'KeyC': this.moveDown = true; break;
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
            // case 'Space': this.moveUp = false; break;
            // case 'ShiftLeft':
            // case 'KeyC': this.moveDown = false; break;
        }
    }

    update(delta) {
        this.velocity.x = 0;
        this.velocity.y = 0; // Keep Y velocity 0 unless jumping is implemented
        this.velocity.z = 0;

        let currentlyMoving = false;
        if (this.moveForward) { this.velocity.z -= 1; currentlyMoving = true; }
        if (this.moveBackward) { this.velocity.z += 1; currentlyMoving = true; }
        if (this.moveLeft) { this.velocity.x -= 1; currentlyMoving = true; }
        if (this.moveRight) { this.velocity.x += 1; currentlyMoving = true; }
        // Vertical movement (keep commented out unless needed)
        // if (this.moveUp) this.velocity.y += 1;
        // if (this.moveDown) this.velocity.y -= 1;

        this.isMoving = currentlyMoving;

        if (this.velocity.lengthSq() > 0) { // Normalize only if there's movement
             this.velocity.normalize().multiplyScalar(this.moveSpeed * delta);
             // Apply movement relative to the player's yaw rotation
             this.yawObject.translateX(this.velocity.x);
             this.yawObject.translateZ(this.velocity.z);
        }
        // Apply vertical movement directly (if enabled)
        // this.yawObject.position.y += this.velocity.y;


        // Basic collision/boundary check
        const halfSize = this.worldManager.tileSize / 2 - 0.5; // Small buffer from edge
        this.yawObject.position.x = Math.max(-halfSize, Math.min(halfSize, this.yawObject.position.x));
        this.yawObject.position.z = Math.max(-halfSize, Math.min(halfSize, this.yawObject.position.z));

        // Maintain player height (simple floor collision)
        if (this.yawObject.position.y < this.playerHeight) {
            this.yawObject.position.y = this.playerHeight;
        }
        // Optional: Prevent moving too high if vertical movement is enabled
        // const maxHeight = 10; // Example ceiling
        // if (this.yawObject.position.y > maxHeight) {
        //     this.yawObject.position.y = maxHeight;
        // }

        // --- Update Animation ---
        if (this.mixer) {
            this.mixer.update(delta);
            if (this.isMoving) {
                 // Ensure walk/run animation name matches your model
                 this.playAnimation('Walk'); // <<<--- ADJUST 'Walk' to your actual walk/run animation name
            } else {
                 // Ensure idle animation name matches your model
                 this.playAnimation('Idle'); // <<<--- ADJUST 'Idle' to your actual idle animation name
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
         // Ensure idle animation plays on reset
         this.playAnimation('Idle'); // <<<--- ADJUST 'Idle' to your actual idle animation name
        console.log("Player position reset to", position);
    }
}