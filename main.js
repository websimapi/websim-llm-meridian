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
scene.add(directionalLight);

async function initializeMultiplayer() {
    uiManager.showNotification("Connecting...", "info", 10000);
    await room.initialize();
    uiManager.showNotification(`Connected as ${room.peers[room.clientId]?.username || 'User'}!`, "info");

    room.subscribePresence((presence) => {
        const myClientId = room.clientId;
        const myPresence = presence[myClientId];
        const myRoomId = myPresence?.currentRoomId;

        const currentPeers = new Set(Object.keys(presence));

        for (const clientId in presence) {
            if (clientId === myClientId) continue;

            const data = presence[clientId];
            const peerInfo = room.peers[clientId];
            const playerRoomId = data?.currentRoomId;

            if (playerRoomId && playerRoomId === myRoomId && data.x !== undefined) {
                if (!otherPlayers.has(clientId)) {
                    const playerMesh = new THREE.Mesh(
                        new THREE.BoxGeometry(0.5, 1.6, 0.5),
                        new THREE.MeshStandardMaterial({ color: 0x00ff00 })
                    );
                    playerMesh.position.set(data.x, data.y, data.z);
                    scene.add(playerMesh);

                    const labelDiv = document.createElement('div');
                    labelDiv.className = 'player-label';
                    labelDiv.textContent = peerInfo?.username || `User ${clientId.substring(0, 4)}`;
                    const playerLabel = new CSS2DObject(labelDiv);
                    playerLabel.position.set(0, 1.0, 0);
                    playerMesh.add(playerLabel);

                    otherPlayers.set(clientId, { mesh: playerMesh, label: playerLabel });
                    uiManager.addChatMessage(`${labelDiv.textContent} joined the room.`, 'system');
                } else {
                    const playerRep = otherPlayers.get(clientId);
                    playerRep.mesh.position.set(data.x, data.y, data.z);
                    playerRep.mesh.rotation.y = data.yaw;

                    const playerRep = otherPlayers.get(clientId);
                    const expectedUsername = peerInfo?.username || `User ${clientId.substring(0, 4)}`;
                    if (playerRep && playerRep.label.element.textContent !== expectedUsername) {
                        playerRep.label.element.textContent = expectedUsername;
                    }
                }
            } else {
                removePlayerAvatar(clientId);
            }
        }

        otherPlayers.forEach((playerRep, clientId) => {
            if (!currentPeers.has(clientId) || presence[clientId]?.currentRoomId !== myRoomId) {
                removePlayerAvatar(clientId);
            }
        });
    });

    room.subscribeRoomState((roomState) => {
        uiManager.updateRoomGallery();

        const myPresence = room.presence[room.clientId];
        const myRoomId = myPresence?.currentRoomId;
        if (myRoomId && (!roomState.rooms || !roomState.rooms[myRoomId])) {
            console.warn(`Current room ${myRoomId} no longer exists in shared state. Teleporting to default.`);
            uiManager.showNotification("Your current room was removed. Moving to default.", "info");
            const firstRoomId = (roomState.rooms && Object.keys(roomState.rooms).length > 0)
                                ? Object.keys(roomState.rooms)[0]
                                : null;
            if (firstRoomId) {
                setTimeout(() => worldManager.teleportToRoom(firstRoomId), 0);
            } else {
                console.error("No rooms available to teleport to!");
                uiManager.showNotification("Error: No available rooms found!", "error");
            }
        }
    });

    room.onmessage = (event) => {
        const data = event.data;
        const senderUsername = event.username || `User ${event.clientId?.substring(0,4) || '???'}`;

        switch (data.type) {
            case "connected":
                console.log(`Client connected: ${data.username} (${data.clientId})`);
                break;
            case "disconnected":
                console.log(`Client disconnected: ${data.username} (${data.clientId})`);
                removePlayerAvatar(data.clientId);
                uiManager.addChatMessage(`${data.username} left.`, 'system');
                break;

            case "chat":
                if (data.message) {
                    uiManager.addChatMessage(data.message, 'user', senderUsername);
                }
                break;

            default:
                console.log("Received unhandled event:", event);
        }
    };

    await worldManager.generateInitialWorld();

    const initialPresence = room.presence[room.clientId] || {};
    const initialPlayerPos = playerController.getPlayerPosition();
    room.updatePresence({
        ...initialPresence,
        x: initialPlayerPos.x,
        y: initialPlayerPos.y,
        z: initialPlayerPos.z,
        yaw: playerController.yawObject.rotation.y,
        pitch: playerController.pitchObject.rotation.x,
        currentRoomId: initialPresence.currentRoomId
    });
}

function removePlayerAvatar(clientId) {
    if (otherPlayers.has(clientId)) {
        const playerRep = otherPlayers.get(clientId);
        console.log("Removing player:", clientId);
        if (playerRep.label) playerRep.mesh.remove(playerRep.label);
        if (playerRep.mesh) scene.remove(playerRep.mesh);
        otherPlayers.delete(clientId);
    }
}

function animate() {
    requestAnimationFrame(animate);

    const delta = playerController.clock.getDelta();

    playerController.update(delta);

    worldManager.update(playerController.getPlayerPosition());

    minimap.update(playerController.getPlayerPosition());

    renderer.render(scene, camera);

    labelRenderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    labelRenderer.setSize(window.innerWidth, window.innerHeight);
});

initializeMultiplayer().then(() => {
    animate();
}).catch(error => {
    console.error("Failed to initialize multiplayer:", error);
    uiManager.showNotification("Error: Connection failed. Please refresh.", "error", 10000);
});