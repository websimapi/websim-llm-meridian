import * as THREE from 'three';
import { WorldManager } from './worldManager.js';
import { PlayerController } from './playerController.js';
import { UIManager } from './uiManager.js';
import { Minimap } from './minimap.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const room = new WebsimSocket();
window.room = room;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('game-canvas'), antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.style.position = 'absolute';
labelRenderer.domElement.style.top = '0px';
labelRenderer.domElement.style.pointerEvents = 'none';
document.getElementById('game-container').appendChild(labelRenderer.domElement);

const worldManager = new WorldManager(scene, room);
const uiManager = new UIManager(room);
const playerController = new PlayerController(camera, scene, worldManager, uiManager, room);
const minimap = new Minimap(worldManager, room);

const otherPlayers = new Map();

window.game = {
    room,
    scene,
    camera,
    renderer,
    labelRenderer,
    worldManager,
    playerController,
    uiManager,
    minimap,
    otherPlayers
};

window.loadNewDebugRoom = async (prompt, type) => {
    if (window.game && window.game.worldManager) {
        await window.game.worldManager.loadNewDebugRoom(prompt, type);
    } else {
        console.error("WorldManager not found on window.game");
    }
};

scene.add(new THREE.AmbientLight(0x808080));
const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
directionalLight.position.set(5, 10, 7.5);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 1024;
directionalLight.shadow.mapSize.height = 1024;
directionalLight.shadow.camera.near = 0.5;
directionalLight.shadow.camera.far = 50;
scene.add(directionalLight);

