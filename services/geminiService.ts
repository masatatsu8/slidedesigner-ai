
import { GoogleGenAI, Type } from "@google/genai";
import { TokenUsage, ComplexityLevel, SplitPoints, ImageResolution } from "../types";

// Model constants
const IMAGE_MODEL = 'gemini-3-pro-image-preview';
const TEXT_MODEL = 'gemini-2.5-flash'; // For suggestions and analysis

// Cost constants (USD per 1M tokens)
const COST_INPUT_PER_1M = 2.0;
const COST_OUTPUT_PER_1M = 12.0;

const getAiClient = () => {
  return new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
};

const calculateUsage = (usageMetadata: any): TokenUsage => {
  const inputTokens = usageMetadata?.promptTokenCount || 0;
  const outputTokens = usageMetadata?.candidatesTokenCount || 0;
  const totalTokens = usageMetadata?.totalTokenCount || (inputTokens + outputTokens);
  
  const estimatedCostUSD = 
    ((inputTokens / 1000000) * COST_INPUT_PER_1M) + 
    ((outputTokens / 1000000) * COST_OUTPUT_PER_1M);

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    estimatedCostUSD
  };
};

export interface ImageGenerationResult {
  data: string;
  usage: TokenUsage;
}

/**
 * Generates 3 infographic drafts in parallel based on the user's text.
 */
export const generateInfographicDrafts = async (
  userText: string, 
  complexity: ComplexityLevel = ComplexityLevel.VERY_SIMPLE,
  designRequests?: string,
  resolution: ImageResolution = '1K',
  styleImageBase64?: string
): Promise<ImageGenerationResult[]> => {
  const ai = getAiClient();

  let styleInstructions = "";
  
  switch (complexity) {
    case ComplexityLevel.SOLID:
      styleInstructions = `
        - Style: Business professional, information-rich, trustworthy.
        - Content Density: High but organized. Use charts, graphs, and detailed icons to represent data accurately.
        - Vibe: "しっかり" (Solid, Standard). Suitable for formal presentations.
      `;
      break;
    case ComplexityLevel.LIGHT:
      styleInstructions = `
        - Style: Modern, airy, approachable, magazine-style.
        - Content Density: Low. Focus on key takeaways with generous spacing. Use softer colors and outlined icons.
        - 文字サイズ：14px以上
        - Vibe: "ライトめ" (Light, Casual). Suitable for internal sharing or blogs.
      `;
      break;
    case ComplexityLevel.VERY_SIMPLE:
      styleInstructions = `
        - Style: Ultra-minimalist, poster-like, flat design.
        - Content Density: Very Low. Focus on ONE single key message or metaphor. Large bold visuals. Minimal text.
        - 文字サイズ：24px以上
        - Vibe: "非常にシンプル" (Very Simple). Suitable for quick social media impact.
      `;
      break;
  }

  let prompt = `
    Create a professional, clean, and high-quality infographic summarizing the following content:
    "${userText}"
    
    Constraints:
    - Language: Japanese (ALL text MUST be in Japanese).
    - Aspect Ratio: 16:9
    - Important: Background: Pure White (#FFFFFF) unless the style reference dictates otherwise.
    ${styleInstructions}

    ${designRequests ? `
    CRITICAL DESIGN INSTRUCTIONS (HIGHEST PRIORITY):
    User's specific design request: "${designRequests}"
    Follow this request strictly.
    ` : ''}

    - Content: Visualize the key points clearly. Use icons and illustrations extensively.
  `;

  // If a style reference image is provided, append specific instructions
  if (styleImageBase64) {
    prompt += `
    
    *** STYLE REFERENCE INSTRUCTION ***
    I have provided an image. Use this image as a STRICT STYLE REFERENCE.
    - Extract the color palette, font style, illustration style, and layout composition from the reference image.
    - Apply this visual style to the new infographic content defined above.
    - Do NOT copy the text from the reference image, only the visual "vibe" and aesthetics.
    `;
  } else {
    prompt += `
    - Colors: Use a comprehensive, balanced, and professional color palette (e.g., blues, grays, with accent colors).
    `;
  }

  const requests = [1, 2, 3].map(async () => {
    try {
      const parts: any[] = [{ text: prompt }];
      
      // Add the style image to the request if available
      if (styleImageBase64) {
        parts.push({
          inlineData: {
            mimeType: 'image/png',
            data: styleImageBase64
          }
        });
      }

      const response = await ai.models.generateContent({
        model: IMAGE_MODEL,
        contents: {
          parts: parts
        },
        config: {
          imageConfig: {
            aspectRatio: "16:9",
            imageSize: resolution
          }
        }
      });

      const usage = calculateUsage(response.usageMetadata);

      // Extract image
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          return { data: part.inlineData.data, usage };
        }
      }
      throw new Error("No image generated in this attempt.");
    } catch (error) {
      console.error("Draft generation error:", error);
      return null;
    }
  });

  const results = await Promise.all(requests);
  return results.filter((res): res is ImageGenerationResult => res !== null);
};

