export class UIManager {
    constructor(room) {
        this.uiContainer = document.getElementById('ui-container');
        this.room = room; 
        this.roomGalleryVisible = false;
        this.chatMessagesContainer = document.getElementById('chat-messages');
        this.chatInput = document.getElementById('chat-input');

        this.initBasicUI(); 
        this.initRoomManagementUI();
        this.initChat(); 
    }

    initBasicUI() {
        // Can keep this empty or add non-multiplayer UI later
    }

    initChat() {
         if (!this.chatInput || !this.chatMessagesContainer) {
             console.error("Chat UI elements not found!");
             return;
         }

         this.chatInput.addEventListener('keydown', (event) => {
             if (event.key === 'Enter' && this.chatInput.value.trim() !== '') {
                 const message = this.chatInput.value.trim();
                 this.sendChatMessage(message);
                 this.chatInput.value = ''; 
                 event.stopPropagation();
             } else if (event.key !== 'Escape') { 
                 event.stopPropagation();
             }
         });

         this.addChatMessage('Welcome! Use the Room Gallery or Debug buttons to explore/create rooms.', 'system');
         this.addChatMessage('Press Enter to send chat messages.', 'system');
     }

     sendChatMessage(message) {
         if (!message) return;
         console.log("Sending chat:", message);
         this.room.send({
             type: 'chat',
             message: message,
             echo: false 
         });
         this.addChatMessage(message, 'user', 'You');
     }

     addChatMessage(message, type = 'info', username = '') {
         if (!this.chatMessagesContainer) return;

         const messageElement = document.createElement('div');
         messageElement.classList.add('chat-message');

         const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
         const timeSpan = document.createElement('span');
         timeSpan.style.color = '#888';
         timeSpan.style.marginRight = '5px';
         timeSpan.textContent = `[${timestamp}]`;


         if (type === 'user') {
             const userSpan = document.createElement('span');
             userSpan.classList.add('username');
             const peerColor = this.getUserColor(username === 'You' ? this.room.clientId : this.getClientIdByUsername(username));
             userSpan.style.color = peerColor;
             userSpan.textContent = `${username}:`;
             messageElement.appendChild(timeSpan);
             messageElement.appendChild(userSpan);
             messageElement.appendChild(document.createTextNode(` ${message}`)); 
         } else if (type === 'system' || type === 'info') {
             const systemSpan = document.createElement('span');
             systemSpan.classList.add('system');
             systemSpan.textContent = message;
             messageElement.appendChild(timeSpan);
             messageElement.appendChild(systemSpan);
         } else if (type === 'error') {
             const errorSpan = document.createElement('span');
             errorSpan.classList.add('error');
             errorSpan.textContent = `Error: ${message}`;
             messageElement.appendChild(timeSpan);
             messageElement.appendChild(errorSpan);
         } else {
             messageElement.appendChild(timeSpan);
             messageElement.appendChild(document.createTextNode(message)); 
         }

         const shouldScroll = this.chatMessagesContainer.scrollHeight - this.chatMessagesContainer.scrollTop <= this.chatMessagesContainer.clientHeight + 20; 

         this.chatMessagesContainer.appendChild(messageElement);

         if (shouldScroll) {
            this.chatMessagesContainer.scrollTop = this.chatMessagesContainer.scrollHeight;
         }
     }

      getClientIdByUsername(username) {
        if (!this.room || !this.room.peers) return null;
        for (const clientId in this.room.peers) {
            if (this.room.peers[clientId].username === username) {
                return clientId;
            }
        }
        return null;
      }

     getUserColor(clientId) {
         if (!clientId) return '#FFFFFF'; 
         let hash = 0;
         for (let i = 0; i < clientId.length; i++) {
             hash = clientId.charCodeAt(i) + ((hash << 5) - hash);
             hash = hash & hash; 
         }
         const colors = ['#FFADAD', '#FFD6A5', '#FDFFB6', '#CAFFBF', '#9BF6FF', '#A0C4FF', '#BDB2FF', '#FFC6FF', '#FFFFFC'];
         const index = Math.abs(hash) % colors.length;
         return colors[index];
     }


