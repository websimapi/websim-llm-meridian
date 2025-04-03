import * as THREE from 'three';

export class RoomGenerator {
    constructor() {
        this.textureLoader = new THREE.TextureLoader();
        this.defaultTextureUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='; // 1x1 transparent png
    }

    async generateRoomData(prompt, type = 'outdoor') {
        console.log(`Generating room data for: "${prompt}" (Type: ${type})`);

        // 1. Generate Textures using LLM Image Generation
        const texturePrompts = {
            floor: `Seamless floor texture for a ${prompt}`,
            wall: type === 'indoor' ? `Seamless wall texture for a ${prompt}` : null,
            // Ceiling: Indoor ceilings might be solid colors or simple patterns,
            // or transparent if looking up reveals sky (even indoors sometimes)
            // Let's try generating one for indoor, otherwise null.
            ceiling: type === 'indoor' ? `Seamless ceiling texture for a ${prompt}` : null,
        };

        const textures = {};
        const texturePromises = [];

        for (const [key, texturePrompt] of Object.entries(texturePrompts)) {
            if (texturePrompt) {
                texturePromises.push(
                    this.generateTexture(texturePrompt)
                        .then(texture => { textures[key] = texture; })
                        .catch(error => {
                            console.error(`Failed to generate ${key} texture:`, error);
                            textures[key] = this.createPlaceholderTexture(); // Use placeholder on failure
                        })
                );
            } else {
                 textures[key] = null; // Set to null if no prompt (e.g., outdoor wall/ceiling)
            }
        }

        await Promise.all(texturePromises);

        // Ensure essential textures have placeholders if generation failed entirely
        if (!textures.floor) textures.floor = this.createPlaceholderTexture('#808080'); // Grey floor
        if (type === 'indoor' && !textures.wall) textures.wall = this.createPlaceholderTexture('#A0A0A0'); // Lighter grey wall
        if (type === 'indoor' && !textures.ceiling) {
            // Default indoor ceiling: null (will be handled by WorldManager as solid color)
             textures.ceiling = null;
        }


        // 2. Generate Room Structure (Simplified for now)
        // TODO: Use LLM to generate a simple layout (e.g., dimensions, door positions, basic shapes)
        const structure = {
             type: type, // 'indoor' or 'outdoor'
             dimensions: { width: 20, depth: 20, height: 3 }, // Example dimensions
             // Future: exits: [{ direction: 'north', connectsTo: 'prompt for next room' }], shape: 'rectangular' | 'L-shaped' etc.
        };

        // 3. Generate Objects (Simplified for now)
        // TODO: Use LLM to generate a list of simple objects and their approximate positions
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

    async generateTexture(prompt) {
        console.log(`Generating texture for prompt: "${prompt}"`);
        try {
            // Use a square aspect ratio for seamless textures
            const result = await websim.imageGen({
                prompt: prompt + ", photorealistic, game texture, seamless tiling",
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
                            texture.repeat.set(4, 4); // Example tiling, adjust as needed
                            console.log(`Successfully loaded texture for: "${prompt}"`);
                            resolve(texture);
                        },
                        undefined, // onProgress callback currently not supported for imageGen
                        (err) => {
                             console.error(`Error loading texture from URL ${result.url}:`, err);
                             reject(err); // Reject the promise on texture load error
                        }
                    );
                });
            } else {
                 throw new Error("Image generation failed or returned no URL.");
            }
        } catch (error) {
             console.error(`websim.imageGen failed for prompt "${prompt}":`, error);
            throw error; // Re-throw the error to be caught by the caller
        }
    }

     createPlaceholderTexture(color = '#FF00FF') { // Default to magenta for visibility
         console.warn("Creating placeholder texture.");
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const context = canvas.getContext('2d');

        // Simple pattern (e.g., checkerboard or solid color)
        context.fillStyle = color;
        context.fillRect(0, 0, 64, 64);
         context.fillStyle = '#000000'; // Black squares
         for (let i = 0; i < 64; i += 16) {
             for (let j = 0; j < 64; j += 16) {
                 if ((i / 16 + j / 16) % 2 === 0) {
                     context.fillRect(i, j, 16, 16);
                 }
             }
         }


        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(4, 4);
        return texture;
    }
}

