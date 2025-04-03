import * as THREE from 'three';

export class RoomGenerator {
    constructor() {
        this.textureLoader = new THREE.TextureLoader();
        this.defaultTextureUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='; // 1x1 transparent png
    }

    async generateRoomData(prompt, type = 'outdoor') {
        console.log(`Generating room data for: "${prompt}" (Type: ${type})`);

        // 1. Use LLM to determine base texture materials
        let materialData = { floor: 'generic floor', wall: null, ceiling: null }; // Defaults
        try {
            const materialPrompt = `Analyze the following room description and extract the primary material or appearance for the floor, walls (if indoor), and ceiling (if indoor). Respond ONLY with JSON in the format: {"floor": "material description", "wall": "material description or null", "ceiling": "material description or null"}. Be concise, focusing on the texture name (e.g., 'grass', 'stone bricks', 'damp cave wall', 'wooden planks'). If a surface isn't applicable (like outdoor walls/ceiling) or unclear, use null. Description: ${prompt}`;
            const completion = await websim.chat.completions.create({
                messages: [{ role: "user", content: materialPrompt }],
                json: true,
            });
            materialData = JSON.parse(completion.content);
            // Basic validation
            if (typeof materialData.floor !== 'string') materialData.floor = 'generic floor';
             if (type === 'outdoor') {
                 materialData.wall = null;
                 materialData.ceiling = null;
             } else {
                if (typeof materialData.wall !== 'string') materialData.wall = 'generic wall';
                // Allow ceiling to be null or string
                if (typeof materialData.ceiling !== 'string') materialData.ceiling = null;
             }

            console.log("LLM suggested materials:", materialData);
        } catch (error) {
            console.error("LLM failed to extract materials, using defaults:", error);
             // Use defaults defined above if LLM fails
             if (type === 'indoor') {
                materialData.wall = 'generic wall';
                // Leave ceiling as null default for indoor if LLM fails
             }
        }

        // 2. Generate Textures using derived materials
        const texturePrompts = {
            floor: `Seamless tiling texture pattern, game asset style, ${materialData.floor}`,
            wall: type === 'indoor' && materialData.wall ? `Seamless tiling texture pattern, game asset style, ${materialData.wall}` : null,
            ceiling: type === 'indoor' && materialData.ceiling ? `Seamless tiling texture pattern, game asset style, ${materialData.ceiling}` : null,
        };

        const textures = {};
        const texturePromises = [];

        for (const [key, texturePrompt] of Object.entries(texturePrompts)) {
            if (texturePrompt) {
                texturePromises.push(
                    this.generateTexture(texturePrompt, key) // Pass key for context in error messages
                        .then(texture => { textures[key] = texture; })
                        .catch(error => {
                            console.error(`Failed to generate ${key} texture with prompt "${texturePrompt}":`, error);
                            textures[key] = this.createPlaceholderTexture(key === 'floor' ? '#808080' : '#A0A0A0'); // Use placeholder on failure
                        })
                );
            } else {
                 textures[key] = null; // Set to null if no prompt
            }
        }

        await Promise.all(texturePromises);

        // Ensure essential textures have placeholders if generation failed entirely
        if (!textures.floor) textures.floor = this.createPlaceholderTexture('#808080'); // Grey floor
        if (type === 'indoor' && materialData.wall && !textures.wall) textures.wall = this.createPlaceholderTexture('#A0A0A0'); // Lighter grey wall
        // Ceiling remains null if not generated or applicable

        // 3. Generate Room Structure (Simplified for now)
        const structure = {
             type: type, // 'indoor' or 'outdoor'
             dimensions: { width: 20, depth: 20, height: 3 }, // Example dimensions
             // Future: exits: [{ direction: 'north', connectsTo: 'prompt for next room' }], shape: 'rectangular' | 'L-shaped' etc.
        };

        // 4. Generate Objects (Simplified for now)
        const objects = [
            // Example: { type: 'chair', position: { x: 2, y: 0, z: 3 }, prompt: 'a simple wooden chair' }
        ];

        console.log("Generated textures:", textures);

        return {
            prompt: prompt,
            type: type,
            textures: textures,
            structure: structure,
            objects: objects,
        };
    }

    async generateTexture(prompt, context = 'unknown') {
        console.log(`Generating texture for ${context} with prompt: "${prompt}"`);
        // Prompt already constructed to emphasize seamless tiling texture pattern
        const textureGenPrompt = prompt;
        try {
            // Use a square aspect ratio for seamless textures
            const result = await websim.imageGen({
                prompt: textureGenPrompt,
                 width: 512, // Power of 2 often good for textures
                 height: 512,
                // seed: Date.now() // Optional: use seed for reproducibility if needed
            });

            if (result && result.url) {
                // Load the generated image URL into a THREE.Texture
                return new Promise((resolve, reject) => {
                    this.textureLoader.load(
                        result.url,
                        (texture) => {
                            texture.wrapS = THREE.RepeatWrapping;
                            texture.wrapT = THREE.RepeatWrapping;
                            // Adjust repeat based on typical texture scale and tile size
                            const textureScale = 2; // Assumed real-world size represented by the 512x512 texture
                            const repeatValue = 50 / textureScale; // Updated to match new tileSize of 50
                            texture.repeat.set(repeatValue, repeatValue);
                            console.log(`Successfully loaded ${context} texture for: "${prompt}"`);
                            resolve(texture);
                        },
                        undefined, // onProgress callback currently not supported for imageGen
                        (err) => {
                             console.error(`Error loading texture from URL ${result.url} for ${context}:`, err);
                             // Resolve with placeholder on load error to prevent breaking the build process
                             console.warn(`Falling back to placeholder texture for ${context} due to load error.`);
                             resolve(this.createPlaceholderTexture());
                        }
                    );
                });
            } else {
                 throw new Error("Image generation failed or returned no URL.");
            }
        } catch (error) {
             console.error(`websim.imageGen failed for prompt "${textureGenPrompt}" (context: ${context}):`, error);
             // Return placeholder on generation error
             console.warn(`Falling back to placeholder texture for ${context} due to image generation error.`);
             return this.createPlaceholderTexture(); // Use placeholder on failure
        }
    }

     createPlaceholderTexture(color = '#FF00FF') { // Default to magenta for visibility
         console.warn(`Creating placeholder texture with color ${color}.`);
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const context = canvas.getContext('2d');

        // Simple checkerboard pattern
        context.fillStyle = color;
        context.fillRect(0, 0, 64, 64);
        context.fillStyle = 'rgba(0,0,0,0.2)'; // Slightly darker shade for contrast
        for (let i = 0; i < 4; i++) {
             for (let j = 0; j < 4; j++) {
                 if ((i + j) % 2 === 0) {
                     context.fillRect(i * 16, j * 16, 16, 16);
                 }
             }
         }

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        const textureScale = 2;
        const repeatValue = 50 / textureScale; // Updated to match new tileSize of 50
        texture.repeat.set(repeatValue, repeatValue);
        return texture;
    }
}