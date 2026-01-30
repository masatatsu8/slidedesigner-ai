
import PptxGenJS from 'pptxgenjs';
import { SplitPoints } from '../types';

/**
 * Loads an image from a base64 string.
 */
const loadImage = (base64: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = `data:image/png;base64,${base64}`;
  });
};

/**
 * Detects the background color by averaging the pixels at the four corners of the image.
 */
const detectBackgroundColor = (ctx: CanvasRenderingContext2D, width: number, height: number): string => {
  const corners = [
    { x: 0, y: 0 },
    { x: width - 1, y: 0 },
    { x: 0, y: height - 1 },
    { x: width - 1, y: height - 1 }
  ];

  let r = 0, g = 0, b = 0;
  corners.forEach(c => {
    const pixel = ctx.getImageData(c.x, c.y, 1, 1).data;
    r += pixel[0];
    g += pixel[1];
    b += pixel[2];
  });

  r = Math.round(r / 4);
  g = Math.round(g / 4);
  b = Math.round(b / 4);

  // Convert to Hex
  const toHex = (c: number) => {
    const hex = c.toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  };

  return `${toHex(r)}${toHex(g)}${toHex(b)}`; // Returns hex string without #
};

/**
 * Generates a PowerPoint file with "Reveal" animation using masking.
 * 
 * Strategy:
 * Instead of cropping and pasting snippets (which causes text to be cut off),
 * we place the FULL original image on every slide.
 * Then, we place a "Mask" (a rectangle of the background color) over the parts
 * that shouldn't be visible yet.
 * 
 * This guarantees that the visible content is pixel-perfect and continuous.
 */
export const generatePowerPoint = async (base64Image: string, splitPoints: SplitPoints) => {
  const pres = new PptxGenJS();
  pres.layout = 'LAYOUT_16x9'; // Standard 10 x 5.625 inches

  // 1. Analyze Image Background Color
  const img = await loadImage(base64Image);
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error("Canvas context failed");
  ctx.drawImage(img, 0, 0);
  const bgColorHex = detectBackgroundColor(ctx, img.width, img.height);

  // 2. Determine Slide Stages
  // If we have splits [200, 500, 800] (out of 1000):
  // Slide 1: Reveal 0-200. Mask 200-1000.
  // Slide 2: Reveal 0-500. Mask 500-1000.
  // Slide 3: Reveal 0-800. Mask 800-1000.
  // Slide 4: Reveal All. Mask None.
  
  const allPoints = [...splitPoints, 1000]; // Add end of image
  
  for (let i = 0; i < allPoints.length; i++) {
    const revealLimitY = allPoints[i]; // 0-1000 scale
    
    const slide = pres.addSlide();
    slide.background = { color: bgColorHex };

    // A. Place the full image as the base
    slide.addImage({ 
      data: `data:image/png;base64,${base64Image}`, 
      x: 0, 
      y: 0, 
      w: '100%', 
      h: '100%' 
    });

    // B. If not the final full reveal, add a mask to hide the bottom part
    if (revealLimitY < 1000) {
      const maskYPercent = revealLimitY / 10; // Convert 0-1000 to 0-100%
      const maskHeightPercent = 100 - maskYPercent;

      // Add a rectangle matching the background color to "hide" the future content
      slide.addShape(pres.ShapeType.rect, {
        x: 0,
        y: `${maskYPercent}%`,
        w: '100%',
        h: `${maskHeightPercent}%`,
        fill: { color: bgColorHex },
        line: { color: bgColorHex } // Ensure no border visible
      });
    }

    // Optional: Add notes
    if (revealLimitY < 1000) {
      slide.addNotes(`Reveal Part ${i + 1}`);
    } else {
      slide.addNotes('Full Infographic Revealed');
    }
  }

  await pres.writeFile({ fileName: 'infograph_animated.pptx' });
};
