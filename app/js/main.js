document.addEventListener('DOMContentLoaded', function() {
    const dropArea = document.getElementById('drop-area');
    const fileInput = document.getElementById('file-input');
    const browseBtn = document.getElementById('browse-btn');

    // Event listeners
    browseBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileSelect);
    
    // Drag and drop events
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, preventDefaults, false);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        dropArea.addEventListener(eventName, highlight, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, unhighlight, false);
    });

    dropArea.addEventListener('drop', handleDrop, false);

    // Functions
    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    function highlight() {
        dropArea.classList.add('drag-over');
    }

    function unhighlight() {
        dropArea.classList.remove('drag-over');
    }

    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        handleFiles(files);
    }

    function handleFileSelect(e) {
        const files = e.target.files;
        handleFiles(files);
    }

    function handleFiles(files) {
        if (files.length === 0) return;

        // Hide any previous error messages
        UI.hideError();

        // For now, we'll process the first file
        // In a future enhancement, we could process multiple files
        const file = files[0];
        processFile(file);
    }

    function processFile(file) {
        // Store the current file name in a global object for later retrieval (in SAVE operations)
        window.storedFileName = file.name;

        // Display file information
        UI.displayFileInformation(file);

        // show img/video preview
        UI.showMediaPreview(file);

        // Show results section
        UI.showResults();

        // Extract metadata
        extractMetadata(file);
    }

    function extractMetadata(file) {
        // This function will be implemented in metadata-extractor.js
        // For now, we'll just show a loading message
        const parametersDataDiv = document.getElementById('parameters-data');
        const comfyuiDataDiv = document.getElementById('comfyui-data');
        const rawDataDiv = document.getElementById('raw-data');

        parametersDataDiv.innerHTML = '<p>Extracting AI generation parameters...</p>';
        comfyuiDataDiv.innerHTML = '<p>Extracting ComfyUI workflow...</p>';
        rawDataDiv.innerHTML = '<p>Extracting raw metadata...</p>';

        // Call the metadata extraction function
        MetadataExtractor.extract(file)
            .then(metadata => {
                // Extract prompt from ComfyUI workflow if available, prioritizing workflow data over parameters
                console.log("Checking for comfyuiWorkflow:", metadata.comfyuiWorkflow);
                //alert(UI.formatJSON(metadata.raw.prompt)); //FIX
                if (metadata.comfyuiWorkflow) {
                    // RL - extract AI Generation Parameters from Workflow Subset provided in metadata.raw.prompt
                    MetadataExtractor.extractAIGenerationParametersFromMetadataRawPrompt(metadata.raw.prompt, metadata.parameters);

                    console.log("Extracting prompt from workflow");
                    const promptFromWorkflow = MetadataExtractor.extractPromptFromWorkflow(metadata.comfyuiWorkflow);
                    //alert("WF-Prompt:\n" + promptFromWorkflow); //FIX
                    console.log("Prompt from workflow:", promptFromWorkflow);
                    if (promptFromWorkflow) {
                        // Always use the workflow prompt (method 2 preferred, method 1 fallback) if available
                        // instead of only using it when it's longer than the existing prompt
                        // RL - not use prompt from WF primarily, but keep it as fallback, if no other generation data is found
                        metadata.parameters['Workflow Prompt'] = promptFromWorkflow;
                    }
                }
                
                // Resolve model hashes if available
                return MetadataExtractor.resolveModelHashes(metadata);
            })
            .then(metadata => {
                // Display the extracted metadata
                UI.displayMetadata(metadata);
            })
            .catch(error => {
                UI.showError(`Error extracting metadata: ${error.message}`);
            });
    }
});