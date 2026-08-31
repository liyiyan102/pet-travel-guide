#!/usr/bin/env node
/**
 * SVG → PNG converter for 带爪旅行 mini-program icons.
 * Uses sharp (libvips) for high-quality SVG rendering.
 * Replaces currentColor in SVG with target hex color before conversion.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ICONS_DIR = path.join(__dirname, 'icons');
const IMAGES_DIR = path.join(__dirname, 'images');

// svg_name → [(output_png, hex_color, size_px)]
const MAPPING = {
  // tabBar: gray(inactive) + colored(active)
  'home':       [['explore.png', '#A8B0B8', 81], ['explore-active.png', '#1A1D1F', 81]],
  'compass':    [['location.png', '#A8B0B8', 81], ['location-active.png', '#00B86B', 81]],
  'edit':       [['generate.png', '#A8B0B8', 81], ['generate-active.png', '#00B86B', 81]],
  'user':       [['profile.png', '#A8B0B8', 81], ['profile-active.png', '#1A1D1F', 81]],
  // page icons (48px, various colors)
  'search':        [['ic-search.png', '#6E7681', 48]],
  'location':      [['ic-location.png', '#00B86B', 48]],
  'paw':           [['ic-paw.png', '#FFFFFF', 48]],
  'star':          [['ic-star.png', '#FF7A1A', 48]],
  'clock':         [['ic-clock.png', '#6E7681', 48]],
  'phone':         [['ic-phone.png', '#00B86B', 48]],
  'navigation':    [['ic-navigation.png', '#00B86B', 48]],
  'settings':      [['ic-settings.png', '#6E7681', 48]],
  'chevron-right': [['ic-arrow-right.png', '#A8B0B8', 48]],
  'chevron-left':  [['ic-back.png', '#1A1D1F', 48]],
  'plus':          [['ic-plus.png', '#00B86B', 48]],
  'minus':         [['ic-minus.png', '#6E7681', 48]],
  'check':         [['ic-check.png', '#00B86B', 48]],
  'coffee':        [['ic-cafe.png', '#FF7A1A', 48]],
  'food':          [['ic-restaurant.png', '#FF7A1A', 48]],
  'tree':          [['ic-park.png', '#00B86B', 48]],
  'hospital':      [['ic-hospital.png', '#EC4899', 48]],
  'bed':           [['ic-hotel.png', '#3B82F6', 48]],
  'dog':           [['ic-dog.png', '#1A1D1F', 48]],
  'ai-spark':      [['ic-ai.png', '#FFFFFF', 48]],
  'walk':          [['ic-walk.png', '#00B86B', 48]],
  'car':           [['ic-car.png', '#1A1D1F', 48]],
  'bus':           [['ic-bus.png', '#1A1D1F', 48]],
  'map':           [['ic-map.png', '#00B86B', 48]],
  'mail':          [['ic-mail.png', '#3B82F6', 48]],
};

async function convertOne(svgName, outName, color, size) {
  const svgPath = path.join(ICONS_DIR, `${svgName}.svg`);
  if (!fs.existsSync(svgPath)) {
    console.log(`  SKIP: ${svgName}.svg not found`);
    return false;
  }
  let svg = fs.readFileSync(svgPath, 'utf-8');
  // Replace currentColor with target color
  svg = svg.replace(/currentColor/g, color);
  // Ensure width/height attributes for sharp
  svg = svg.replace(/<svg /, `<svg width="${size}" height="${size}" `);

  const outPath = path.join(IMAGES_DIR, outName);
  try {
    await sharp(Buffer.from(svg), { density: 384 })
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(outPath);
    console.log(`  OK: ${svgName}.svg → ${outName} (${color}, ${size}px)`);
    return true;
  } catch (e) {
    console.log(`  FAIL: ${svgName} → ${outName}: ${e.message}`);
    return false;
  }
}

async function main() {
  console.log('=== SVG → PNG Icon Converter (sharp) ===');
  let ok = 0, fail = 0;
  for (const [svgName, outputs] of Object.entries(MAPPING)) {
    for (const [outName, color, size] of outputs) {
      const success = await convertOne(svgName, outName, color, size);
      success ? ok++ : fail++;
    }
  }
  console.log(`\nDone: ${ok} success, ${fail} fail`);
}

main();
