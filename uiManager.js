export class UIManager {
    constructor() {
        this.uiContainer = document.getElementById('ui-container');
        this.roomGalleryVisible = false;
        this.initBasicUI();
        this.initRoomManagementUI();
    }

    initBasicUI() {
        // Placeholder for initial UI elements
        const statusElement = document.createElement('div');
        statusElement.id = 'player-status';
        statusElement.textContent = 'Status: OK';
        this.uiContainer.appendChild(statusElement);

        // Add object generation input and button
        const objectInputContainer = document.createElement('div');
        objectInputContainer.style.marginTop = '10px';
        
        const objectInput = document.createElement('input');
        objectInput.type = 'text';
        objectInput.placeholder = 'Describe an object...';
        objectInput.style.width = '100%';
        objectInput.style.padding = '5px';
        objectInput.style.marginBottom = '5px';
        
        const generateObjectButton = document.createElement('button');
        generateObjectButton.textContent = 'Generate Object';
        generateObjectButton.onclick = () => {
            if (window.game && window.game.worldManager) {
                const objectDescription = objectInput.value.trim();
                if (objectDescription) {
                    window.game.worldManager.generateSceneObject(objectDescription);
                    objectInput.value = ''; // Clear input after generation
                } else {
                    this.showNotification('Please enter an object description', 'error');
                }
            }
        };
        
        objectInputContainer.appendChild(objectInput);
        objectInputContainer.appendChild(generateObjectButton);
        this.uiContainer.appendChild(objectInputContainer);

        // Add a debug button to trigger room generation manually
        const debugButton = document.createElement('button');
        debugButton.textContent = 'Load Debug Room (Forest)';
        debugButton.onclick = () => {
            const prompt = 'A bright, grassy clearing in a fantasy forest, under a blue sky.';
            window.loadNewDebugRoom(prompt, 'outdoor'); // Call global debug function
        };
        this.uiContainer.appendChild(debugButton);

        const debugButtonIndoor = document.createElement('button');
        debugButtonIndoor.textContent = 'Load Debug Room (Cave)';
        debugButtonIndoor.onclick = () => {
            const prompt = 'A dark, damp cave with glowing crystals on the walls.';
            window.loadNewDebugRoom(prompt, 'indoor'); // Call global debug function
        };
        this.uiContainer.appendChild(debugButtonIndoor);
    }

    initRoomManagementUI() {
        // Create container for room management UI
        const roomManagementContainer = document.createElement('div');
        roomManagementContainer.id = 'room-management';
        roomManagementContainer.classList.add('ui-panel');
        
        // Export/Import buttons
        const exportButton = document.createElement('button');
        exportButton.textContent = 'Export Rooms';
        exportButton.onclick = () => {
            if (window.game && window.game.worldManager) {
                window.game.worldManager.exportRoomsToJSON();
            }
        };
        
        const importButton = document.createElement('button');
        importButton.textContent = 'Import Rooms';
        importButton.onclick = () => this.showImportDialog();
        
        // Toggle gallery button
        const galleryButton = document.createElement('button');
        galleryButton.textContent = 'Room Gallery';
        galleryButton.onclick = () => this.toggleRoomGallery();
        
        // Add buttons to container
        roomManagementContainer.appendChild(exportButton);
        roomManagementContainer.appendChild(importButton);
        roomManagementContainer.appendChild(galleryButton);
        
        // Create room gallery container (initially hidden)
        const galleryContainer = document.createElement('div');
        galleryContainer.id = 'room-gallery';
        galleryContainer.classList.add('gallery-container');
        galleryContainer.style.display = 'none';
        
        // Add gallery header
        const galleryHeader = document.createElement('div');
        galleryHeader.classList.add('gallery-header');
        
        const galleryTitle = document.createElement('h2');
        galleryTitle.classList.add('gallery-title');
        galleryTitle.textContent = 'Room Gallery';
        
        const gallerySubtitle = document.createElement('div');
        gallerySubtitle.classList.add('gallery-subtitle');
        gallerySubtitle.textContent = 'Browse and teleport to your generated rooms';
        
        galleryHeader.appendChild(galleryTitle);
        galleryHeader.appendChild(gallerySubtitle);
        galleryContainer.appendChild(galleryHeader);
        
        // Close button for gallery
        const closeGalleryButton = document.createElement('button');
        closeGalleryButton.classList.add('close-gallery');
        closeGalleryButton.textContent = 'X';
        closeGalleryButton.onclick = () => this.toggleRoomGallery();
        galleryContainer.appendChild(closeGalleryButton);
        
        // Room list container
        const roomListContainer = document.createElement('div');
        roomListContainer.id = 'room-list';
        roomListContainer.classList.add('room-list');
        galleryContainer.appendChild(roomListContainer);
        
        // Add containers to UI
        this.uiContainer.appendChild(roomManagementContainer);
        document.body.appendChild(galleryContainer); 
    }

    showImportDialog() {
        // Create file input element
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.json';
        
        fileInput.onchange = (event) => {
            const file = event.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = async (e) => {
                    const contents = e.target.result;
                    if (window.game && window.game.worldManager) {
                        const success = await window.game.worldManager.importRoomsFromJSON(contents);
                        if (success) {
                            this.showNotification('Rooms imported successfully!');
                        } else {
                            this.showNotification('Failed to import rooms.', 'error');
                        }
                    }
                };
                reader.readAsText(file);
            }
        };
        
        fileInput.click();
    }

    toggleRoomGallery() {
        const galleryContainer = document.getElementById('room-gallery');
        this.roomGalleryVisible = !this.roomGalleryVisible;
        
        if (this.roomGalleryVisible) {
            galleryContainer.style.display = 'flex';
            // Update gallery content if worldManager is available
            if (window.game && window.game.worldManager) {
                this.updateRoomGallery(
                    window.game.worldManager.rooms, 
                    window.game.worldManager.currentRoomIndex
                );
            }
        } else {
            galleryContainer.style.display = 'none';
        }
    }

    updateRoomGallery(rooms, currentIndex) {
        const roomListContainer = document.getElementById('room-list');
        if (!roomListContainer) return;
        
        // Clear existing list
        roomListContainer.innerHTML = '';
        
        if (rooms.length === 0) {
            const noRoomsMessage = document.createElement('div');
            noRoomsMessage.classList.add('no-rooms');
            noRoomsMessage.textContent = 'No rooms created yet.';
            roomListContainer.appendChild(noRoomsMessage);
            return;
        }
        
        // Create room list items
        rooms.forEach((room, index) => {
            const roomItem = document.createElement('div');
            roomItem.classList.add('room-item');
            if (index === currentIndex) {
                roomItem.classList.add('current-room');
            }
            
            // Room preview
            const roomPreview = document.createElement('div');
            roomPreview.classList.add('room-preview');
            if (room.textureUrls.floor) {
                roomPreview.style.backgroundImage = `url('${room.textureUrls.floor}')`;
            } else {
                roomPreview.classList.add('no-preview');
            }
            
            // Room details
            const roomDetails = document.createElement('div');
            roomDetails.classList.add('room-details');
            
            const roomName = document.createElement('div');
            roomName.classList.add('room-name');
            roomName.textContent = room.name;
            
            const roomType = document.createElement('div');
            roomType.classList.add('room-type');
            roomType.textContent = `${room.type.charAt(0).toUpperCase() + room.type.slice(1)}`;
            
            const roomPrompt = document.createElement('div');
            roomPrompt.classList.add('room-prompt');
            roomPrompt.textContent = room.prompt;
            
            const roomActions = document.createElement('div');
            roomActions.classList.add('room-actions');
            
            const teleportButton = document.createElement('button');
            teleportButton.textContent = index === currentIndex ? 'Current Room' : 'Teleport';
            teleportButton.disabled = index === currentIndex;
            teleportButton.onclick = () => {
                if (window.game && window.game.worldManager) {
                    window.game.worldManager.teleportToRoom(index);
                    this.toggleRoomGallery(); // Close gallery after teleporting
                }
            };
            
            roomActions.appendChild(teleportButton);
            
            // Assemble room item
            roomDetails.appendChild(roomName);
            roomDetails.appendChild(roomType);
            roomDetails.appendChild(roomPrompt);
            roomDetails.appendChild(roomActions);
            
            roomItem.appendChild(roomPreview);
            roomItem.appendChild(roomDetails);
            
            roomListContainer.appendChild(roomItem);
        });
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.classList.add('notification', type);
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        // Remove after a few seconds
        setTimeout(() => {
            notification.classList.add('fade-out');
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 500);
        }, 3000);
    }

    updateStatus(newStatus) {
        const statusElement = document.getElementById('player-status');
        if (statusElement) {
            statusElement.textContent = `Status: ${newStatus}`;
        }
    }
}