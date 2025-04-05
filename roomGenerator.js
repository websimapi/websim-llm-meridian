import * as THREE from 'three';

// Define default textures as constants for reuse
const DEFAULT_FLOOR_PLACEHOLDER_COLOR = '#808080';
const DEFAULT_WALL_PLACEHOLDER_COLOR = '#A0A0A0';
const DEFAULT_CEILING_PLACEHOLDER_COLOR = '#555555';

export class RoomGenerator {
    constructor() {
        this.textureLoader = new THREE.TextureLoader();
    }

    async generateRoomData(prompt, type = 'outdoor') {
        console.log(`Generating room data for: "${prompt}" (Type: ${type})`);
        let generatedTextures = { floor: null, wall: null, ceiling: null, sky: null }; // Store generated THREE.Texture objects

        try {
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
                if (typeof materialData.floor !== 'string' || !materialData.floor) materialData.floor = 'generic floor';
                if (type === 'outdoor') {
                    materialData.wall = null;
                    materialData.ceiling = null;
                    if (typeof materialData.sky !== 'string' || !materialData.sky) materialData.sky = 'clear blue sky'; // Default outdoor sky
                } else { // indoor
                    if (typeof materialData.wall !== 'string' || !materialData.wall) materialData.wall = 'generic wall';
                    if (typeof materialData.ceiling !== 'string') materialData.ceiling = null; // Allow null ceiling
                    materialData.sky = null; // No sky indoors
                }
                console.log("LLM suggested materials:", materialData);

            } catch (error) {
                console.error("LLM failed to extract materials, using defaults:", error);
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
                sky: type === 'outdoor' && materialData.sky
                    ? `High-resolution 360-degree equirectangular panorama, photorealistic style, game environment background, ultra-detailed, immersive view. Scene description: ${materialData.sky}. Ensure seamless wrapping.`
                    : null,
            };

            const texturePromises = [];

            for (const [key, texturePrompt] of Object.entries(texturePrompts)) {
                if (texturePrompt) {
                    const isSkybox = key === 'sky';
                    texturePromises.push(
                        this.generateTexture(texturePrompt, key, isSkybox) // Pass key and skybox flag
                            .then(texture => { generatedTextures[key] = texture; }) // Store the generated THREE.Texture
                            .catch(error => {
                                console.error(`Failed generation chain for ${key} texture:`, error);
                                // Placeholder logic moved inside generateTexture's catch block
                                generatedTextures[key] = null; // Ensure it's null if generation fails completely
                            })
                    );
                } else {
                    generatedTextures[key] = null; // Set to null if no prompt
                }
            }

            await Promise.all(texturePromises);

            // Ensure essential textures have placeholders *if generation failed AND they are required*
            if (!generatedTextures.floor) {
                console.warn("Floor generation failed, creating placeholder.");
                generatedTextures.floor = this.createPlaceholderTexture(DEFAULT_FLOOR_PLACEHOLDER_COLOR);
            }
            if (type === 'indoor' && materialData.wall && !generatedTextures.wall) {
                console.warn("Wall generation failed for indoor room, creating placeholder.");
                generatedTextures.wall = this.createPlaceholderTexture(DEFAULT_WALL_PLACEHOLDER_COLOR);
            }
            // Use placeholder ceiling if prompt existed but generation failed
            if (type === 'indoor' && materialData.ceiling && !generatedTextures.ceiling) {
                console.warn("Ceiling generation failed for indoor room, creating placeholder.");
                generatedTextures.ceiling = this.createPlaceholderTexture(DEFAULT_CEILING_PLACEHOLDER_COLOR);
            }

            // 3. Generate Room Structure (Simplified for now)
            const structure = {
                type: type,
                dimensions: { width: 50, depth: 50, height: (type === 'indoor' ? 4 : 0) },
            };

            // 4. Generate Objects (Simplified for now)
            const objects = [];

            console.log("Finished generating texture objects:", {
                floor: generatedTextures.floor ? generatedTextures.floor.uuid : null,
                wall: generatedTextures.wall ? generatedTextures.wall.uuid : null,
                ceiling: generatedTextures.ceiling ? generatedTextures.ceiling.uuid : null,
                sky: generatedTextures.sky ? generatedTextures.sky.uuid : null
            });

            // Return data including the actual THREE.Texture objects
            // These will be uploaded and replaced with URLs by WorldManager.addRoomToSharedState
            return {
                prompt: prompt,
                type: type,
                textures: generatedTextures, // Pass the actual THREE.Texture objects
                structure: structure,
                objects: objects,
            };

        } catch (error) {
            console.error("Major error during room data generation:", error);
            // Clean up any textures that might have been partially generated before error
            Object.values(generatedTextures).forEach(tex => tex?.dispose());
            throw error; // Re-throw error to be caught by the caller
        }
    }

    async generateTexture(prompt, context = 'unknown', isSkybox = false) {
        console.log(`Generating texture for ${context} with prompt: "${prompt}"`);
        try {
            const imageOptions = { prompt };
            if (isSkybox) {
                imageOptions.width = 2048; // Adjusted skybox resolution
                imageOptions.height = 1024;
            } else {
                imageOptions.width = 512;
                imageOptions.height = 512;
            }

            const result = await websim.imageGen(imageOptions);

            if (!result || !result.url) {
                throw new Error("Image generation failed or returned no URL.");
            }

            // Load the generated image URL into a THREE.Texture
            const texture = await new Promise((resolve, reject) => {
                this.textureLoader.load(
                    result.url,
                    (loadedTexture) => {
                        console.log(`Successfully loaded texture from URL for ${context}`);
                        if (isSkybox) {
                            loadedTexture.mapping = THREE.EquirectangularReflectionMapping;
                            // Apply seam processing *after* loading, *before* resolving
                            this.processSkyboxSeam(loadedTexture);
                        } else {
                            loadedTexture.wrapS = THREE.RepeatWrapping;
                            loadedTexture.wrapT = THREE.RepeatWrapping;
                            const textureScale = 2;
                            const repeatValue = 50 / textureScale; // Use tileSize (50)
                            loadedTexture.repeat.set(repeatValue, repeatValue);
                        }
                        resolve(loadedTexture); // Resolve with the processed texture
                    },
                    undefined, // onProgress
                    (err) => {
                        console.error(`Error loading texture from URL ${result.url} for ${context}:`, err);
                        reject(new Error(`Failed to load texture image for ${context}`)); // Reject on load error
                    }
                );
            });
            return texture; // Return the successfully loaded and processed texture

        } catch (error) {
            console.error(`Texture generation/loading failed for ${context}:`, error);
            // Fallback to placeholder only for essential types here, otherwise return null
            if (context === 'floor') {
                console.warn(`Falling back to placeholder texture for ${context}.`);
                return this.createPlaceholderTexture(DEFAULT_FLOOR_PLACEHOLDER_COLOR);
            } else if (context === 'wall') { // Only essential if indoor, handled later
                console.warn(`Falling back to placeholder texture for ${context}.`);
                return this.createPlaceholderTexture(DEFAULT_WALL_PLACEHOLDER_COLOR);
            } else if (context === 'ceiling') { // Only essential if indoor, handled later
                console.warn(`Falling back to placeholder texture for ${context}.`);
                return this.createPlaceholderTexture(DEFAULT_CEILING_PLACEHOLDER_COLOR);
            }
            // Skybox failure results in null, handled by WorldManager background setting
            return null;
        }
    }

    processSkyboxSeam(texture) {
        const image = texture.image;
        if (!(image instanceof HTMLImageElement || image instanceof HTMLCanvasElement || image instanceof ImageBitmap) || (image instanceof HTMLImageElement && !image.complete)) {
            console.warn("Skybox texture image not ready or not a processable type for seam processing:", image);
            return;
        }

        // Check if already processed (simple check based on if it's a canvas)
        if (image instanceof HTMLCanvasElement && image.dataset.processedSeam === 'true') {
            console.log("Skybox seam already processed, skipping.");
            return;
        }

        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d');

        try {
            ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        } catch (e) {
            console.error("Error drawing skybox image to canvas for seam processing:", e);
            return;
        }

        const blendWidth = Math.max(1, Math.floor(image.width * 0.15)); // Ensure blendWidth is at least 1px
        const fogColorOpaque = 'rgba(210, 210, 210, 1.0)';
        const fogColorTransparent = 'rgba(210, 210, 210, 0.0)';

        const leftGradient = ctx.createLinearGradient(0, 0, blendWidth, 0);
        leftGradient.addColorStop(0, fogColorOpaque);
        leftGradient.addColorStop(0.1, fogColorOpaque);
        leftGradient.addColorStop(1, fogColorTransparent);

        const rightGradient = ctx.createLinearGradient(image.width, 0, image.width - blendWidth, 0);
        rightGradient.addColorStop(0, fogColorOpaque);
        rightGradient.addColorStop(0.1, fogColorOpaque);
        rightGradient.addColorStop(1, fogColorTransparent);

        ctx.fillStyle = leftGradient;
        ctx.fillRect(0, 0, blendWidth, image.height);

        ctx.fillStyle = rightGradient;
        ctx.fillRect(image.width - blendWidth, 0, blendWidth, image.height);

        canvas.dataset.processedSeam = 'true'; // Mark canvas as processed

        texture.image = canvas;
        texture.needsUpdate = true;
        console.log(`Processed skybox seam with fog (Canvas: ${canvas.width}x${canvas.height})`);
    }

    createPlaceholderTexture(color = '#FF00FF') { // Default to magenta
        console.warn(`Creating placeholder texture with color ${color}.`);
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const context = canvas.getContext('2d');

        // Simple checkerboard pattern
        context.fillStyle = color;
        context.fillRect(0, 0, 64, 64);
        context.fillStyle = 'rgba(0,0,0,0.15)'; // Slightly darker shade
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
        const repeatValue = 50 / textureScale;
        texture.repeat.set(repeatValue, repeatValue);
        texture.needsUpdate = true; // Ensure canvas is uploaded to GPU
        return texture;
    }
}