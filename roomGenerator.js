import * as THREE from 'three';

export class RoomGenerator {
    constructor() {
        this.textureLoader = new THREE.TextureLoader();
        this.defaultTextureUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='; // 1x1 transparent png
    }

    async generateCloudTexture() {
        const prompt = "Seamless tiling texture, photorealistic fluffy white cumulus clouds scattered across a transparent background, alpha channel for transparency, detailed edges, suitable for 3D sky.";
        console.log(`Generating cloud texture with prompt: "${prompt}"`);
        try {
            const result = await websim.imageGen({
                prompt: prompt,
                width: 512,
                height: 512,
                // negative_prompt: "solid background, blue sky, uniform color" // Help ensure transparency
            });

            if (result && result.url) {
                return new Promise((resolve, reject) => {
                    this.textureLoader.load(
                        result.url,
                        (texture) => {
                            texture.wrapS = THREE.RepeatWrapping;
                            texture.wrapT = THREE.RepeatWrapping;
                            console.log(`Successfully loaded cloud texture.`);
                            resolve(texture);
                        },
                        undefined,
                        (err) => {
                            console.error(`Error loading cloud texture from URL ${result.url}:`, err);
                            reject(err); // Reject on load error
                        }
                    );
                });
            } else {
                throw new Error("Cloud texture generation failed or returned no URL.");
            }
        } catch (error) {
            console.error(`websim.imageGen failed for cloud texture:`, error);
            // Optionally return a placeholder or null, but for clouds maybe failing is acceptable
            return null; // Allow clouds to be skipped if generation fails
        }
    }

