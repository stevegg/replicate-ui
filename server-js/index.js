const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { Anthropic } = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const ffmpeg = require('fluent-ffmpeg');
const { file: tmpFile, dir: tmpDir } = require('tmp-promise');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Enable CORS
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increase limit for base64 images

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit for video files
});

// Create a directory for temporary files if it doesn't exist
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir);
}

// Serve static files from the temp directory
app.use('/temp', express.static(tempDir));

// Store active generation tasks with their status
const activeTasks = new Map();

// Function to extract frames from a video
async function extractFramesFromVideo(videoBuffer, options = {}) {
  try {
    const {
      maxFrames = 15,
      minInterval = 0.5, // Minimum seconds between frames
      motionThreshold = 0.15 // Threshold for motion detection (0-1)
    } = options;
    
    // Create temporary files for video and frames
    const { path: videoPath } = await tmpFile({ postfix: '.mp4' });
    const { path: framesDir } = await tmpDir();
    
    // Write video buffer to temporary file
    fs.writeFileSync(videoPath, videoBuffer);
    
    // Extract video metadata using ffprobe
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) {
          fs.unlinkSync(videoPath);
          return reject(err);
        }
        
        const duration = metadata.format.duration;
        const fps = metadata.streams[0].r_frame_rate ? 
                   eval(metadata.streams[0].r_frame_rate) : 30;
        
        // Calculate optimal frame extraction strategy
        let frameCount;
        let interval;
        
        if (duration <= 5) {
          // For short videos, extract more frames
          frameCount = Math.min(Math.ceil(duration / 0.3), maxFrames);
          interval = duration / frameCount;
        } else if (duration <= 15) {
          // For medium videos
          frameCount = Math.min(Math.ceil(duration / 0.5), maxFrames);
          interval = duration / frameCount;
        } else {
          // For longer videos
          frameCount = maxFrames;
          interval = duration / frameCount;
        }
        
        // Ensure we don't extract frames too close together
        interval = Math.max(interval, minInterval);
        
        // Calculate timestamps for frame extraction
        const timestamps = [];
        
        // Always capture the first frame (UI initial state)
        timestamps.push(0);
        
        // Calculate intervals for remaining frames
        if (frameCount > 1) {
          for (let i = 1; i < frameCount; i++) {
            timestamps.push(Math.min(i * interval, duration - 0.1));
          }
        }
        
        console.log(`Extracting ${timestamps.length} frames from ${duration.toFixed(1)}s video`);
        
        // Extract frames at the calculated timestamps
        const framePromises = timestamps.map((timestamp, index) => {
          return new Promise((resolveFrame, rejectFrame) => {
            const outputPath = path.join(framesDir, `frame_${index}.jpg`);
            
            ffmpeg(videoPath)
              .screenshots({
                timestamps: [timestamp],
                filename: `frame_${index}.jpg`,
                folder: framesDir,
                size: '1280x720' // Standardize frame size
              })
              .on('end', () => {
                // Read the frame data
                const frameData = fs.readFileSync(outputPath);
                resolveFrame({
                  buffer: frameData,
                  timestamp: timestamp,
                  index: index,
                  path: outputPath
                });
              })
              .on('error', (err) => {
                rejectFrame(err);
              });
          });
        });
        
        // Wait for all frames to be extracted
        Promise.all(framePromises)
          .then(frames => {
            // Clean up temporary files
            fs.unlinkSync(videoPath);
            
            resolve({
              frames,
              duration,
              fps,
              totalFrames: Math.round(duration * fps)
            });
          })
          .catch(err => {
            // Clean up on error
            fs.unlinkSync(videoPath);
            reject(err);
          });
      });
    });
  } catch (error) {
    console.error('Error extracting frames:', error);
    throw error;
  }
}