/**
 * Edits an existing infographic based on a new instruction.
 */
export const editInfographic = async (
  base64Image: string, 
  instruction: string,
  resolution: ImageResolution = '1K'
): Promise<ImageGenerationResult | null> => {
  const ai = getAiClient();
  const prompt = `
    Edit this infographic based on the following instruction: "${instruction}".
    
    Maintain the 16:9 aspect ratio and the white background style.
    Ensure the text remains in Japanese.
    Ensure the result remains a high-quality professional infographic.
  `;

  try {
    const response = await ai.models.generateContent({
      model: IMAGE_MODEL,
      contents: {
        parts: [
          {
            text: prompt
          },
          {
            inlineData: {
              mimeType: 'image/png',
              data: base64Image
            }
          }
        ]
      },
      config: {
        imageConfig: {
          aspectRatio: "16:9",
          imageSize: resolution
        }
      }
    });

    const usage = calculateUsage(response.usageMetadata);

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return { data: part.inlineData.data, usage };
      }
    }
    return null;
  } catch (error) {
    console.error("Edit generation error:", error);
    throw error;
  }
};

/**
 * Generates suggestions for improving the infographic based on the original text.
 */
export const getRefinementSuggestions = async (originalText: string): Promise<string[]> => {
  const ai = getAiClient();
  const prompt = `
    Analyze the following text which is being turned into an infographic:
    "${originalText}"

    Provide 3 short, specific, and actionable suggestions to improve the visual design or clarity of an infographic for this content.
    The suggestions MUST be in Japanese.
    Examples: "タイトルのフォントを大きくする", "データを円グラフにする", "アクセントカラーをネイビーブルーにする".
    
    Return ONLY a JSON array of strings.
  `;

  try {
    const response = await ai.models.generateContent({
      model: TEXT_MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      }
    });

    const jsonText = response.text;
    if (!jsonText) return [];
    return JSON.parse(jsonText);
  } catch (error) {
    console.error("Suggestion error:", error);
    return [
      "配色をより鮮やかにする",
      "重要な数字を強調する",
      "アイコンを増やして視覚的にする"
    ];
  }
};

/**
 * Analyzes the infographic to identify safe horizontal split points (Y-coordinates).
 * Used for "Curtain-reveal" style PPT generation which prevents cutting text.
 */
export const analyzeImageSplitPoints = async (base64Image: string): Promise<SplitPoints> => {
  const ai = getAiClient();
  
  const prompt = `
    Analyze this infographic structure to create a "slide reveal" animation.
    Identify 3 to 5 Y-axis coordinates (on a scale of 0 to 1000) that define the logical horizontal sections of the content (e.g., below the title, between major charts, before the footer).
    
    CRITICAL RULES:
    1. The lines MUST exist in the WHITESPACE between elements. 
    2. DO NOT choose a coordinate that cuts through text, icons, or illustrations.
    3. The goal is to reveal the infographic section by section from top to bottom safely.
    
    Return ONLY a JSON array of integers representing these Y-coordinates.
    Example: [200, 550, 800]
  `;

  try {
    const response = await ai.models.generateContent({
      model: TEXT_MODEL,
      contents: {
        parts: [
          { text: prompt },
          { inlineData: { mimeType: 'image/png', data: base64Image } }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.INTEGER }
        }
      }
    });

    const jsonText = response.text;
    if (!jsonText) return [];
    
    // Parse and sort to ensure logical flow (top to bottom)
    const points: number[] = JSON.parse(jsonText);
    const sortedPoints = points.sort((a, b) => a - b);

    // Filter out points that are too close to edges (optional safety)
    return sortedPoints.filter(p => p > 50 && p < 950);

  } catch (error) {
    console.error("Split analysis error:", error);
    // Fallback: evenly split into 3 parts if analysis fails
    return [333, 666];
  }
};
