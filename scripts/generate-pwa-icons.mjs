// scripts/generate-pwa-icons.mjs
// Generates PWA icons in multiple sizes from the source image

import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdir } from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

const SOURCE_IMAGE = join(rootDir, 'public', 'spiritdaosymbol.png');
const OUTPUT_DIR = join(rootDir, 'public', 'icons');

// PWA icon sizes required
const ICON_SIZES = [
  { size: 72, name: 'icon-72.png' },
  { size: 96, name: 'icon-96.png' },
  { size: 128, name: 'icon-128.png' },
  { size: 144, name: 'icon-144.png' },
  { size: 152, name: 'icon-152.png' },
  { size: 192, name: 'icon-192.png' },
  { size: 384, name: 'icon-384.png' },
  { size: 512, name: 'icon-512.png' },
];

async function generateIcons() {
  try {
    // Create output directory
    await mkdir(OUTPUT_DIR, { recursive: true });
    console.log(`✓ Created directory: ${OUTPUT_DIR}`);

    // Read source image
    const sourceBuffer = await sharp(SOURCE_IMAGE).toBuffer();
    const metadata = await sharp(sourceBuffer).metadata();
    console.log(`✓ Source image: ${metadata.width}x${metadata.height}`);

    // Generate each icon size
    for (const { size, name } of ICON_SIZES) {
      const outputPath = join(OUTPUT_DIR, name);

      await sharp(sourceBuffer)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 1 }
        })
        .png()
        .toFile(outputPath);

      console.log(`✓ Generated: ${name} (${size}x${size})`);
    }

    // Also create apple-touch-icon.png (180x180 for iOS)
    const appleTouchIcon = join(rootDir, 'public', 'apple-touch-icon.png');
    await sharp(sourceBuffer)
      .resize(180, 180, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      })
      .png()
      .toFile(appleTouchIcon);
    console.log(`✓ Generated: apple-touch-icon.png (180x180)`);

    // Create favicon.ico (32x32)
    const favicon = join(rootDir, 'public', 'favicon.ico');
    await sharp(sourceBuffer)
      .resize(32, 32, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      })
      .png()
      .toFile(favicon);
    console.log(`✓ Generated: favicon.ico (32x32)`);

    console.log('\n✅ All PWA icons generated successfully!');
    console.log(`📁 Output directory: ${OUTPUT_DIR}`);
  } catch (error) {
    console.error('❌ Error generating icons:', error);
    process.exit(1);
  }
}

generateIcons();
