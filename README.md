# UI Replicator

A React application that allows users to upload images of UI designs and generate HTML code that replicates the interface shown in the image.

## Features

- **Image Upload**: Drag and drop or select images of UI designs
- **HTML Generation**: Uses Claude Sonnet 3.7 to analyze images and generate corresponding HTML code
- **Live Preview**: See the generated HTML rendered in real-time
- **Settings Management**: Configure your Claude API key for AI-powered UI generation

## Tech Stack

- React 18
- TypeScript
- Vite
- Tailwind CSS
- Shadcn UI
- React Dropzone for file uploads

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

3. Start the development server:

```bash
npm run dev
```

4. Open your browser and navigate to the URL shown in the terminal (typically http://localhost:5173)

### Configuration

To use the HTML generation feature, you need to:

1. Obtain a Claude API key from Anthropic
2. Enter your API key in the Settings tab of the application
3. Your API key is stored locally in your browser and is never sent to our servers

## Usage

1. Navigate to the "Upload Image" tab
2. Drag and drop an image of a UI design or click to select one
3. Click "Generate HTML" to analyze the image and generate the corresponding code
4. View the generated HTML code and its live preview
5. Copy the code to use in your own projects

## License

MIT
