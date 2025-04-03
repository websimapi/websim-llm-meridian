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
            // Keep the prompt focused on single material types
            const materialPrompt = `Describe the primary surface material for floor, walls (if indoor), and ceiling (if indoor) based on this description. Use simple, concise terms (e.g., 'grassy ground', 'stone brick wall', 'wooden plank ceiling', 'cave rock floor'). Respond ONLY with JSON: {"floor": "material", "wall": "material or null", "ceiling": "material or null"}. Description: ${prompt}`;
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
        const textures = {};
        const texturePromises = [];

        // Generate floor texture
        if (materialData.floor) {
            texturePromises.push(
                this.generateTexture(materialData.floor, 'floor')
                    .then(texture => { textures.floor = texture; })
                    .catch(error => {
                        console.error(`Failed to generate floor texture:`, error);
                        textures.floor = this.createPlaceholderTexture('#808080'); // Grey floor placeholder
                    })
            );
        } else {
             textures.floor = this.createPlaceholderTexture('#808080'); // Fallback if floor material is missing
        }

        // Generate wall texture (if applicable)
        if (type === 'indoor' && materialData.wall) {
            texturePromises.push(
                 this.generateTexture(materialData.wall, 'wall')
                    .then(texture => { textures.wall = texture; })
                    .catch(error => {
                        console.error(`Failed to generate wall texture:`, error);
                        textures.wall = this.createPlaceholderTexture('#A0A0A0'); // Lighter grey wall placeholder
                    })
            );
        } else {
             textures.wall = null;
        }

         // Generate ceiling texture (if applicable)
         if (type === 'indoor' && materialData.ceiling) {
            texturePromises.push(
                 this.generateTexture(materialData.ceiling, 'ceiling')
                    .then(texture => { textures.ceiling = texture; })
                    .catch(error => {
                        console.error(`Failed to generate ceiling texture:`, error);
                        textures.ceiling = this.createPlaceholderTexture('#555555'); // Dark grey ceiling placeholder
                    })
            );
        } else {
             textures.ceiling = null;
        }


        await Promise.all(texturePromises);

        // Ensure essential textures have placeholders if generation failed entirely (already handled in catch blocks, but double-check)
        if (!textures.floor) textures.floor = this.createPlaceholderTexture('#808080');
        if (type === 'indoor' && materialData.wall && !textures.wall) textures.wall = this.createPlaceholderTexture('#A0A0A0');


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

    async generateTexture(materialDescription, context = 'unknown') {
        console.log(`Generating texture for ${context} based on material: "${materialDescription}"`);

        // Refined prompt focusing on seamless tiling from all directions
        const textureGenPrompt = `Seamless repeating tileable texture pattern, ${context}-view perspective (e.g., top-down for floor, front-facing for wall), photorealistic game asset style, representing: ${materialDescription}. The texture must tile perfectly horizontally and vertically.`;

        try {
            // Use a square aspect ratio for seamless textures
            const result = await websim.imageGen({
                prompt: textureGenPrompt,
                 width: 512, // Power of 2 often good for textures
                 height: 512,
            });

            if (result && result.url) {
                // Load the generated image URL into a THREE.Texture
                return new Promise((resolve, reject) => {
                    this.textureLoader.load(
                        result.url,
                        (texture) => {
                            texture.colorSpace = THREE.SRGBColorSpace; // Ensure correct color space
                            texture.wrapS = THREE.RepeatWrapping;
                            texture.wrapT = THREE.RepeatWrapping;
                            // Adjust repeat based on typical texture scale and tile size
                            // If tile is 20x20 units, and texture represents maybe 2x2 units, repeat = 10
                            const textureScale = 2; // Assumed real-world size (in meters/units) represented by the 512x512 texture
                            const repeatValue = 20 / textureScale; // Example: worldManager.tileSize / textureScale
                            texture.repeat.set(repeatValue, repeatValue);
                            console.log(`Successfully loaded ${context} texture for material: "${materialDescription}"`);
                            resolve(texture);
                        },
                        undefined, // onProgress callback currently not supported for imageGen
                        (err) => {
                             console.error(`Error loading texture from URL ${result.url} for ${context} material "${materialDescription}":`, err);
                             console.warn(`Falling back to placeholder texture for ${context} due to load error.`);
                             resolve(this.createPlaceholderTexture()); // Resolve with placeholder on load error
                        }
                    );
                });
            } else {
                 throw new Error("Image generation failed or returned no URL.");
            }
        } catch (error) {
             console.error(`websim.imageGen failed for prompt "${textureGenPrompt}" (context: ${context}):`, error);
             console.warn(`Falling back to placeholder texture for ${context} due to image generation error.`);
             return this.createPlaceholderTexture(); // Return placeholder on generation error
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
        texture.colorSpace = THREE.SRGBColorSpace; // Match color space
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        const textureScale = 2;
        const repeatValue = 20 / textureScale; // Match repeat calculation
        texture.repeat.set(repeatValue, repeatValue);
        return texture;
    }
}