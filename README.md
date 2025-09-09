# AI Metadata Extractor

A modern web application for extracting ComfyUI workflows and AI generation parameters from images and videos.

## Features

- **Drag and Drop Interface**: Simple drag and drop functionality for easy file processing
- **Multiple File Format Support**: 
  - Images: PNG, JPEG, WEBP
  - Videos: MP4, AVI, MOV, WEBM
- **ComfyUI Workflow Extraction**: Extract and display ComfyUI workflow JSON data
- **AI Generation Parameters**: Extract all AI generation metadata including:
  - Model information
  - Sampler settings
  - Seed values
  - Prompts (positive and negative)
  - CFG scale
  - Steps
  - Size information
- **CivitAI Model Hash Resolution**: Automatically resolve model hashes to CivitAI model links
- **Modern UI**: Clean, responsive interface with collapsible sections

## Usage

1. Open `index.html` in a web browser
2. Drag and drop an image or video file onto the upload area, or click "Browse Files" to select a file
3. View the extracted metadata in the results section:
   - ComfyUI Workflow: Displays any ComfyUI workflow JSON found in the file
   - AI Generation Parameters: Shows all AI generation parameters extracted from the file
   - Raw Metadata: Displays all raw metadata found in the file
4. Click on model links in the "Resources used" section to visit the corresponding CivitAI model pages

## Technical Details

- **Pure Client-Side**: All processing happens in the browser - no server required
- **No External Dependencies**: Uses only vanilla JavaScript, HTML, and CSS
- **Privacy Focused**: Files are never uploaded to any server

## Supported Metadata Formats

- PNG tEXt, zTXt, and iTXt chunks
- JPEG EXIF and XMP metadata
- WEBP metadata (basic support)
- Video metadata (basic support)

## Model Hash Resolution

The application can resolve model hashes to CivitAI model links using the CivitAI API. When hashes are found in the metadata, they are automatically resolved to provide direct links to the corresponding models on CivitAI.

Example:
- Hash: `3086669265` → Resolves to a specific model on CivitAI
- Hash: `ba21023c70` → Resolves to a specific model on CivitAI

## Development

To modify or extend the application:

1. Edit `index.html` for structural changes
2. Modify `css/styles.css` for styling updates
3. Update `js/metadata-extractor.js` for metadata extraction logic
4. Modify `js/ui.js` for UI-related functionality
5. Update `js/main.js` for main application flow

## Testing

A test file is included at `test-extractor.html` which verifies:
- Basic functionality of the MetadataExtractor class
- Mock file processing capabilities
- Model hash resolution functionality

## Limitations

- Large files may take longer to process
- Some compressed metadata formats require additional libraries for full extraction
- WEBP and video metadata support is basic
- Requires a modern browser with JavaScript enabled

## Privacy

This application processes all files locally in your browser. No data is sent to any server, ensuring your files and metadata remain private.
