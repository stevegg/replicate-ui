const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { Anthropic } = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Enable CORS
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increase limit for base64 images

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Create a directory for temporary files if it doesn't exist
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir);
}

// Store active generation tasks with their status
const activeTasks = new Map();

// Route to generate HTML from an image
app.post('/generate-html', upload.single('image'), async (req, res) => {
  try {
    // Get the API key from the request
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) {
      return res.status(400).json({ error: 'API key is required' });
    }

    // Get the model from the request
    const model = req.body.model || 'claude-3-opus-20240229';

    // Get the image from the request
    const image = req.file;
    if (!image) {
      return res.status(400).json({ error: 'Image is required' });
    }

    // Create a unique task ID
    const taskId = Date.now().toString();
    
    // Initialize task status
    activeTasks.set(taskId, {
      status: 'processing',
      progress: 0,
      message: 'Starting image analysis...',
      startTime: Date.now()
    });
    
    // Send the initial response with the task ID
    res.json({ 
      taskId,
      status: 'processing',
      message: 'Image analysis started'
    });

    // Process the image asynchronously
    (async () => {
      try {
        // Initialize Anthropic client
        const anthropic = new Anthropic({
          apiKey: apiKey,
        });

        // Convert the image to base64
        const base64Data = image.buffer.toString('base64');
        const mediaType = image.mimetype;

        // Update task status
        activeTasks.get(taskId).progress = 10;
        activeTasks.get(taskId).message = 'Analyzing image and extracting UI elements...';

        // Make the API call to Claude
        const message = await anthropic.messages.create({
          model: model,
          max_tokens: 4000,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Please analyze this UI image and generate the EXACT HTML and CSS code needed to recreate it as accurately as possible. Your goal is to make the output visually match the original image while ensuring it's responsive.\n\nFollow these strict requirements:\n\n1. LAYOUT REPLICATION IS HIGHEST PRIORITY - The spatial arrangement, proportions, and visual hierarchy must match the original as closely as possible while still being responsive.\n\n2. COLOR MATCHING IS CRITICAL - Extract and use the EXACT hex color codes from the image for all elements (backgrounds, text, borders, buttons, etc.)\n\n3. USE APPROPRIATE UI CONTROLS - Implement proper HTML5 elements for interactive components:\n   - Use <input type=\"date\"> with appropriate styling for date pickers\n   - Use proper form controls for inputs, dropdowns, and selections\n   - Ensure all interactive elements maintain their visual appearance from the image\n\n4. RESPONSIVE DESIGN IS MANDATORY - The UI MUST be fully responsive and adapt to different screen sizes:\n   - Preserve the layout integrity across different screen sizes\n   - Use relative units (rem, em, %, vh/vw) instead of fixed pixel values wherever possible\n   - Implement proper media queries for at least 3 breakpoints: mobile (< 640px), tablet (641px-1024px), desktop (> 1024px)\n   - Use flexbox and/or CSS grid for layout to ensure proper scaling and reflow\n   - Ensure all elements resize proportionally and maintain proper spacing on all devices\n   - Implement touch-friendly sizing for interactive elements on mobile (min 44px touch targets)\n   - Use appropriate font-size scaling between mobile and desktop views\n\n5. FONT MATCHING IS ESSENTIAL - Identify and use the exact fonts from the image, or the closest web-safe alternatives. Match font sizes, weights, spacing, and line heights precisely.\n\n6. LOGO AND BRANDING - Recreate any logos or brand elements as accurately as possible using SVG or appropriate image tags. Match colors and proportions exactly.\n\n7. Include all microcopy, helper text, and labels exactly as shown\n\n8. Ensure any hover states, focus states, or interactive elements are properly implemented with the correct colors\n\n9. Pay close attention to borders, shadows, and other subtle design elements\n\nReturn the complete HTML code with embedded Tailwind CSS classes AND include a <style> tag with any necessary custom CSS to ensure perfect matching of colors, fonts, and layout. Do not include any explanations."
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

        // Update task status
        activeTasks.get(taskId).progress = 70;
        activeTasks.get(taskId).message = 'Generating HTML and CSS code...';

        // Extract the HTML content from the response
        const htmlContent = message.content[0].text;

        // Create a unique ID for this generation
        const generationId = taskId;
        const generationDir = path.join(tempDir, generationId);
        fs.mkdirSync(generationDir);

        // Extract CSS from HTML content
        const styleMatch = htmlContent.match(/<style>([\s\S]*?)<\/style>/);
        const styleContent = styleMatch ? styleMatch[1] : '';
        
        // Clean HTML (remove style tags)
        const cleanHtml = htmlContent.replace(/<style>[\s\S]*?<\/style>/, '');
        
        // Create index.html file
        const htmlFilePath = path.join(generationDir, 'index.html');
        
        // Create a complete HTML document with proper structure and external CSS
        const completeHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>UI Replication</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css">
    <link rel="stylesheet" href="styles.css">
    <style>
        /* Base responsive styles */
        *, *::before, *::after {
            box-sizing: border-box;
        }
        
        :root {
            /* Define base font sizes for different screen sizes */
            font-size: 16px;
        }
        
        body {
            margin: 0;
            padding: 0;
            width: 100%;
            min-height: 100vh;
            overflow-x: hidden;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
        }
        
        /* Ensure all images are responsive */
        img {
            max-width: 100%;
            height: auto;
            display: block; /* Removes bottom spacing */
        }
        
        /* Ensure inputs and buttons are touch-friendly */
        input, button, select, textarea, a {
            font-size: 16px; /* Prevents zoom on mobile */
            min-height: 44px; /* Minimum touch target size */
            min-width: 44px; /* Minimum touch target size */
        }
        
        /* Add responsive container if needed */
        .container {
            width: 100%;
            max-width: 1200px;
            margin: 0 auto;
            padding: 0 15px;
        }
        
        /* Responsive typography */
        h1 { font-size: clamp(1.75rem, 4vw, 2.5rem); }
        h2 { font-size: clamp(1.5rem, 3vw, 2rem); }
        h3 { font-size: clamp(1.25rem, 2.5vw, 1.75rem); }
        h4 { font-size: clamp(1.125rem, 2vw, 1.5rem); }
        p, li { font-size: clamp(0.875rem, 1.5vw, 1rem); }
        
        /* Responsive grid system */
        .responsive-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 1rem;
        }
        
        /* Media queries for different screen sizes */
        /* Mobile devices */
        @media (max-width: 640px) {
            .container {
                padding: 0 10px;
            }
            
            /* Stack elements that should be columns on larger screens */
            .mobile-stack {
                flex-direction: column !important;
            }
            
            /* Hide elements that shouldn't appear on mobile */
            .hide-on-mobile {
                display: none !important;
            }
        }
        
        /* Tablet devices */
        @media (min-width: 641px) and (max-width: 1024px) {
            .hide-on-tablet {
                display: none !important;
            }
        }
        
        /* Desktop devices */
        @media (min-width: 1025px) {
            .hide-on-desktop {
                display: none !important;
            }
        }
    </style>
</head>
<body>
    ${cleanHtml}
</body>
</html>`;

        // Update task status
        activeTasks.get(taskId).progress = 80;
        activeTasks.get(taskId).message = 'Creating deployable files...';

        fs.writeFileSync(htmlFilePath, completeHtml);
        
        // Create styles.css file
        const cssFilePath = path.join(generationDir, 'styles.css');
        fs.writeFileSync(cssFilePath, styleContent);
        
        // Create a README file
        const readmePath = path.join(generationDir, 'README.md');
        fs.writeFileSync(readmePath, `# UI Replication

This UI was generated by UI Replicator based on an uploaded image.

## Files
- index.html - The HTML structure of the UI
- styles.css - The custom CSS styles for the UI

## Usage
Open index.html in a web browser to view the UI.

## Dependencies
- Tailwind CSS (loaded from CDN)
`);

        // Create a zip file
        const zip = new JSZip();
        zip.file('index.html', completeHtml);
        zip.file('styles.css', styleContent);
        zip.file('README.md', fs.readFileSync(readmePath, 'utf8'));
        
        const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
        const zipPath = path.join(generationDir, 'ui-replication.zip');
        fs.writeFileSync(zipPath, zipBuffer);

        // Update task status to complete
        activeTasks.get(taskId).status = 'completed';
        activeTasks.get(taskId).progress = 100;
        activeTasks.get(taskId).message = 'HTML generation complete';
        
        // Clean up any triple apostrophes that might be in the HTML content
        const cleanedHtmlContent = htmlContent.replace(/```html|```/g, '');
        
        activeTasks.get(taskId).result = {
          html: cleanedHtmlContent,
          zipPath: `/download/${generationId}/ui-replication.zip`
        };
        
      } catch (error) {
        console.error('Error generating HTML:', error);
        
        // Update task status to error
        activeTasks.get(taskId).status = 'error';
        activeTasks.get(taskId).message = error instanceof Error ? error.message : 'An unknown error occurred';
        
        // Provide more specific error messages based on the error type
        if (error.status === 401) {
          activeTasks.get(taskId).message = 'Invalid API key. Please check your Claude API key.';
        } else if (error.status === 400 && error.error && error.error.type === 'invalid_request_error') {
          activeTasks.get(taskId).message = 'Invalid request to Claude API. Please check your model selection.';
        } else if (error.status === 429) {
          activeTasks.get(taskId).message = 'Rate limit exceeded. Please try again later.';
        } else if (error.status === 500) {
          activeTasks.get(taskId).message = 'Claude API server error. Please try again later.';
        }
      }
    })();
  } catch (error) {
    console.error('Error starting generation task:', error);
    res.status(500).json({ error: 'Error starting generation task. Please try again.' });
  }
});

// Route to check task status
app.get('/task-status/:taskId', (req, res) => {
  const { taskId } = req.params;
  
  if (!activeTasks.has(taskId)) {
    return res.status(404).json({ error: 'Task not found' });
  }
  
  const task = activeTasks.get(taskId);
  
  // If the task is complete, include the result
  if (task.status === 'completed') {
    return res.json({
      status: task.status,
      progress: task.progress,
      message: task.message,
      result: task.result
    });
  }
  
  // If the task is still processing, calculate the estimated time
  if (task.status === 'processing') {
    const elapsedTime = Date.now() - task.startTime;
    const estimatedTotalTime = calculateEstimatedTime(task.progress);
    const remainingTime = Math.max(0, estimatedTotalTime - elapsedTime);
    
    return res.json({
      status: task.status,
      progress: task.progress,
      message: task.message,
      estimatedRemainingSeconds: Math.ceil(remainingTime / 1000)
    });
  }
  
  // For error status, just return the status and message
  return res.json({
    status: task.status,
    message: task.message
  });
});

// Helper function to calculate estimated time based on progress
function calculateEstimatedTime(progress) {
  // Base time is 30 seconds for Claude 3 Haiku, adjust based on model
  const baseTime = 30000; // 30 seconds in milliseconds
  
  // If progress is 0, return the base time
  if (progress === 0) return baseTime;
  
  // Calculate estimated total time based on current progress
  return (baseTime / progress) * 100;
}

// Route to download the zip file
app.get('/download/:id/:filename', (req, res) => {
  const { id, filename } = req.params;
  const filePath = path.join(tempDir, id, filename);
  
  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

// Route to analyze and refine HTML based on comparison with original image
app.post('/analyze-and-refine', upload.single('image'), async (req, res) => {
  try {
    // Get the API key from the request
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) {
      return res.status(400).json({ error: 'API key is required' });
    }

    // Get the model from the request
    const model = req.body.model || 'claude-3-sonnet-20240229';

    // Get the image and HTML from the request
    const image = req.file;
    const { htmlContent } = req.body;
    
    if (!image) {
      return res.status(400).json({ error: 'Image is required' });
    }
    
    if (!htmlContent) {
      return res.status(400).json({ error: 'HTML content is required' });
    }

    // Create a unique task ID
    const taskId = Date.now().toString();
    
    // Initialize task status
    activeTasks.set(taskId, {
      status: 'processing',
      progress: 0,
      message: 'Starting analysis...',
      startTime: Date.now(),
      iterationCount: 0,
      maxIterations: 3
    });
    
    // Send the initial response with the task ID
    res.json({ 
      taskId,
      status: 'processing',
      message: 'Analysis started'
    });

    // Process the image and HTML asynchronously
    (async () => {
      try {
        // Initialize Anthropic client
        const anthropic = new Anthropic({
          apiKey: apiKey,
        });

        // Convert the image to base64
        const base64Data = image.buffer.toString('base64');
        const mediaType = image.mimetype;

        // Update task status
        activeTasks.get(taskId).progress = 10;
        activeTasks.get(taskId).message = 'Analyzing UI against original image...';

        let currentHtml = htmlContent;
        let iterationCount = 0;
        let maxIterations = 3;
        let isMatch = false;
        
        while (iterationCount < maxIterations && !isMatch) {
          // Update progress based on iteration
          const progressBase = 10 + (iterationCount * 30);
          activeTasks.get(taskId).progress = progressBase;
          activeTasks.get(taskId).message = `Iteration ${iterationCount + 1}: Analyzing UI against original image...`;
          activeTasks.get(taskId).iterationCount = iterationCount + 1;
          
          // Make the API call to Claude for analysis
          const analysisMessage = await anthropic.messages.create({
            model: model,
            max_tokens: 4000,
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: `I have an original UI design image and HTML code that was generated to replicate it. Please analyze how well the HTML matches the original design and suggest specific improvements to make the HTML more accurately match the image.

Focus on these aspects:
1. LAYOUT - How well does the spatial arrangement and proportions match?
2. COLORS - Are the colors in the HTML exactly matching the image?
3. TYPOGRAPHY - Do the fonts, sizes, and text styling match?
4. COMPONENTS - Are all UI elements (buttons, inputs, etc.) properly represented?
5. SPACING - Is the padding, margin, and overall spacing accurate?

If the match is already very good (95%+ accurate), please state that no further improvements are needed.
Otherwise, provide specific code changes to improve the match. Be precise with your suggestions.

Current iteration: ${iterationCount + 1} of ${maxIterations}`
                  },
                  {
                    type: "image",
                    source: {
                      type: "base64",
                      media_type: mediaType,
                      data: base64Data
                    }
                  },
                  {
                    type: "text",
                    text: `Here is the current HTML code:

\`\`\`html
${currentHtml}
\`\`\``
                  }
                ]
              }
            ]
          });

          // Extract the analysis and check if further improvements are needed
          const analysisText = analysisMessage.content[0].text;
          
          // Update progress
          activeTasks.get(taskId).progress = progressBase + 10;
          activeTasks.get(taskId).message = `Iteration ${iterationCount + 1}: Analyzing results...`;
          
          // Check if the match is already good
          if (analysisText.toLowerCase().includes('no further improvements') || 
              analysisText.toLowerCase().includes('95%+ accurate') ||
              analysisText.toLowerCase().includes('already very good match')) {
            isMatch = true;
            activeTasks.get(taskId).message = `Analysis complete: Good match achieved after ${iterationCount + 1} iterations`;
            activeTasks.get(taskId).progress = 100;
            break;
          }
          
          // If we've reached max iterations, break the loop
          if (iterationCount >= maxIterations - 1) {
            break;
          }
          
          // Otherwise, generate improved HTML
          activeTasks.get(taskId).message = `Iteration ${iterationCount + 1}: Generating improved HTML...`;
          activeTasks.get(taskId).progress = progressBase + 20;
          
          const improvementMessage = await anthropic.messages.create({
            model: model,
            max_tokens: 4000,
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: `Based on this analysis of the HTML compared to the original image:

${analysisText}

Please generate an improved version of the HTML that better matches the original image. Return ONLY the complete HTML code with no explanations or markdown formatting.`
                  }
                ]
              }
            ]
          });
          
          // Extract the improved HTML
          let improvedHtml = improvementMessage.content[0].text;
          
          // Clean up any markdown code block formatting
          improvedHtml = improvedHtml.replace(/```html|```/g, '');
          
          // Update the current HTML for the next iteration
          currentHtml = improvedHtml;
          
          // Increment iteration count
          iterationCount++;
          
          // Update progress
          activeTasks.get(taskId).progress = progressBase + 30;
          activeTasks.get(taskId).message = `Iteration ${iterationCount} complete. Analyzing results...`;
        }
        
        // Update task status to complete
        activeTasks.get(taskId).status = 'completed';
        activeTasks.get(taskId).progress = 100;
        activeTasks.get(taskId).message = `Analysis and refinement complete after ${iterationCount} iterations`;
        
        // Clean up any triple apostrophes that might be in the HTML content
        const cleanedHtmlContent = currentHtml.replace(/```html|```/g, '');
        
        // Create a unique ID for this generation
        const generationId = taskId;
        const generationDir = path.join(tempDir, generationId);
        fs.mkdirSync(generationDir);
        
        // Extract CSS from HTML content
        const styleMatch = cleanedHtmlContent.match(/<style>([\s\S]*?)<\/style>/);
        const styleContent = styleMatch ? styleMatch[1] : '';
        
        // Clean HTML (remove style tags)
        const cleanHtml = cleanedHtmlContent.replace(/<style>[\s\S]*?<\/style>/, '');
        
        // Create index.html file with the same template as the original generation
        const htmlFilePath = path.join(generationDir, 'index.html');
        
        // Create a complete HTML document with proper structure and external CSS
        const completeHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>UI Replication</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css">
    <link rel="stylesheet" href="styles.css">
    <style>
        /* Base responsive styles */
        *, *::before, *::after {
            box-sizing: border-box;
        }
        
        :root {
            /* Define base font sizes for different screen sizes */
            font-size: 16px;
        }
        
        body {
            margin: 0;
            padding: 0;
            width: 100%;
            min-height: 100vh;
            overflow-x: hidden;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
        }
        
        /* Ensure all images are responsive */
        img {
            max-width: 100%;
            height: auto;
            display: block; /* Removes bottom spacing */
        }
        
        /* Ensure inputs and buttons are touch-friendly */
        input, button, select, textarea, a {
            font-size: 16px; /* Prevents zoom on mobile */
            min-height: 44px; /* Minimum touch target size */
            min-width: 44px; /* Minimum touch target size */
        }
        
        /* Add responsive container if needed */
        .container {
            width: 100%;
            max-width: 1200px;
            margin: 0 auto;
            padding: 0 15px;
        }
        
        /* Responsive typography */
        h1 { font-size: clamp(1.75rem, 4vw, 2.5rem); }
        h2 { font-size: clamp(1.5rem, 3vw, 2rem); }
        h3 { font-size: clamp(1.25rem, 2.5vw, 1.75rem); }
        h4 { font-size: clamp(1.125rem, 2vw, 1.5rem); }
        p, li { font-size: clamp(0.875rem, 1.5vw, 1rem); }
        
        /* Responsive grid system */
        .responsive-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 1rem;
        }
        
        /* Media queries for different screen sizes */
        /* Mobile devices */
        @media (max-width: 640px) {
            .container {
                padding: 0 10px;
            }
            
            /* Stack elements that should be columns on larger screens */
            .mobile-stack {
                flex-direction: column !important;
            }
            
            /* Hide elements that shouldn't appear on mobile */
            .hide-on-mobile {
                display: none !important;
            }
        }
        
        /* Tablet devices */
        @media (min-width: 641px) and (max-width: 1024px) {
            .hide-on-tablet {
                display: none !important;
            }
        }
        
        /* Desktop devices */
        @media (min-width: 1025px) {
            .hide-on-desktop {
                display: none !important;
            }
        }
    </style>