// Function to create a frame analysis prompt
function createFrameAnalysisPrompt(frameIndex, totalFrames, timestamp, duration, previousFrameIndex = null) {
  let prompt = `This is frame ${frameIndex + 1} of ${totalFrames}, captured at ${timestamp.toFixed(1)} seconds into the ${duration.toFixed(1)}-second video.`;
  
  if (frameIndex === 0) {
    prompt += `\n\nThis is the initial state of the UI. Please analyze the layout, components, and overall structure in extreme detail. Identify ALL interactive elements that might change in later frames. Note the exact visual appearance including colors, sizes, positions, and typography.`;
  } else {
    prompt += `\n\nPlease analyze EXACTLY how the UI has changed from ${previousFrameIndex !== null ? `frame ${previousFrameIndex + 1}` : 'the previous frame'}.`;
    prompt += `\n\nFocus on:
1. EXACTLY which UI elements have changed (position, size, color, visibility, etc.) - be precise about the nature of each change
2. What specific user interaction most likely caused these changes (click, hover, drag, scroll, etc.)
3. Any animations or transitions that are occurring, including their timing and easing
4. The exact sequence and flow of the interaction
5. Any state changes in the UI (e.g., form validation, toggling, selection states)`;
  }
  
  return prompt;
}

// Function to create a comprehensive interaction analysis
function createInteractionSummaryPrompt(frameCount, duration) {
  return `Now that you've analyzed all ${frameCount} frames from this ${duration.toFixed(1)}-second video, please provide an EXTREMELY DETAILED summary of the UI interactions you've observed.

1. List ALL interactive elements identified with their exact appearance and behavior
2. Describe the complete interaction flow from beginning to end with precise timing
3. Detail ALL animations, transitions, or state changes with their exact properties
4. Explain the exact cause-and-effect relationships between user actions and UI responses
5. Describe any conditional logic or complex interaction patterns in detail
6. Note any micro-interactions or subtle effects that might be easy to miss

This summary will be used to generate JavaScript that EXACTLY replicates these interactions, so be as comprehensive and precise as possible. The goal is to create a web page that behaves IDENTICALLY to what's shown in the video.`;
}

// Function to create the final implementation prompt
function createImplementationPrompt(frameCount, duration, interactionSummary) {
  return `Based on your analysis of all ${frameCount} frames from the ${duration.toFixed(1)}-second video and the interaction summary:

${interactionSummary}

Please generate the complete HTML, CSS, and JavaScript implementation that EXACTLY replicates this UI and all its interactions. This is EXTREMELY IMPORTANT - the generated code must look and behave EXACTLY like the UI shown in the video frames.

Your implementation MUST:
1. Match the visual appearance of the UI with pixel-perfect accuracy
2. Implement all interactive elements with the EXACT same behavior as shown in the video
3. Include all animations and transitions with the EXACT same timing and easing
4. Handle all state changes and conditional logic precisely as demonstrated
5. Be responsive and work across different screen sizes
6. Use modern, clean code with detailed comments explaining the interaction logic

DO NOT simplify or omit any interactions or visual elements. The goal is to create a perfect replica of the UI shown in the video, including ALL interactions.

Provide the complete code with separate HTML, CSS, and JavaScript sections. The JavaScript must include ALL event handlers and interaction logic needed to make the UI fully functional.`;
}

// Function to handle Claude API calls with retry logic
async function callClaudeWithRetry(anthropic, options, maxRetries = 3, initialDelay = 2000) {
  let lastError;
  let retryCount = 0;
  
  while (retryCount < maxRetries) {
    try {
      return await anthropic.messages.create(options);
    } catch (error) {
      lastError = error;
      
      // Check if this is a retryable error
      const isOverloaded = error.status === 529 || 
                          (error.error && error.error.type === 'overloaded_error');
      const isRateLimited = error.status === 429;
      const isServerError = error.status >= 500;
      
      if (isOverloaded || isRateLimited || isServerError) {
        // Calculate exponential backoff delay
        const delay = initialDelay * Math.pow(2, retryCount);
        console.log(`Claude API error (${error.status || 'unknown'}): ${error.message}. Retrying in ${delay}ms...`);
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, delay));
        retryCount++;
      } else {
        // Non-retryable error
        throw error;
      }
    }
  }
  
  // If we've exhausted all retries
  console.error(`Failed after ${maxRetries} retries:`, lastError);
  throw lastError;
}

