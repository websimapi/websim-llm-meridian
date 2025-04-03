import * as THREE from 'three';

export class RoomGenerator {
    constructor() {
        this.textureLoader = new THREE.TextureLoader();
        this.defaultTextureUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='; // 1x1 transparent png
    }

    async generateRoomData(prompt, type = 'outdoor') {
        console.log(`Generating room data for: "${prompt}" (Type: ${type})`);

        // 1. Use LLM to determine base texture materials and sky description
        let materialData = { floor: 'generic floor', wall: null, ceiling: null, sky: null }; // Defaults
        try {
            const materialPrompt = `Analyze the following scene description and extract the primary material or appearance for the floor, walls (if indoor), ceiling (if indoor), and the sky (if outdoor). Respond ONLY with JSON in the format: {"floor": "material description", "wall": "material description or null", "ceiling": "material description or null", "sky": "sky description or null"}. Be concise, focusing on the texture name (e.g., 'grassy ground', 'stone bricks', 'damp cave wall', 'clear blue sky with clouds', 'starry night sky'). If a surface isn't applicable or unclear, use null. Description: ${prompt}`;
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
                 if (typeof materialData.sky !== 'string') materialData.sky = 'clear blue sky'; // Default outdoor sky
             } else {
                 if (typeof materialData.wall !== 'string') materialData.wall = 'generic wall';
                 if (typeof materialData.ceiling !== 'string') materialData.ceiling = null; // Allow null ceiling
                 materialData.sky = null; // No sky indoors
             }

            console.log("LLM suggested materials:", materialData);
        } catch (error) {
            console.error("LLM failed to extract materials, using defaults:", error);
             // Use defaults defined above if LLM fails
             if (type === 'indoor') {
                materialData.wall = 'generic wall';
             } else { // outdoor default
                 materialData.sky = 'clear blue sky';
             }
        }


        // 2. Generate Textures using derived materials
        const texturePrompts = {
            floor: `Seamless tiling texture pattern, game asset style, ${materialData.floor}`,
            wall: type === 'indoor' && materialData.wall ? `Seamless tiling texture pattern, game asset style, ${materialData.wall}` : null,
            ceiling: type === 'indoor' && materialData.ceiling ? `Seamless tiling texture pattern, game asset style, ${materialData.ceiling}` : null,
            // Enhanced Skybox Prompt
            sky: type === 'outdoor' && materialData.sky
                ? `High-resolution 360-degree equirectangular panorama, photorealistic style, game environment background, ultra-detailed, immersive view. Scene description: ${materialData.sky}. Ensure seamless wrapping.`
                : null,
        };

        const textures = { floor: null, wall: null, ceiling: null, sky: null }; // Initialize all keys
        const texturePromises = [];