</head>
<body>
    ${cleanHtml}
</body>
</html>`;

        fs.writeFileSync(htmlFilePath, completeHtml);
        
        // Create styles.css file
        const cssFilePath = path.join(generationDir, 'styles.css');
        fs.writeFileSync(cssFilePath, styleContent);
        
        // Create a README file
        const readmePath = path.join(generationDir, 'README.md');
        fs.writeFileSync(readmePath, `# UI Replication

This UI was generated by UI Replicator based on an uploaded image and refined through ${iterationCount} iterations of analysis.

## Files
- index.html - The HTML structure of the UI
- styles.css - The custom CSS styles for the UI

## Usage
Open index.html in a web browser to view the UI.

## Dependencies
- Tailwind CSS (loaded from CDN)
`);

        // Create a zip file
        const zip = new JSZip();
        zip.file('index.html', completeHtml);
        zip.file('styles.css', styleContent);
        zip.file('README.md', fs.readFileSync(readmePath, 'utf8'));
        
        const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
        const zipPath = path.join(generationDir, 'ui-replication.zip');
        fs.writeFileSync(zipPath, zipBuffer);
        
        activeTasks.get(taskId).result = {
          html: cleanedHtmlContent,
          zipPath: `/download/${generationId}/ui-replication.zip`,
          iterationCount: iterationCount,
          isMatch: isMatch
        };
        
      } catch (error) {
        console.error('Error analyzing and refining HTML:', error);
        
        // Update task status to error
        activeTasks.get(taskId).status = 'error';
        activeTasks.get(taskId).message = error instanceof Error ? error.message : 'An unknown error occurred';
        
        // Provide more specific error messages based on the error type
        if (error.status === 401) {
          activeTasks.get(taskId).message = 'Invalid API key. Please check your Claude API key.';
        } else if (error.status === 400 && error.error && error.error.type === 'invalid_request_error') {
          activeTasks.get(taskId).message = 'Invalid request to Claude API. Please check your model selection.';
        } else if (error.status === 429) {
          activeTasks.get(taskId).message = 'Rate limit exceeded. Please try again later.';
        } else if (error.status === 500) {
          activeTasks.get(taskId).message = 'Claude API server error. Please try again later.';
        }
      }
    })();
  } catch (error) {
    console.error('Error starting analysis task:', error);
    res.status(500).json({ error: 'Error starting analysis task. Please try again.' });
  }
});

// Clean up temporary files older than 1 hour
setInterval(() => {
  const oneHourAgo = Date.now() - (60 * 60 * 1000);
  
  fs.readdir(tempDir, (err, files) => {
    if (err) return;
    
    files.forEach(file => {
      const filePath = path.join(tempDir, file);
      fs.stat(filePath, (err, stats) => {
        if (err) return;
        
        if (stats.isDirectory() && stats.birthtimeMs < oneHourAgo) {
          fs.rm(filePath, { recursive: true, force: true }, err => {
            if (err) console.error(`Error removing directory ${filePath}:`, err);
          });
        }
      });
    });
  });
}, 60 * 60 * 1000); // Run every hour

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