// Route to generate HTML from an image or video
app.post('/generate-html', upload.single('media'), async (req, res) => {
  try {
    // Get the API key from the request
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) {
      return res.status(400).json({ error: 'API key is required' });
    }

    // Get the model from the request
    const model = req.body.model || 'claude-3-opus-20240229';

    // Get the media file from the request
    const mediaFile = req.file;
    if (!mediaFile) {
      return res.status(400).json({ error: 'Image or video is required' });
    }

    // Check if the file is a video
    const isVideo = mediaFile.mimetype.startsWith('video/');
    
    // Create a unique task ID
    const taskId = Date.now().toString();
    
    // Initialize task status
    activeTasks.set(taskId, {
      status: 'processing',
      progress: 0,
      message: isVideo ? 'Starting video analysis...' : 'Starting image analysis...',
      startTime: Date.now(),
      isVideo: isVideo
    });
    
    // Send the initial response with the task ID
    res.json({ 
      taskId,
      status: 'processing',
      message: isVideo ? 'Video analysis started' : 'Image analysis started'
    });

    // Process the media file asynchronously
    (async () => {
      try {
        // Initialize Anthropic client
        const anthropic = new Anthropic({
          apiKey: apiKey,
        });

        // Update task status
        activeTasks.get(taskId).progress = 10;
        
        let base64Data;
        let mediaType;
        let extractedFrames = [];
        let videoDuration = 0;
        
        if (isVideo) {
          activeTasks.get(taskId).message = 'Extracting frames from video...';
          
          // Extract frames from video with enhanced options
          const { frames, duration, fps, totalFrames } = await extractFramesFromVideo(mediaFile.buffer, {
            maxFrames: 20,  // Extract up to 20 key frames
            minInterval: 0.2  // Minimum 0.2 seconds between frames
          });
          extractedFrames = frames;
          videoDuration = duration;
          
          // Use the first frame as the primary image for initial UI analysis
          base64Data = extractedFrames[0].buffer.toString('base64');
          mediaType = 'image/jpeg';
          
          activeTasks.get(taskId).message = `Extracted ${frames.length} frames from ${duration.toFixed(1)}s video. Analyzing UI and interactions...`;
          activeTasks.get(taskId).progress = 20;
        } else {
          // For images, just use the image directly
          base64Data = mediaFile.buffer.toString('base64');
          mediaType = mediaFile.mimetype;
          activeTasks.get(taskId).message = 'Analyzing image and extracting UI elements...';
        }

        // Prepare the prompt based on media type
        let prompt;
        
        if (isVideo) {
          prompt = `I have a video of a UI with interactions. I've extracted ${extractedFrames.length} key frames from this ${videoDuration.toFixed(1)}-second video to help you understand the UI flow and interactions. 

I'm showing you the first frame now, which represents the initial UI state. Please analyze this frame to understand the basic UI layout and components. In my next messages, I'll show you the subsequent frames to help you understand the interactions and state changes.

Please generate responsive HTML, CSS, and JavaScript that EXACTLY replicates this UI and its interactions. This is EXTREMELY IMPORTANT - the generated code must look and behave EXACTLY like the UI shown in the video frames.

Focus on:
1. The precise visual layout and components shown in the first frame
2. Interactive elements and their exact behavior across frames
3. Animations and transitions between UI states with accurate timing
4. User flows and navigation patterns exactly as demonstrated
5. Responsive design considerations

Please provide a complete implementation with HTML structure, CSS styling, and JavaScript for the interactions. The code should be well-structured, accessible, and follow best practices.`;
        } else {
          prompt = `I have an image of a UI design. Please analyze this image and generate responsive HTML and CSS that replicates this UI as accurately as possible. Focus on:
1. The visual layout and components
2. Spacing and alignment
3. Typography and text styling
4. Colors and visual styling
5. Responsive design considerations

Please provide a complete implementation with HTML structure and CSS styling. The code should be well-structured, accessible, and follow best practices.`;
        }

        // Make the API call to Claude with retry logic for the first frame/image
        const initialMessage = await callClaudeWithRetry(
          anthropic,
          {
            model: model,
            max_tokens: 4000,
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: prompt
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
          }
        );

        // Extract the initial HTML content from the response
        let htmlContent = initialMessage.content[0].text;
        
        // For videos, process additional frames to analyze interactions
        if (isVideo && extractedFrames.length > 1) {
          activeTasks.get(taskId).progress = 40;
          activeTasks.get(taskId).message = 'Analyzing UI interactions from video frames...';
          
          // Create a conversation with Claude showing the additional frames
          let messages = [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: prompt
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
            },
            {
              role: "assistant",
              content: [
                {
                  type: "text",
                  text: "I've analyzed the first frame of your UI video. Now I need to see the subsequent frames to understand the interactions and state changes."
                }
              ]
            }
          ];
          
          // Add each additional frame to the conversation with detailed analysis prompts
          for (let i = 1; i < extractedFrames.length; i++) {
            const frame = extractedFrames[i];
            const frameBase64 = frame.buffer.toString('base64');
            
            activeTasks.get(taskId).message = `Analyzing frame ${i+1} of ${extractedFrames.length}...`;
            activeTasks.get(taskId).progress = 40 + Math.floor((i / extractedFrames.length) * 20);
            
            // Create a detailed analysis prompt for this frame
            const framePrompt = createFrameAnalysisPrompt(
              i, 
              extractedFrames.length, 
              frame.timestamp, 
              videoDuration,
              i - 1
            );
            
            messages.push({
              role: "user",
              content: [
                {
                  type: "text",
                  text: framePrompt
                },
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: "image/jpeg",
                    data: frameBase64
                  }
                }
              ]
            });
            
            // Get Claude's analysis of this frame
            const frameAnalysisMessage = await callClaudeWithRetry(
              anthropic,
              {
                model: model,
                max_tokens: 1000,
                messages: messages
              }
            );
            
            // Add Claude's response to the conversation
            messages.push({
              role: "assistant",
              content: frameAnalysisMessage.content
            });
          }
          
          // Request a comprehensive summary of all interactions
          activeTasks.get(taskId).message = 'Creating comprehensive interaction analysis...';
          activeTasks.get(taskId).progress = 60;
          
          const interactionSummaryPrompt = createInteractionSummaryPrompt(
            extractedFrames.length,
            videoDuration
          );
          
          messages.push({
            role: "user",
            content: [
              {
                type: "text",
                text: interactionSummaryPrompt
              }
            ]
          });
          
          // Get Claude's comprehensive interaction summary
          const interactionSummaryMessage = await callClaudeWithRetry(
            anthropic,
            {
              model: model,
              max_tokens: 2000,
              messages: messages
            }
          );
          
          // Add Claude's interaction summary to the conversation
          messages.push({
            role: "assistant",
            content: interactionSummaryMessage.content
          });
          
          // Final prompt to generate the complete implementation based on all frames
          const implementationPrompt = createImplementationPrompt(
            extractedFrames.length,
            videoDuration,
            interactionSummaryMessage.content[0].text
          );
          
          messages.push({
            role: "user",
            content: [
              {
                type: "text",
                text: implementationPrompt
              }
            ]
          });
          
          // Get the final implementation
          activeTasks.get(taskId).message = 'Generating final implementation with interactions...';
          activeTasks.get(taskId).progress = 70;
          
          const finalImplementationMessage = await callClaudeWithRetry(
            anthropic,
            {
              model: model,
              max_tokens: 4000,
              messages: messages
            }
          );
          
          // Use the final implementation as our HTML content
          htmlContent = finalImplementationMessage.content[0].text;
        }

        // Update task status
        activeTasks.get(taskId).progress = 80;
        activeTasks.get(taskId).message = 'Processing generated code...';

        // Extract HTML, CSS, and JavaScript from the response
        let cleanedHtmlContent = '';
        let styleContent = '';
        let scriptContent = '';
        let iterationCount = 1;
        let isMatch = false;
        
        // Extract HTML content
        const htmlMatch = htmlContent.match(/<html[\s\S]*?<\/html>/i) || 
                          htmlContent.match(/<body[\s\S]*?<\/body>/i) ||
                          htmlContent.match(/```html([\s\S]*?)```/);
                          
        if (htmlMatch) {
          cleanedHtmlContent = htmlMatch[0].replace(/```html|```/g, '').trim();
        } else {
          // If no HTML tags found, use the entire response
          cleanedHtmlContent = htmlContent;
        }
        
        // Extract CSS content
        const cssMatch = htmlContent.match(/<style>([\s\S]*?)<\/style>/) || 
                         htmlContent.match(/```css([\s\S]*?)```/);
                         
        if (cssMatch) {
          styleContent = cssMatch[1].replace(/```css|```/g, '').trim();
        }
        
        // Extract JavaScript content
        const jsMatch = htmlContent.match(/<script>([\s\S]*?)<\/script>/) || 
                        htmlContent.match(/```javascript([\s\S]*?)```/) ||
                        htmlContent.match(/```js([\s\S]*?)```/);
                        
        if (jsMatch) {
          scriptContent = jsMatch[1].replace(/```(javascript|js)|```/g, '').trim();
        }
        
        // Clean the HTML content (remove style and script tags)
        let cleanHtml = cleanedHtmlContent
          .replace(/<style>[\s\S]*?<\/style>/gi, '')
          .replace(/<script>[\s\S]*?<\/script>/gi, '')
          .trim();
          
        // Create a unique generation ID
        const generationId = Date.now().toString();
        const generationDir = path.join(tempDir, generationId);
        fs.mkdirSync(generationDir, { recursive: true });
        
        // Create index.html file
        const htmlFilePath = path.join(generationDir, 'index.html');
        
        // Create a complete HTML document with proper structure and external CSS/JS
        const completeHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>UI Replication</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css">
    <link rel="stylesheet" href="styles.css">
    ${isVideo || scriptContent ? '<script defer src="script.js"></script>' : ''}
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
            font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
            line-height: 1.5;
        }
        
        /* Container for responsive layouts */
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
            grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
            gap: 1rem;
        }
        
        /* Mobile devices */
        @media (max-width: 640px) {
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
        
        // Create script.js file if it's a video or we have script content
        if (isVideo || scriptContent) {
          const scriptFilePath = path.join(generationDir, 'script.js');
          fs.writeFileSync(scriptFilePath, scriptContent);
        }
        
        // Create a README file
        const readmePath = path.join(generationDir, 'README.md');
        fs.writeFileSync(readmePath, `# UI Replication

This UI was generated by UI Replicator based on an uploaded ${isVideo ? 'video' : 'image'} and refined through ${iterationCount} iterations of analysis.

## Files
- index.html - The HTML structure of the UI
- styles.css - The custom CSS styles for the UI
${isVideo || scriptContent ? '- script.js - The JavaScript for interactions and animations' : ''}

## Usage
Open index.html in a web browser to view the UI.

## Dependencies
- Tailwind CSS (loaded from CDN)
`);

        // Create a zip file
        const zip = new JSZip();
        zip.file('index.html', completeHtml);
        zip.file('styles.css', styleContent);
        if (isVideo || scriptContent) {
          zip.file('script.js', scriptContent);
        }
        zip.file('README.md', fs.readFileSync(readmePath, 'utf8'));
        
        const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
        const zipPath = path.join(generationDir, 'ui-replication.zip');
        fs.writeFileSync(zipPath, zipBuffer);
        
        // Save extracted frames for debugging if it's a video
        if (isVideo && extractedFrames.length > 0) {
          const framesDir = path.join(generationDir, 'frames');
          fs.mkdirSync(framesDir, { recursive: true });
          
          extractedFrames.forEach((frame, index) => {
            const framePath = path.join(framesDir, `frame_${index}.jpg`);
            fs.writeFileSync(framePath, frame.buffer);
          });
          
          // Add frames to the zip file
          extractedFrames.forEach((frame, index) => {
            zip.file(`frames/frame_${index}.jpg`, frame.buffer);
          });
          
          // Update the zip file with frames
          const updatedZipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
          fs.writeFileSync(zipPath, updatedZipBuffer);
        }
        
        // Update task with result
        activeTasks.get(taskId).result = {
          html: cleanedHtmlContent,
          zipPath: `/download/${generationId}/ui-replication.zip`,
          iterationCount: iterationCount,
          isMatch: isMatch,
          frameCount: isVideo ? extractedFrames.length : 0,
          duration: isVideo ? videoDuration : 0
        };
        
        // Mark task as completed
        activeTasks.get(taskId).status = 'completed';
        activeTasks.get(taskId).progress = 100;
        activeTasks.get(taskId).message = 'Generation completed successfully';
        
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
        } else if (error.status === 529 || (error.error && error.error.type === 'overloaded_error')) {
          activeTasks.get(taskId).message = 'Claude API is currently overloaded. Please try again later or use a different model.';
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
  
  // Calculate estimated time remaining
  let estimatedRemainingSeconds = null;
  if (task.progress > 0) {
    const elapsedMs = Date.now() - task.startTime;
    const estimatedTotalMs = (elapsedMs / task.progress) * 100;
    const remainingMs = estimatedTotalMs - elapsedMs;
    estimatedRemainingSeconds = Math.round(remainingMs / 1000);
  }
  
  // If the task has a result, mark it as completed
  if (task.result) {
    task.status = 'completed';
    task.progress = 100;
  }
  
  res.json({
    ...task,
    estimatedRemainingSeconds
  });
});