        for (const [key, texturePrompt] of Object.entries(texturePrompts)) {
            if (texturePrompt) {
                 const isSkybox = key === 'sky';
                texturePromises.push(
                    this.generateTexture(texturePrompt, key, isSkybox) // Pass key and skybox flag
                        .then(texture => { textures[key] = texture; })
                        .catch(error => {
                            console.error(`Failed to generate ${key} texture with prompt "${texturePrompt}":`, error);
                            // Use placeholder only for essential textures, sky can be null/default color
                             if (key === 'floor' || (type === 'indoor' && key === 'wall')) {
                                textures[key] = this.createPlaceholderTexture(key === 'floor' ? '#808080' : '#A0A0A0');
                             } else {
                                 textures[key] = null; // Allow sky/ceiling to fail gracefully
                             }
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
        // Sky and Ceiling remain null if not generated or applicable

        // 3. Generate Room Structure (Simplified for now)
        const structure = {
             type: type,
             dimensions: { width: 50, depth: 50, height: (type === 'indoor' ? 4 : 0) }, // Use tileSize, adjust height
             // Future: exits: [{ direction: 'north', connectsTo: 'prompt for next room' }], shape: 'rectangular' | 'L-shaped' etc.
        };

        // 4. Generate Objects (Simplified for now)
        const objects = [
            // Example: { type: 'chair', position: { x: 2, y: 0, z: 3 }, prompt: 'a simple wooden chair' }
        ];

        console.log("Generated textures:", {
             floor: textures.floor ? textures.floor.uuid : null, // Log UUIDs instead of full objects
             wall: textures.wall ? textures.wall.uuid : null,
             ceiling: textures.ceiling ? textures.ceiling.uuid : null,
             sky: textures.sky ? textures.sky.uuid : null
         });

        return {
            prompt: prompt,
            type: type,
            textures: textures, // Pass the actual THREE.Texture objects initially
            structure: structure,
            objects: objects,
        };
    }

    async generateTexture(prompt, context = 'unknown', isSkybox = false) {
        console.log(`Generating texture for ${context} with prompt: "${prompt}"`);
        const textureGenPrompt = prompt;
        try {
            const imageOptions = {
                 prompt: textureGenPrompt,
                 // seed: Date.now() // Optional: use seed for reproducibility if needed
             };

            if (isSkybox) {
                // Use higher resolution 2:1 aspect ratio for equirectangular images
                imageOptions.width = 4096; // Increased resolution
                imageOptions.height = 2048; // Increased resolution
                console.log(`Requesting skybox with dimensions: ${imageOptions.width}x${imageOptions.height}`);
            } else {
                // Square aspect ratio for seamless tiling textures
                imageOptions.width = 512; // Power of 2 often good for textures
                imageOptions.height = 512;
            }

            const result = await websim.imageGen(imageOptions);

            if (result && result.url) {
                // Load the generated image URL into a THREE.Texture
                return new Promise((resolve, reject) => {
                    this.textureLoader.load(
                        result.url,
                        (texture) => {
                             if (isSkybox) {
                                 texture.mapping = THREE.EquirectangularReflectionMapping;
                                 // Process skybox to hide seam line
                                 this.processSkyboxSeam(texture);
                                 // No repeat for skybox
                             } else {
                                texture.wrapS = THREE.RepeatWrapping;
                                texture.wrapT = THREE.RepeatWrapping;
                                // Adjust repeat based on typical texture scale and tile size
                                const textureScale = 2; // Assumed real-world size represented by the texture
                                const repeatValue = 50 / textureScale; // Use tileSize (50)
                                texture.repeat.set(repeatValue, repeatValue);
                             }
                             console.log(`Successfully loaded ${context} texture for: "${prompt}"`);
                            resolve(texture);
                        },
                        undefined, // onProgress callback currently not supported for imageGen
                        (err) => {
                             console.error(`Error loading texture from URL ${result.url} for ${context}:`, err);
                             // Resolve with placeholder on load error for essential textures
                             console.warn(`Falling back to placeholder texture for ${context} due to load error.`);
                              if (context === 'floor' || context === 'wall') {
                                 resolve(this.createPlaceholderTexture());
                              } else {
                                 resolve(null); // Allow sky/ceiling to fail to null
                              }
                        }
                    );
                });
            } else {
                 throw new Error("Image generation failed or returned no URL.");
            }
        } catch (error) {
             console.error(`websim.imageGen failed for prompt "${textureGenPrompt}" (context: ${context}):`, error);
             // Return placeholder on generation error for essential textures
             console.warn(`Falling back to placeholder texture for ${context} due to image generation error.`);
             if (context === 'floor' || context === 'wall') {
                 return this.createPlaceholderTexture();
             } else {
                 return null; // Allow sky/ceiling to fail to null
             }
        }
    }

    processSkyboxSeam(texture) {
        // Create a temporary canvas to process the skybox image
        const image = texture.image;
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d');

        // Draw the original image to the canvas
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

        // Create a gradient at the left and right edges to hide the seam
        // Calculate blend width for 45 degrees (45/360 = 1/8 of the width)
        const blendWidth = Math.floor(image.width / 8); // 1/8th of the width for 45 degrees blend

        console.log(`Processing skybox seam with 45-degree blend width: ${blendWidth}px`);

        // Left edge gradient (seam start) - Blend from left edge inward
        const leftGradient = ctx.createLinearGradient(0, 0, blendWidth, 0);
        // Using a more subtle alpha blend
        leftGradient.addColorStop(0, 'rgba(255, 255, 255, 0.7)'); // Start semi-transparent
        leftGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');   // End fully transparent

        // Right edge gradient (seam end) - Blend from right edge inward
        const rightGradient = ctx.createLinearGradient(image.width, 0, image.width - blendWidth, 0);
        // Using a more subtle alpha blend
        rightGradient.addColorStop(0, 'rgba(255, 255, 255, 0.7)'); // Start semi-transparent
        rightGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');   // End fully transparent

        // Apply the gradients over the existing image
        // Use 'source-over' (default) blending which draws the gradient on top
        ctx.fillStyle = leftGradient;
        ctx.fillRect(0, 0, blendWidth, image.height);

        ctx.fillStyle = rightGradient;
        ctx.fillRect(image.width - blendWidth, 0, blendWidth, image.height);

        // Update the texture with the processed canvas
        texture.image = canvas;
        texture.needsUpdate = true;
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