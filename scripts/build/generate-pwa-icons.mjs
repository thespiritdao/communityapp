// scripts/build/generate-pwa-icons.mjs
// Generates PWA icons in multiple sizes from the source image

import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdir } from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..', '..');

// Source image: first CLI argument, PWA_ICON_SOURCE, or public/spiritdaosymbol.png.
const SOURCE_IMAGE = process.argv[2] || process.env.PWA_ICON_SOURCE || join(rootDir, 'public', 'spiritdaosymbol.png');
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

    // Generate each icon size.
    // .flatten() composites the (transparent) line-art onto an OPAQUE white
    // background. Without it, transparent pixels render as BLACK on Android
    // home screens. We also inset the artwork to ~82% (an ~9% margin) so the
    // icon has a safe zone for rounded/masked launcher shapes.
    const WHITE = { r: 255, g: 255, b: 255 };
    for (const { size, name } of ICON_SIZES) {
      const outputPath = join(OUTPUT_DIR, name);
      const inner = Math.round(size * 0.82);
      const pad = Math.round((size - inner) / 2);

      await sharp(sourceBuffer)
        .resize(inner, inner, {
          fit: 'contain',
          background: { ...WHITE, alpha: 1 },
        })
        .extend({ top: pad, bottom: pad, left: pad, right: pad, background: WHITE })
        .flatten({ background: WHITE })
        .png()
        .toFile(outputPath);

      console.log(`✓ Generated: ${name} (${size}x${size})`);
    }

    // Also create apple-touch-icon.png (180x180 for iOS) — flattened opaque
    // white (iOS also renders transparency as black on the home screen).
    const appleTouchIcon = join(rootDir, 'public', 'apple-touch-icon.png');
    await sharp(sourceBuffer)
      .resize(Math.round(180 * 0.82), Math.round(180 * 0.82), {
        fit: 'contain',
        background: { ...WHITE, alpha: 1 },
      })
      .extend({
        top: Math.round((180 - Math.round(180 * 0.82)) / 2),
        bottom: Math.round((180 - Math.round(180 * 0.82)) / 2),
        left: Math.round((180 - Math.round(180 * 0.82)) / 2),
        right: Math.round((180 - Math.round(180 * 0.82)) / 2),
        background: WHITE,
      })
      .flatten({ background: WHITE })
      .png()
      .toFile(appleTouchIcon);
    console.log(`✓ Generated: apple-touch-icon.png (180x180)`);

    // Create favicon.ico (32x32)
    const favicon = join(rootDir, 'public', 'favicon.ico');
    await sharp(sourceBuffer)
      .resize(32, 32, {
        fit: 'contain',
        background: { ...WHITE, alpha: 1 },
      })
      .flatten({ background: WHITE })
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
