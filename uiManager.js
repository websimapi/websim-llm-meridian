export class UIManager {
    constructor() {
        this.uiContainer = document.getElementById('ui-container');
        this.initBasicUI();
    }

    initBasicUI() {
        // Placeholder for initial UI elements
        const statusElement = document.createElement('div');
        statusElement.id = 'player-status';
        statusElement.textContent = 'Status: OK';
        this.uiContainer.appendChild(statusElement);

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

    updateStatus(newStatus) {
        const statusElement = document.getElementById('player-status');
        if (statusElement) {
            statusElement.textContent = `Status: ${newStatus}`;
        }
    }

    // Add methods here to update inventory display, chat messages, etc.
}