    initRoomManagementUI() {
        const roomManagementContainer = document.createElement('div');
        roomManagementContainer.id = 'room-management';
        roomManagementContainer.classList.add('ui-panel');
        roomManagementContainer.style.position = 'absolute'; 
        roomManagementContainer.style.bottom = '10px';
        roomManagementContainer.style.left = '10px';
        roomManagementContainer.style.backgroundColor = 'rgba(50, 50, 50, 0.7)';
        roomManagementContainer.style.padding = '10px';
        roomManagementContainer.style.borderRadius = '5px';
        roomManagementContainer.style.zIndex = '100'; 

        const galleryButton = document.createElement('button');
        galleryButton.textContent = 'Room Gallery';
        galleryButton.id = 'gallery-toggle-button'; 
        galleryButton.onclick = () => this.toggleRoomGallery();

        roomManagementContainer.appendChild(galleryButton);

        const debugPanel = document.createElement('div');
        debugPanel.style.marginTop = '10px';
        debugPanel.style.borderTop = '1px solid #666';
        debugPanel.style.paddingTop = '5px';

        const debugButton = document.createElement('button');
        debugButton.textContent = 'Create Outdoor Room';
        debugButton.onclick = () => {
            const roomPrompt = window.prompt("Enter prompt for new outdoor room:", "A tranquil beach at sunset");
            if (roomPrompt && window.game && window.game.worldManager) {
                this.showNotification('Generating new outdoor room...', 'info');
                window.game.worldManager.createAndJoinNewRoom(roomPrompt, 'outdoor');
            }
        };
        debugPanel.appendChild(debugButton);

        const debugButtonIndoor = document.createElement('button');
        debugButtonIndoor.textContent = 'Create Indoor Room';
        debugButtonIndoor.onclick = () => {
            const roomPrompt = window.prompt("Enter prompt for new indoor room:", "A futuristic spaceship bridge");
             if (roomPrompt && window.game && window.game.worldManager) {
                 this.showNotification('Generating new indoor room...', 'info');
                 window.game.worldManager.createAndJoinNewRoom(roomPrompt, 'indoor');
             }
        };
        debugPanel.appendChild(debugButtonIndoor);
        roomManagementContainer.appendChild(debugPanel);

        const statusElement = document.createElement('div');
        statusElement.id = 'player-status';
        statusElement.textContent = 'Status: Connecting...'; 
        statusElement.style.marginTop = '10px';
        statusElement.style.fontSize = '0.9em';
        statusElement.style.color = '#ccc';
        roomManagementContainer.appendChild(statusElement);

        document.body.appendChild(roomManagementContainer);

        const galleryContainer = document.createElement('div');
        galleryContainer.id = 'room-gallery';
        galleryContainer.classList.add('gallery-container');
        galleryContainer.style.display = 'none';

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

        const closeGalleryButton = document.createElement('button');
        closeGalleryButton.classList.add('close-gallery');
        closeGalleryButton.textContent = 'X';
        closeGalleryButton.onclick = () => this.toggleRoomGallery();
        galleryContainer.appendChild(closeGalleryButton);

        const roomListContainer = document.createElement('div');
        roomListContainer.id = 'room-list';
        roomListContainer.classList.add('room-list');
        galleryContainer.appendChild(roomListContainer);

        document.body.appendChild(galleryContainer);
    }

    toggleRoomGallery() {
        const galleryContainer = document.getElementById('room-gallery');
        this.roomGalleryVisible = !this.roomGalleryVisible;

        if (this.roomGalleryVisible) {
            galleryContainer.style.display = 'flex';
            this.updateRoomGallery(); 
            if (document.pointerLockElement === document.body) {
                document.exitPointerLock();
            }
        } else {
            galleryContainer.style.display = 'none';
        }
    }

