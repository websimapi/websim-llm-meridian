import * as THREE from 'three';

// Define default textures as constants for reuse
const DEFAULT_FLOOR_PLACEHOLDER_COLOR = '#808080';
const DEFAULT_WALL_PLACEHOLDER_COLOR = '#A0A0A0';
const DEFAULT_CEILING_PLACEHOLDER_COLOR = '#555555';

export class TextureManager {
    constructor() {
        this.textureLoader = new THREE.TextureLoader();
        this.cachedTextures = new Map(); // Simple cache based on URL
    }

    /**
     * Loads a texture from a URL, applying appropriate settings for skyboxes or repeating textures.
     * @param {string} url The URL of the texture image.
     * @param {boolean} [isSkybox=false] Whether this texture is for a skybox (equirectangular mapping).
     * @param {number} [repeatTargetWidth=50] The target world width the texture should cover for repeating.
     * @param {number} [repeatTargetHeight=50] The target world height the texture should cover for repeating.
     * @param {number} [textureScale=2] How many world units the texture covers once before repeating.
     * @returns {Promise<THREE.Texture | null>} A promise resolving to the loaded texture or null on failure.
     */
    async loadTextureFromUrl(url, isSkybox = false, repeatTargetWidth = 50, repeatTargetHeight = 50, textureScale = 2) {
        if (!url || typeof url !== 'string' || (!url.startsWith('http') && !url.startsWith('blob:') && !url.startsWith('data:'))) {
            console.warn(`[TextureManager] Invalid or missing URL provided for texture loading: ${url}`);
            return null;
        }

        // Check cache first
        const cacheKey = `${url}_${isSkybox}_${repeatTargetWidth}_${repeatTargetHeight}_${textureScale}`;
        if (this.cachedTextures.has(cacheKey)) {
             console.log(`[TextureManager] Returning cached texture for: ${url.substring(0, 60)}...`);
             // Return a clone to avoid issues if the original gets disposed elsewhere accidentally
             // Note: Cloning textures shares the underlying image/source, but not properties like wrap/repeat. Re-apply them.
             const cachedTex = this.cachedTextures.get(cacheKey);
             if (cachedTex) {
                 const clonedTex = cachedTex.clone(); // Clone the texture object
                 clonedTex.needsUpdate = true; // Important after cloning
                 // Re-apply settings as cloning might not preserve everything perfectly or might be needed depending on usage context
                 this.applyTextureSettings(clonedTex, isSkybox, repeatTargetWidth, repeatTargetHeight, textureScale);
                 return clonedTex;
             } else {
                this.cachedTextures.delete(cacheKey); // Remove invalid cache entry
             }
        }


        console.log(`[TextureManager] Loading texture: ${url.substring(0, 60)}... (Skybox: ${isSkybox})`);
        return new Promise((resolve) => {
            this.textureLoader.load(
                url,
                (texture) => {
                    console.log(`[TextureManager] Successfully loaded texture: ${url.substring(0, 60)}...`);
                    this.applyTextureSettings(texture, isSkybox, repeatTargetWidth, repeatTargetHeight, textureScale);
                    texture.needsUpdate = true; // Ensure texture flags update
                    this.cachedTextures.set(cacheKey, texture); // Cache the original loaded texture
                    resolve(texture);
                },
                undefined, // onProgress callback (optional)
                (error) => {
                    console.error(`[TextureManager] Failed to load texture from URL: ${url}`, error);
                    resolve(null); // Resolve with null on error, don't reject promise chain
                }
            );
        });
    }

    /**
      * Applies standard settings (wrapping, repeat, mapping) to a texture.
      */
    applyTextureSettings(texture, isSkybox, repeatTargetWidth, repeatTargetHeight, textureScale) {
        if (isSkybox) {
            texture.mapping = THREE.EquirectangularReflectionMapping;
            // Optional: Add seam processing here if needed again
            // this.processSkyboxSeam(texture);
        } else {
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            const repeatX = repeatTargetWidth / textureScale;
            const repeatY = repeatTargetHeight / textureScale;
            texture.repeat.set(repeatX, repeatY);
        }
    }

    /**
     * Creates a placeholder texture with a checkerboard pattern.
     * @param {string} [color='#FF00FF'] The base color for the placeholder.
     * @param {number} [tileSize=50] The size of the tile this placeholder is intended for (used for repeat calculation).
     * @param {number} [textureScale=2] How many world units the texture covers once before repeating.
     * @returns {THREE.CanvasTexture} The generated placeholder texture.
     */
    createPlaceholderTexture(color = '#FF00FF', tileSize = 50, textureScale = 2) {
        console.warn(`[TextureManager] Creating placeholder texture with color ${color}.`);
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
        const repeatValue = tileSize / textureScale;
        texture.repeat.set(repeatValue, repeatValue);
        texture.needsUpdate = true; // Ensure canvas is uploaded to GPU
        return texture;
    }

    /**
     * Disposes cached textures to free up memory.
     */
    disposeCache() {
        console.log("[TextureManager] Disposing cached textures.");
        this.cachedTextures.forEach(texture => {
            if (texture) texture.dispose();
        });
        this.cachedTextures.clear();
    }
}