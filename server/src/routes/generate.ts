import express, { Request, Response } from 'express';
import { Anthropic } from '@anthropic-ai/sdk';

const router = express.Router();

interface GenerateHtmlRequest {
  image: string; // Base64 encoded image
  apiKey: string; // Claude API key
}

// Route to generate HTML from an image
router.post('/generate-html', async (req: Request, res: Response) => {
  try {
    const { image, apiKey } = req.body as GenerateHtmlRequest;

    if (!image || !apiKey) {
      return res.status(400).json({ 
        error: 'Missing required parameters. Please provide both image and apiKey.' 
      });
    }

    // Extract the base64 data and MIME type from the data URL
    const matches = image.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
    
    if (!matches || matches.length !== 3) {
      return res.status(400).json({ error: 'Invalid image format' });
    }

    const mimeType = matches[1];
    const base64Data = matches[2];

    // Validate that it's an image
    if (!mimeType.startsWith('image/')) {
      return res.status(400).json({ error: 'Uploaded file is not an image' });
    }

    // Initialize Anthropic client with the provided API key
    const anthropic = new Anthropic({
      apiKey: apiKey,
    });

    // Determine the appropriate media type for Claude API
    const mediaType = (mimeType === 'image/jpeg' || mimeType === 'image/png' || 
                       mimeType === 'image/gif' || mimeType === 'image/webp') ? 
                       mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp" : 
                       "image/jpeg";

    // Make the API call to Claude
    const message = await anthropic.messages.create({
      model: "claude-3-sonnet-20240229",
      max_tokens: 4000,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Please analyze this UI image and generate the HTML and CSS code needed to recreate it. Use Tailwind CSS for styling. Make sure the HTML is clean, semantic, and accessible. Focus on accurately replicating the visual design, layout, colors, and overall look and feel. Return ONLY the HTML code without any explanation."
            },
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType,
                data: base64Data
              }
            }
          ]
        }
      ]
    });

    // Extract the HTML content from the response
    const htmlContent = message.content[0].type === 'text' ? message.content[0].text : '';

    // Return the generated HTML
    res.status(200).json({ html: htmlContent });
  } catch (error) {
    console.error('Error generating HTML:', error);
    res.status(500).json({ 
      error: 'An error occurred while generating HTML',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