    updateRoomGallery() {
         if (!this.roomGalleryVisible) return; 

        const roomListContainer = document.getElementById('room-list');
        if (!this.room || !roomListContainer) return;

        const roomsData = this.room.roomState.rooms || {};
        const roomsArray = Object.values(roomsData).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)); 
        const myPresence = this.room.presence[this.room.clientId] || {};
        const currentRoomId = myPresence.currentRoomId;

        this.updateStatus(currentRoomId ? `In: ${roomsData[currentRoomId]?.name || 'Unknown Room'}` : 'No Room');

        roomListContainer.innerHTML = '';

        if (roomsArray.length === 0) {
            const noRoomsMessage = document.createElement('div');
            noRoomsMessage.classList.add('no-rooms');
            noRoomsMessage.textContent = 'No rooms created yet. Use the "Create Room" buttons to start.';
            roomListContainer.appendChild(noRoomsMessage);
            return;
        }

        roomsArray.forEach((room) => {
            const roomItem = document.createElement('div');
            roomItem.classList.add('room-item');
            if (room.id === currentRoomId) {
                roomItem.classList.add('current-room');
            }

            const roomPreview = document.createElement('div');
            roomPreview.classList.add('room-preview');
            if (room.textureUrls && room.textureUrls.floor) {
                roomPreview.style.backgroundImage = `url('${room.textureUrls.floor}')`;
            } else if (room.type === 'outdoor' && room.textureUrls && room.textureUrls.sky) {
                 roomPreview.style.backgroundImage = `url('${room.textureUrls.sky}')`;
                 roomPreview.style.backgroundSize = 'contain';
                 roomPreview.style.backgroundRepeat = 'no-repeat';
            } else {
                roomPreview.classList.add('no-preview');
            }

            const roomDetails = document.createElement('div');
            roomDetails.classList.add('room-details');

            const roomName = document.createElement('div');
            roomName.classList.add('room-name');
            roomName.textContent = room.name || `Room ${room.id.substring(0, 6)}`; 

            const roomType = document.createElement('div');
            roomType.classList.add('room-type');
            const creatorName = room.creatorUsername || `User ${room.creatorId?.substring(0,4) || '???'}`;
            roomType.textContent = `${room.type ? room.type.charAt(0).toUpperCase() + room.type.slice(1) : 'Unknown'} (by ${creatorName})`;


            const roomPrompt = document.createElement('div');
            roomPrompt.classList.add('room-prompt');
            roomPrompt.textContent = room.prompt || 'No prompt available';

            const roomActions = document.createElement('div');
            roomActions.classList.add('room-actions');

            const teleportButton = document.createElement('button');
            teleportButton.textContent = room.id === currentRoomId ? 'Current Room' : 'Teleport';
            teleportButton.disabled = room.id === currentRoomId || window.game?.worldManager?.isLoading; 
            teleportButton.onclick = () => {
                if (window.game && window.game.worldManager) {
                    window.game.worldManager.teleportToRoom(room.id);
                    this.toggleRoomGallery(); 
                }
            };

            roomActions.appendChild(teleportButton);

            roomDetails.appendChild(roomName);
            roomDetails.appendChild(roomType);
            roomDetails.appendChild(roomPrompt);
            roomDetails.appendChild(roomActions);

            roomItem.appendChild(roomPreview);
            roomItem.appendChild(roomDetails);

            roomListContainer.appendChild(roomItem);
        });
    }

    showNotification(message, type = 'info', duration = 3000) {
        const existingNotifications = document.querySelectorAll(`.notification.${type}`);
        let shouldCreate = true;
        existingNotifications.forEach(notif => {
            if (notif.textContent === message && !notif.classList.contains('fade-out')) {
                 shouldCreate = false;
            }
        });

        if (!shouldCreate) return;

        const notification = document.createElement('div');
        notification.classList.add('notification', type);
        notification.textContent = message;

        document.body.appendChild(notification);

        const fadeTimer = setTimeout(() => {
            notification.classList.add('fade-out');
        }, duration);

        const removeTimer = setTimeout(() => {
            if (document.body.contains(notification)) {
                document.body.removeChild(notification);
            }
        }, duration + 500); 

        notification.addEventListener('click', () => {
             clearTimeout(fadeTimer);
             clearTimeout(removeTimer);
             notification.classList.add('fade-out');
             setTimeout(() => {
                if (document.body.contains(notification)) {
                     document.body.removeChild(notification);
                 }
             }, 500);
         });
    }

    updateStatus(newStatus) {
        const statusElement = document.getElementById('player-status');
        if (statusElement) {
            statusElement.textContent = `Status: ${newStatus}`;
        } else {
            console.warn("Player status element not found in UI.");
        }
    }
}