async function initializeMultiplayer() {
    console.log("Initializing multiplayer connection...");
    uiManager.showNotification("Connecting...", "info", 10000);
    try {
        await room.initialize();
        uiManager.showNotification(`Connected as ${room.peers[room.clientId]?.username || 'User'}!`, "info", 3000);
        console.log("Websim connection initialized. Client ID:", room.clientId);

        room.subscribePresence((presence) => {
            const myClientId = room.clientId;
            const myPresence = presence[myClientId];
            const myRoomId = myPresence?.currentRoomId;

            const currentPeerIdsInMyRoom = new Set();

            for (const clientId in presence) {
                if (clientId === myClientId) continue;

                const data = presence[clientId];
                const peerInfo = room.peers[clientId];
                const playerRoomId = data?.currentRoomId;

                if (peerInfo && playerRoomId && playerRoomId === myRoomId && data.x !== undefined && data.y !== undefined && data.z !== undefined) {
                    currentPeerIdsInMyRoom.add(clientId);

                    let playerRep = otherPlayers.get(clientId);

                    if (!playerRep) {
                        const playerColor = uiManager.getUserColor(clientId);

                        const playerGeometry = new THREE.CapsuleGeometry(0.25, 1.1, 4, 8);
                        const playerMaterial = new THREE.MeshStandardMaterial({
                            color: playerColor,
                            roughness: 0.8,
                            metalness: 0.2
                        });
                        const playerMesh = new THREE.Mesh(playerGeometry, playerMaterial);
                        playerMesh.castShadow = true;
                        playerMesh.position.set(data.x, data.y - 0.8, data.z);
                        playerMesh.rotation.y = data.yaw || 0;
                        scene.add(playerMesh);

                        const labelDiv = document.createElement('div');
                        labelDiv.className = 'player-label';
                        labelDiv.textContent = peerInfo.username || `User ${clientId.substring(0, 4)}`;
                        labelDiv.style.color = playerColor;
                        const playerLabel = new CSS2DObject(labelDiv);
                        playerLabel.position.set(0, 1.0, 0);
                        playerMesh.add(playerLabel);

                        playerRep = { mesh: playerMesh, label: playerLabel };
                        otherPlayers.set(clientId, playerRep);
                        uiManager.addChatMessage(`${labelDiv.textContent} joined the room.`, 'system');

                    } else {
                        playerRep.mesh.position.lerp(new THREE.Vector3(data.x, data.y - 0.8, data.z), 0.3);
                        playerRep.mesh.rotation.y = data.yaw || 0;

                        const expectedUsername = peerInfo.username || `User ${clientId.substring(0, 4)}`;
                        if (playerRep.label.element.textContent !== expectedUsername) {
                            playerRep.label.element.textContent = expectedUsername;
                            uiManager.addChatMessage(`${expectedUsername} is now known as ${expectedUsername}.`, 'system');
                        }
                        const playerColor = uiManager.getUserColor(clientId);
                        if (playerRep.mesh.material.color.getHexString() !== playerColor.substring(1)) {
                            playerRep.mesh.material.color.set(playerColor);
                            playerRep.label.element.style.color = playerColor;
                        }
                    }
                }
            }

            otherPlayers.forEach((playerRep, clientId) => {
                if (!currentPeerIdsInMyRoom.has(clientId)) {
                    const username = playerRep.label.element.textContent;
                    console.log(`Player ${username} (${clientId}) left room ${myRoomId} or changed rooms. Removing avatar.`);
                    removePlayerAvatar(clientId);
                    uiManager.addChatMessage(`${username} left the room.`, 'system');
                }
            });

            if (minimap && playerController) {
                minimap.update(playerController.getPlayerPosition());
            }
        });

        room.subscribeRoomState((roomState) => {
            console.log("Room state updated:", roomState);
            uiManager.updateRoomGallery();

            const myPresence = room.presence[room.clientId];
            const myRoomId = myPresence?.currentRoomId;

            if (myRoomId && (!roomState.rooms || !roomState.rooms[myRoomId])) {
                console.warn(`Current room ${myRoomId} no longer exists in shared state. Attempting to teleport to a default room.`);
                uiManager.showNotification("Your current room was removed. Moving to a default room.", "info");

                const availableRooms = roomState.rooms ? Object.values(roomState.rooms) : [];
                let targetRoomId = null;
                if (availableRooms.length > 0) {
                    availableRooms.sort((a, b) => (b.timestamp && a.timestamp) ? new Date(b.timestamp) - new Date(a.timestamp) : 0);
                    targetRoomId = availableRooms[0].id;
                    console.log(`Found fallback room: ${targetRoomId}`);
                }

                if (targetRoomId) {
                    setTimeout(() => worldManager.teleportToRoom(targetRoomId), 0);
                } else {
                    console.error("CRITICAL: No rooms available to teleport to after current room removal!");
                    uiManager.showNotification("Error: No available rooms found!", "error", 10000);
                    room.updatePresence({ ...myPresence, currentRoomId: null });
                    worldManager.clearCurrentRoom();
                    scene.background = worldManager.defaultOutdoorBg;
                }
            }
        });

        room.onmessage = (event) => {
            console.log("Received message:", event);
            const data = event.data;
            const senderUsername = event.username || `User ${event.clientId?.substring(0,4) || '???'}`;
            const senderClientId = event.clientId;

            switch (data.type) {
                case "connected":
                    console.log(`Client connected event via onmessage: ${data.username} (${data.clientId})`);
                    break;
                case "disconnected":
                    console.log(`Client disconnected event via onmessage: ${data.username} (${data.clientId})`);
                    removePlayerAvatar(data.clientId);
                    break;

                case "chat":
                    if (data.message && senderClientId !== room.clientId) {
                        uiManager.addChatMessage(data.message, 'user', senderUsername);
                    }
                    break;

                default:
                    console.log("Received unhandled event type:", data.type, event);
            }
        };

        await worldManager.generateInitialWorld();
        console.log("Initial world generated/joined.");

        const initialPresence = room.presence[room.clientId] || {};
        const initialPlayerPos = playerController.getPlayerPosition();
        const initialPlayerRot = playerController.getRotation();
        room.updatePresence({
            ...initialPresence,
            x: initialPlayerPos.x,
            y: initialPlayerPos.y,
            z: initialPlayerPos.z,
            yaw: initialPlayerRot.y,
            pitch: initialPlayerRot.x,
        });
        console.log("Initial presence sent.");

        minimap.update(initialPlayerPos);

        animate();
        console.log("Initialization complete. Starting animation loop.");

    } catch (error) {
        console.error("FATAL: Failed during multiplayer initialization:", error);
        uiManager.showNotification("Error: Connection failed. Please refresh.", "error", 0);

        const errorDiv = document.createElement('div');
        errorDiv.style.position = 'fixed';
        errorDiv.style.top = '0';
        errorDiv.style.left = '0';
        errorDiv.style.width = '100%';
        errorDiv.style.height = '100%';
        errorDiv.style.display = 'flex';
        errorDiv.style.flexDirection = 'column';
        errorDiv.style.justifyContent = 'center';
        errorDiv.style.alignItems = 'center';
        errorDiv.style.padding = '20px';
        errorDiv.style.backgroundColor = 'rgba(200, 0, 0, 0.9)';
        errorDiv.style.color = 'white';
        errorDiv.style.textAlign = 'center';
        errorDiv.style.zIndex = '10001';
        errorDiv.innerHTML = `<h2>Connection Failed</h2><p>Could not establish a connection with the server. Please check your internet connection and try refreshing the page.</p><p style="font-size: 0.8em; color: #fcc;"><i>${error.message}</i></p>`;
        document.body.appendChild(errorDiv);
    }
}

function removePlayerAvatar(clientId) {
    if (otherPlayers.has(clientId)) {
        const playerRep = otherPlayers.get(clientId);
        console.log("Removing player avatar:", clientId);

        if (playerRep.label && playerRep.mesh) {
            playerRep.mesh.remove(playerRep.label);
            if (playerRep.label.element && playerRep.label.element.parentNode) {
                playerRep.label.element.parentNode.removeChild(playerRep.label.element);
            }
        }
        if (playerRep.mesh && playerRep.mesh.parent) {
            playerRep.mesh.parent.remove(playerRep.mesh);
        }
        playerRep.mesh?.geometry?.dispose();
        playerRep.mesh?.material?.dispose();

        otherPlayers.delete(clientId);
    } else {
        // console.log("Attempted to remove avatar for client ID that doesn't exist:", clientId);
    }
}

function animate() {
    requestAnimationFrame(animate);

    const delta = playerController.clock.getDelta();

    if (document.pointerLockElement === document.body || playerController.isMoving()) {
        playerController.update(delta);
    } else {
        playerController.sendPresenceUpdateIfNeeded();
    }

    if(minimap) {
        minimap.update(playerController.getPlayerPosition());
    }

    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    labelRenderer.setSize(window.innerWidth, window.innerHeight);
});

window.addEventListener('beforeunload', () => {
    console.log("Page unloading, performing cleanup...");
    window.game?.worldManager?.dispose();
    console.log("Cleanup finished.");
});

initializeMultiplayer();