    async generateRoomData(prompt, type = 'outdoor') {
        console.log(`Generating room data for: "${prompt}" (Type: ${type})`);

        // 1. Use LLM to determine base texture materials and sky description
        let materialData = { floor: 'generic floor', wall: null, ceiling: null, sky: null }; // Defaults
        try {
            // Refined prompt for better extraction
            const materialPrompt = `Analyze the scene description. Extract primary materials/appearances for floor, walls (if indoor), ceiling (if indoor), and sky (if outdoor/applicable). Respond ONLY with JSON: {"floor": "description", "wall": "description or null", "ceiling": "description or null", "sky": "description or null"}. Examples: 'grassy ground', 'stone bricks', 'wooden planks', 'cave wall', 'plaster ceiling', 'clear blue sky with clouds', 'starry night sky', 'overcast grey sky'. Use null if not applicable. Description: ${prompt}`;
            const completion = await websim.chat.completions.create({
                messages: [{ role: "user", content: materialPrompt }],
                json: true, // Expect JSON output directly
            });

            // Parse and validate the JSON response
            let parsedData = {};
            if (typeof completion.content === 'string') {
                try {
                    parsedData = JSON.parse(completion.content);
                } catch (parseError) {
                    console.error("LLM response was not valid JSON:", completion.content, parseError);
                    throw new Error("LLM returned invalid material data format.");
                }
            } else if (typeof completion.content === 'object' && completion.content !== null) {
                // Handle cases where the API might return an object directly if json: true is fully supported
                parsedData = completion.content;
            } else {
                throw new Error("LLM returned unexpected material data format.");
            }

            // Validate and apply defaults
            materialData.floor = typeof parsedData.floor === 'string' ? parsedData.floor : 'generic floor';
            if (type === 'outdoor') {
                materialData.wall = null;
                materialData.ceiling = null;
                materialData.sky = typeof parsedData.sky === 'string' ? parsedData.sky : 'clear blue sky'; // Default outdoor sky
            } else { // indoor
                materialData.wall = typeof parsedData.wall === 'string' ? parsedData.wall : 'generic wall';
                materialData.ceiling = typeof parsedData.ceiling === 'string' ? parsedData.ceiling : null; // Allow null ceiling
                materialData.sky = null; // No sky indoors
            }

            console.log("LLM suggested materials:", materialData);
        } catch (error) {
            console.error("LLM failed to extract materials, using defaults:", error);
            // Use defaults defined above if LLM fails
            if (type === 'indoor') {
                if (!materialData.wall) materialData.wall = 'generic wall';
            } else { // outdoor default
                if (!materialData.sky) materialData.sky = 'clear blue sky';
            }
            // Floor default is already set
        }

        // 2. Generate Textures using derived materials
        const texturePrompts = {
            floor: `Seamless tiling texture pattern, game asset style, photorealistic, ${materialData.floor}`, // Added photorealistic
            wall: type === 'indoor' && materialData.wall ? `Seamless tiling texture pattern, game asset style, photorealistic, ${materialData.wall}` : null,
            ceiling: type === 'indoor' && materialData.ceiling ? `Seamless tiling texture pattern, game asset style, photorealistic, ${materialData.ceiling}` : null,
            // Skybox Prompt remains the same, focusing on description
            sky: type === 'outdoor' && materialData.sky
                ? `High-resolution 360-degree equirectangular panorama, photorealistic style, game environment background, ultra-detailed, immersive view. Scene description: ${materialData.sky}. Ensure seamless wrapping horizontally.`
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
                            console.error(`Failed to generate or load ${key} texture for prompt "${texturePrompt}":`, error);
                            // Use placeholder only for essential textures
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
        };

        // 4. Generate Objects (Placeholder)
        const objects = [];

        console.log("Generated textures (UUIDs):", {
            floor: textures.floor?.uuid || null,
            wall: textures.wall?.uuid || null,
            ceiling: textures.ceiling?.uuid || null,
            sky: textures.sky?.uuid || null
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
        try {
            const imageOptions = {
                prompt: prompt,
                // n: 1, // Generate one image
                // response_format: 'url', // Already default?
            };

            if (isSkybox) {
                // High-res equirectangular
                imageOptions.width = 4096; // Keep high res
                imageOptions.height = 2048;
                console.log(`Requesting skybox with dimensions: ${imageOptions.width}x${imageOptions.height}`);
                // Add negative prompt to help seam processing
                imageOptions.negative_prompt = "visible seam, mismatched edges, abrupt transition, cut-off elements at edges";
            } else {
                // Square tiling texture
                imageOptions.width = 512;
                imageOptions.height = 512;
                // Help tiling
                imageOptions.negative_prompt = "borders, edges, frame, non-repeating patterns";
            }

            const result = await websim.imageGen(imageOptions);

            if (result && result.url) {
                // Load the generated image URL into a THREE.Texture
                // Returning the promise directly from loader.load
                return new Promise((resolve, reject) => {
                    this.textureLoader.load(
                        result.url,
                        (texture) => { // onLoad callback
                            // Assign SRGBEncoding conditionally based on renderer settings elsewhere
                            // texture.colorSpace = THREE.SRGBColorSpace;

                            if (isSkybox) {
                                texture.mapping = THREE.EquirectangularReflectionMapping;
                                // Process the seam *after* loading
                                this.processSkyboxSeam(texture);
                                // No repeat for skybox
                                console.log(`Skybox texture loaded and processed for: "${prompt}"`);
                            } else { // Tiling texture
                                texture.wrapS = THREE.RepeatWrapping;
                                texture.wrapT = THREE.RepeatWrapping;
                                // Adjust repeat based on typical texture scale and tile size
                                const textureScale = 2; // Assumed real-world size (meters) covered by the texture
                                const tileSize = 50; // Defined in WorldManager
                                const repeatValue = tileSize / textureScale;
                                texture.repeat.set(repeatValue, repeatValue);
                                console.log(`Tiling texture loaded for ${context}: "${prompt}"`);
                            }
                            texture.needsUpdate = true;
                            resolve(texture);
                        },
                        undefined, // onProgress callback
                        (err) => { // onError callback
                            console.error(`Error loading texture from URL ${result.url} for ${context}:`, err);
                            // Reject the promise on load error
                            reject(new Error(`Failed to load generated texture from ${result.url}`));
                        }
                    );
                });
            } else {
                throw new Error("Image generation failed or returned no URL.");
            }
        } catch (error) {
            console.error(`websim.imageGen failed for prompt "${prompt}" (context: ${context}):`, error);
            // Rethrow or return a specific error value
            throw new Error(`Image generation API failed for ${context}: ${error.message}`);
        }
    }

    processSkyboxSeam(texture) {
        const image = texture.image;
        if (!(image instanceof HTMLImageElement || image instanceof HTMLCanvasElement || image instanceof ImageBitmap) || (image instanceof HTMLImageElement && !image.complete)) {
            console.warn("Skybox texture image not ready or not processable for seam blending:", image);
            // Attempt to process when loaded if it's an HTMLImageElement
            if (image instanceof HTMLImageElement && !image.complete) {
                console.log("Deferring skybox seam processing until image loads.");
                image.onload = () => {
                    console.log("Image loaded, now processing skybox seam.");
                    this.processSkyboxSeam(texture); // Retry processing
                };
                image.onerror = (err) => {
                    console.error("Error loading skybox image for seam processing:", err);
                };
                return; // Don't process yet if not ready
            }
        }

        // Ensure width/height are valid before proceeding
        if (!image.width || !image.height || image.width <= 0 || image.height <= 0) {
            console.warn("Skybox image has invalid dimensions, cannot process seam.", image.width, image.height);
            return;
        }

        const canvas = document.createElement('canvas');
        // Use naturalWidth/Height for HTMLImageElement if available, otherwise width/height
        const imgWidth = image.naturalWidth || image.width;
        const imgHeight = image.naturalHeight || image.height;
        canvas.width = imgWidth;
        canvas.height = imgHeight;
        const ctx = canvas.getContext('2d');

        console.log(`Processing skybox seam on ${imgWidth}x${imgHeight} image.`);

        try {
            ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        } catch (e) {
            console.error("Error drawing skybox image to canvas for seam processing:", e);
            return; // Stop if drawing fails
        }

        // --- Enhanced Blending Logic ---
        // Blend further into the image (e.g., 15-20% from each side)
        const blendWidthRatio = 0.18; // Blend 18% from each side
        const blendWidthPixels = Math.floor(imgWidth * blendWidthRatio);

        // Create image data objects to sample pixels
        let leftEdgeData, rightEdgeData;
        try {
            leftEdgeData = ctx.getImageData(0, 0, blendWidthPixels, imgHeight);
            rightEdgeData = ctx.getImageData(imgWidth - blendWidthPixels, 0, blendWidthPixels, imgHeight);
        } catch (e) {
            console.error("Error getting image data for seam blending (potentially tainted canvas if cross-origin):", e);
            // Cannot proceed if image data cannot be read
            return;
        }

        // Create a new image data for the blended result
        const blendedSection = ctx.createImageData(blendWidthPixels * 2, imgHeight);

        // Blend pixels row by row
        for (let y = 0; y < imgHeight; y++) {
            for (let x = 0; x < blendWidthPixels; x++) {
                // Calculate alpha weights for left and right pixels
                // Linear blend: alpha ranges from 1.0 (use left pixel) to 0.0 (use right pixel)
                // Smoother step or cosine interpolation could also be used here.
                // const alpha = 1.0 - (x / (blendWidthPixels - 1)); // Linear fade right-to-left
                // Smoother step (hermite interpolation: 3t^2 - 2t^3)
                const t = x / (blendWidthPixels - 1);
                const alpha = 1.0 - (3 * t * t - 2 * t * t * t); // Weight for left pixel (decreases rightward)

                // Get indices for the pixel data arrays (4 bytes per pixel: R, G, B, A)
                const leftPixelIndex = (y * blendWidthPixels + x) * 4;
                // Corresponding pixel from the *right* edge data (mirrored conceptually)
                const rightPixelIndex = (y * blendWidthPixels + x) * 4;

                // Blend R, G, B channels
                for (let c = 0; c < 3; c++) {
                    const leftVal = leftEdgeData.data[leftPixelIndex + c];
                    const rightVal = rightEdgeData.data[rightPixelIndex + c];
                    blendedSection.data[leftPixelIndex + c] = Math.round(leftVal * alpha + rightVal * (1.0 - alpha));
                }
                // Blend Alpha channel
                const leftAlpha = leftEdgeData.data[leftPixelIndex + 3];
                const rightAlpha = rightEdgeData.data[rightPixelIndex + 3];
                blendedSection.data[leftPixelIndex + 3] = Math.round(leftAlpha * alpha + rightAlpha * (1.0 - alpha));

                // Copy the blended pixel to the *second half* of the blendedSection,
                // using the inverse alpha weighting to complete the mirrored blend.
                const inverseAlpha = 1.0 - alpha; // Weight for the original right pixel
                const targetIndex = (y * blendWidthPixels * 2 + (blendWidthPixels + x)) * 4; // Index in the right half
                for (let c = 0; c < 3; c++) {
                    const leftVal = leftEdgeData.data[leftPixelIndex + c];
                    const rightVal = rightEdgeData.data[rightPixelIndex + c];
                    blendedSection.data[targetIndex + c] = Math.round(leftVal * inverseAlpha + rightVal * (1.0 - inverseAlpha));
                }
                blendedSection.data[targetIndex + 3] = Math.round(leftAlpha * inverseAlpha + rightAlpha * (1.0 - inverseAlpha));
            }
        }

        // Draw the blended section back onto the *edges* of the main canvas
        // Draw first half of blendedSection onto the left edge
        ctx.putImageData(blendedSection, 0, 0, 0, 0, blendWidthPixels, imgHeight);
        // Draw second half of blendedSection onto the right edge
        ctx.putImageData(blendedSection, imgWidth - blendWidthPixels, 0, blendWidthPixels, 0, blendWidthPixels, imgHeight);

        // --- Fog Gradient Overlay (Optional, can be combined or replace pixel blend) ---
        /*
        const fogColorOpaque = 'rgba(210, 210, 210, 0.8)'; // Adjust alpha for density
        const fogColorTransparent = 'rgba(210, 210, 210, 0.0)';
        const fogBlendWidth = Math.floor(imgWidth * 0.1); // Narrower fog blend width

        const leftGradient = ctx.createLinearGradient(0, 0, fogBlendWidth, 0);
        leftGradient.addColorStop(0, fogColorOpaque);
        leftGradient.addColorStop(1, fogColorTransparent);

        const rightGradient = ctx.createLinearGradient(imgWidth, 0, imgWidth - fogBlendWidth, 0);
        rightGradient.addColorStop(0, fogColorOpaque);
        rightGradient.addColorStop(1, fogColorTransparent);

        ctx.fillStyle = leftGradient;
        ctx.fillRect(0, 0, fogBlendWidth, imgHeight);
        ctx.fillStyle = rightGradient;
        ctx.fillRect(imgWidth - fogBlendWidth, 0, fogBlendWidth, imgHeight);
        */
        // --- End Fog Gradient ---

        // Update the texture with the processed canvas data
        texture.image = canvas;
        texture.needsUpdate = true;
        console.log(`Processed skybox seam using pixel blending (${(blendWidthRatio * 100).toFixed(0)}% width).`);
    }

    createPlaceholderTexture(color = '#FF00FF', width = 64, height = 64) { // Default to magenta
        console.warn(`Creating ${width}x${height} placeholder texture with color ${color}.`);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');

        // Simple checkerboard pattern
        const checkerSize = Math.max(8, Math.min(width, height) / 8); // Adjust checker size based on canvas size
        context.fillStyle = color;
        context.fillRect(0, 0, width, height);
        context.fillStyle = 'rgba(0,0,0,0.2)'; // Slightly darker shade for contrast

        const numCheckersX = Math.ceil(width / checkerSize);
        const numCheckersY = Math.ceil(height / checkerSize);

        for (let i = 0; i < numCheckersX; i++) {
            for (let j = 0; j < numCheckersY; j++) {
                if ((i + j) % 2 === 0) {
                    context.fillRect(i * checkerSize, j * checkerSize, checkerSize, checkerSize);
                }
            }
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        // Apply repeat based on default assumptions if needed (though often overridden)
        const textureScale = 2;
        const tileSize = 50; // Use standard tile size for default repeat
        const repeatValue = tileSize / textureScale;
        texture.repeat.set(repeatValue, repeatValue);
        texture.needsUpdate = true;
        return texture;
    }
}