// Route to analyze and refine UI
app.post('/analyze-refine', upload.single('media'), async (req, res) => {
  try {
    // Get the API key from the request
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) {
      return res.status(400).json({ error: 'API key is required' });
    }

    // Get the model from the request
    const model = req.body.model || 'claude-3-opus-20240229';

    // Get the HTML content from the request
    const htmlContent = req.body.htmlContent;
    if (!htmlContent) {
      return res.status(400).json({ error: 'HTML content is required' });
    }

    // Get the media file from the request
    const mediaFile = req.file;
    if (!mediaFile) {
      return res.status(400).json({ error: 'Image or video is required' });
    }

    // Check if the file is a video
    const isVideo = mediaFile.mimetype.startsWith('video/');
    
    // Create a unique task ID
    const taskId = Date.now().toString();
    
    // Initialize task status
    activeTasks.set(taskId, {
      status: 'processing',
      progress: 0,
      message: isVideo ? 'Starting video analysis for refinement...' : 'Starting image analysis for refinement...',
      startTime: Date.now(),
      isVideo: isVideo
    });
    
    // Send the initial response with the task ID
    res.json({ 
      taskId,
      status: 'processing',
      message: isVideo ? 'Video analysis for refinement started' : 'Image analysis for refinement started'
    });

    // Process the media file asynchronously
    (async () => {
      try {
        // Initialize Anthropic client
        const anthropic = new Anthropic({
          apiKey: apiKey,
        });

        // Convert the media to base64
        const base64Data = mediaFile.buffer.toString('base64');
        const mediaType = mediaFile.mimetype;

        // Update task status
        activeTasks.get(taskId).progress = 10;
        activeTasks.get(taskId).message = isVideo 
          ? 'Analyzing video and refining UI interactions...' 
          : 'Analyzing image and refining UI elements...';

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
          const analysisMessage = await callClaudeWithRetry(
            anthropic,
            {
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
            }
          );

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
          
          const improvementMessage = await callClaudeWithRetry(
            anthropic,
            {
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
            }
          );
          
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
        } else if (error.status === 529 || (error.error && error.error.type === 'overloaded_error')) {
          activeTasks.get(taskId).message = 'Claude API is currently overloaded. Please try again later or use a different model.';
        }
      }
    })();
  } catch (error) {
    console.error('Error starting refinement task:', error);
    res.status(500).json({ error: 'Error starting refinement task. Please try again.' });
  }
});

// Route to download generated files
app.get('/download/:generationId/:filename', (req, res) => {
  const { generationId, filename } = req.params;
  const filePath = path.join(tempDir, generationId, filename);
  
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  
  res.download(filePath);
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
          const analysisMessage = await callClaudeWithRetry(
            anthropic,
            {
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
            }
          );

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
          
          const improvementMessage = await callClaudeWithRetry(
            anthropic,
            {
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
            }
          );
          
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
        } else if (error.status === 529 || (error.error && error.error.type === 'overloaded_error')) {
          activeTasks.get(taskId).message = 'Claude API is currently overloaded. Please try again later or use a different model.';
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
