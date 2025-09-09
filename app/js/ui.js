class UI {
    static initialize() {
        // Initialize any UI components
        this.setupEventListeners();
        this.setupSectionToggles();
    }

    static setupEventListeners() {
        // Setup any additional event listeners needed
        // This could include keyboard shortcuts, window resize events, etc.

        // *** Attach listeners to all default copy buttons
        // OLD version attaching to each (currently) found "copy-btn"
        /*
        document.querySelectorAll(".copy-btn").forEach(button => {
            button.addEventListener("click", () => {
                // we always have a button object
                const codeBlock = button.parentElement.querySelector("code");
                // work with the codeBlock (see below) ...
            });
        });
        */

        // NEW "global" version with "event delegation"

        // Attach a single listener to a static parent element, like the document body.
        document.body.addEventListener("click", function(e) {
            // Check if the clicked element (e.target) has the 'copy-btn' class.
            // Using `closest()` is a robust way to find the button, even if a child element inside it was clicked.
            const copyBtn = e.target.closest(".copy-btn");

            // Here we need to filter what object was clicked
            // or extend to image gallery items etc.

            // Only proceed if a copy button was clicked.
            if (copyBtn) {
                const codeBlock = copyBtn.parentElement.querySelector("code");
                if (codeBlock) {
                    const code = codeBlock.innerText;

                    navigator.clipboard.writeText(code).then(() => {
                        // Show quick feedback from copy process

                        // This variable is declared in the outer scope of the setTimeout callback

                        // FIX: Store the original innerHTML to preserve the SVG
                        //const originalCopyBtnTextContent = copyBtn.textContent;
                        const originalCopyBtnInnerHTML = copyBtn.innerHTML;
                        // The 'originalCopyBtnInnerHTML' variable is accessible inside
                        // the anonymous function passed to setTimeout()
                        // because of a concept called a "closure".
                        // A 'closure' allows an inner function to
                        // remember and access variables from its outer (lexical) scope,
                        // even after the outer function has finished executing. 

                        // here in the code, the variable is already being passed correctly via this closure

                        copyBtn.textContent = "Copied!";

                        // The anonymous function (arrow function) here forms a "closure"
                        // It "remembers" the 'originalCopyBtnInnerHTML' variable from its parent scope
                        setTimeout(() => {
                            // FIX: Restore the original innerHTML
                            //copyBtn.textContent = originalCopyBtnTextContent;
                            copyBtn.innerHTML = originalCopyBtnInnerHTML;
                        }, 1500);

                        }).catch(err => {
                        console.error("Failed to copy: ", err);
                    });
                }
            }
        });
    

        // Add event listener for "Copy ..." and "Save ..." advanced buttons
        document.addEventListener('click', function(e) {
            // *** COPY buttons event handlers

            /*
            // ** retrieve stored ComfyUI workflow
            // Add event listener for "Copy JSON Workflow" button
            if (e.target && e.target.classList.contains('copy-btn-adv') && e.target.hasAttribute('data-workflow-id')) {
                const workflowId = e.target.getAttribute('data-workflow-id');
                if (window.storedArtefacts && window.storedArtefacts[workflowId]) {
                    UI.copyToClipboard(window.storedArtefacts[workflowId]);
                }
            }
            */

            /*
            // ** retrieve stored Prompts (Positive, Negative, ...)
            if (e.target && e.target.classList.contains('copy-btn-adv') && e.target.hasAttribute('data-prompt-id')) {
                const promptId = e.target.getAttribute('data-prompt-id');
                if (window.storedPrompts && window.storedPrompts[promptId]) {
                    UI.copyToClipboard(window.storedPrompts[promptId]);
                }
            }
            */


            // *** SAVE buttons event handlers

            // ** add event listener for "Save AI Generation Parameters" buttons
            if (e.target && e.target.classList.contains('download-btn') && e.target.hasAttribute('data-parameters-id')) {
                const parametersId = e.target.getAttribute('data-parameters-id');
                if (window.storedParameters && window.storedParameters[parametersId]) {
                    UI.saveAIGenerationParameters(window.storedParameters[parametersId]);
                }
            }

        });
    }

    static setupSectionToggles() {
        // Setup the toggle buttons for collapsible sections
        const toggleButtons = document.querySelectorAll('.toggle-btn');
        toggleButtons.forEach(button => {
            button.addEventListener('click', this.toggleSection);
        });
    }

    static toggleSection(e) {
        const button = e.target;
        const targetId = button.getAttribute('data-target');
        const targetContent = document.getElementById(targetId);
        
        if (targetContent.style.display === 'none') {
            targetContent.style.display = 'block';
            button.textContent = '▼';
        } else {
            targetContent.style.display = 'none';
            button.textContent = '▶';
        }
    }

    static showResults() {
        const resultsDiv = document.getElementById('results');
        resultsDiv.classList.remove('hidden');
    }

    static hideResults() {
        const resultsDiv = document.getElementById('results');
        resultsDiv.classList.add('hidden');
    }

    static showError(message) {
        const errorMessageDiv = document.getElementById('error-message');
        errorMessageDiv.textContent = message;
        errorMessageDiv.classList.remove('hidden');
        
        // Hide results when showing error
        this.hideResults();
    }

    static hideError() {
        const errorMessageDiv = document.getElementById('error-message');
        errorMessageDiv.classList.add('hidden');
    }

    static displayFileInformation(file) {
        const fileDetailsDiv = document.getElementById('file-details');
        const fileInfo = `
            <div class="metadata-item">
                <div class="metadata-key">File Name</div>
                <div class="metadata-value">${file.name}</div>
            </div>
            <div class="metadata-item">
                <div class="metadata-key">File Size</div>
                <div class="metadata-value">${this.formatFileSize(file.size)}</div>
            </div>
            <div class="metadata-item">
                <div class="metadata-key">File Type</div>
                <div class="metadata-value">${file.type || 'Unknown'}</div>
            </div>
            <div class="metadata-item">
                <div class="metadata-key">Last Modified</div>
                <div class="metadata-value">${new Date(file.lastModified).toLocaleString()}</div>
            </div>
        `;
        fileDetailsDiv.innerHTML = fileInfo;
        
        return;

        // Display preview for image/video files
        const mediaPreviewDiv = document.getElementById('image-preview');
        if (file.type && file.type.startsWith('image/')) {
            // Efficient → no Base64 bloating for videos or images, just direct blob streaming
            // Unifies preview handling → no need for FileReader anymore
            const reader = new FileReader();
            reader.onload = function(e) {
                mediaPreviewDiv.innerHTML = `<img src="${e.target.result}" alt="Preview of ${file.name}">`;
            };
            reader.readAsDataURL(file);
        } else {
            mediaPreviewDiv.innerHTML = '<p>No preview available</p>';
        }
    }
/*
🔹 1. What is URL.createObjectURL(file)?
It’s a browser API that turns a local File or Blob into a temporary URL string that only exists inside your page.
Example:
const url = URL.createObjectURL(file);
console.log(url);
// something like: blob:http://localhost:3000/469dcf2e-8fc5-4572-b7f0-37347c6c8bea
That blob:… URL is not on disk, not on the internet → it’s a handle into memory that the browser understands.
Unlike FileReader.readAsDataURL, it does not base64 encode the file → it just streams it directly. Faster & lighter.

🔹 2. Assigning it to <video>
Just like you currently assign the data: URL to <img>, you can assign the blob: URL to <video>:
const videoURL = URL.createObjectURL(file);
document.getElementById("image-preview").innerHTML =
  `<video src="${videoURL}" controls autoplay muted></video>`;
That’s it! ✅
controls → shows play/pause UI.
autoplay muted → auto-start (muted avoids autoplay-block by Chrome).

🔹 3. Why images worked with FileReader but videos failed
You’re currently doing:
const reader = new FileReader();
reader.onload = function(e) {
  imagePreviewDiv.innerHTML = `<img src="${e.target.result}">`;
};
reader.readAsDataURL(file);
That works fine for images, because data:image/png;base64,... is supported everywhere.
But for videos, data:video/mp4;base64,... is huge and sometimes Chrome refuses to seek/play properly. That’s why you saw the blob error.
👉 Solution: Use URL.createObjectURL(file) for video preview instead of FileReader.

🔹 4. Unifying your preview code
You can make one preview function that works for both:
const previewDiv = document.getElementById('image-preview');

if (file.type.startsWith('image/')) {
    const url = URL.createObjectURL(file);
    previewDiv.innerHTML = `<img src="${url}" alt="Preview of ${file.name}">`;
} else if (file.type.startsWith('video/')) {
    const url = URL.createObjectURL(file);
    previewDiv.innerHTML = `<video src="${url}" controls autoplay muted></video>`;
} else {
    previewDiv.innerHTML = '<p>No preview available</p>';
}
⚠️ Important: when you’re done (like switching files), call:
URL.revokeObjectURL(url);
to free memory.

🔹 5. Metadata reading stays the same
For parsing AI/EXIF/XMP metadata → still use await file.arrayBuffer() in your extractor.
For showing previews → use URL.createObjectURL(file) in <img> or <video>.
So:
FileReader (base64) → slower, bloats memory, good for images.
ObjectURL (blob:) → better for large files, required for video.
*/
    // Keep track of the last object URL so we can release it
    static lastObjectURL = null;

    static showMediaPreview(file) {
        // Clean up old URL if any
        // Safe memory → calls URL.revokeObjectURL before creating a new one
        if (this.lastObjectURL) {
            URL.revokeObjectURL(this.lastObjectURL);
            this.lastObjectURL = null;
        }

        // Display image preview for image files
        const mediaPreviewDiv = document.getElementById('media-preview');

        if (file.type.startsWith('image/')) {
            const url = URL.createObjectURL(file);
            this.lastObjectURL = url; // store as class property
            mediaPreviewDiv.innerHTML = `<img src="${url}" alt="Preview of ${file.name}">`;

        } else if (file.type.startsWith('video/')) {
            const url = URL.createObjectURL(file);
            this.lastObjectURL = url; // retrieve from class property
            // Responsive UI → max-width / max-height keeps video from breaking layout
            mediaPreviewDiv.innerHTML = `
                <video src="${url}" controls autoplay muted style="max-width:100%;max-height:400px;">
                    Your browser does not support the video tag.
                </video>
            `;

        } else {
            mediaPreviewDiv.innerHTML = '<p>No preview available</p>';
        }
    }

    /*
        Use the <use> tag in your buttons

        Instead of the full SVG code,
        you now just need a simple <svg> tag containing a <use> element.
        The <use> tag has an href attribute that points
        to the ID of your symbol (e.g., href="#icon-copy").
    */
    static COPY_BUTTON_HTML = `
      <button class="copy-btn" aria-label="Copy">
        <svg aria-hidden="true" width="1em" height="1em">
          <use href="#icon-copy"></use>
        </svg>
      </button>
    `;

    // Function for key/value pair with values in "code-block" divs,
    // and using the SVG symbol
    static createMetadataItemHtmlWithCopyButton(key, value) {
        const codeBlockHtml = `<pre><code>${this.formatValue(key, value)}</code></pre>`;

        return `
            <div class="metadata-item">
                <div class="metadata-key">${key}</div>
                <div class="metadata-value">
                    <div class="code-block">${codeBlockHtml}</div>
                </div>
                ${this.COPY_BUTTON_HTML}
            </div>
        `;
    }

    // Display/Save parameters in the specified order
    static PARAMETER_ORDER = [
        'Workflow Type', 'Version',
        'Prompt', 'Negative prompt', 'Workflow Prompt',
        'WF Consolidated Positive Prompt',
        'WF Consolidated Negative Prompt',
        'ADetailer prompt', 'ADetailer model',
        'Seed', 'Steps', 'Denoising strength',
        'CFG scale',
        'Clip skip', 'Sampler', 'Schedule type',
        'Width', 'Height'];

    static displayMetadata(metadata) {
        // Display ComfyUI workflow
        const comfyuiDataDiv = document.getElementById('comfyui-data');
        if (metadata.comfyuiWorkflow) {
            // Generate a unique ID for this workflow
            // we use that now only for SAVE and not for COPY

            //TODO - maybe remove this and adapt the saveWorkflow() function,
            // which still relies on this workflowId

            const workflowId = 'wf-' + Math.random().toString(36).substr(2, 9);
            // Store the workflow value in a global object for later retrieval
            if (!window.storedArtefacts) {
                window.storedArtefacts = {};
            }
            window.storedArtefacts[workflowId] = this.formatJSON(metadata.comfyuiWorkflow);

            /*
                The "standard" way now to use "Copy" buttons, which get their content
                directly from the rendered <code> tag
                If that (for any reason) is not sufficient because of formatting/escaping issues,
                then it is also possible to use the following button,
                which saves the data from a window.storedArtefacts location (see above)

                // alpha version bug:
                // avoid "overspilling" as Workflows can contain special characters
                //<button class="copy-btn-bug" onclick="UI.copyToClipboard(${JSON.stringify(JSON.stringify(metadata.comfyuiWorkflow))})">Copy JSON Workflow</button>

                // if we want a "dedicated" (adv) copy button, then:
                --> put the following button in the below 'comfyuiDataDiv':
                <button class="copy-btn-adv" data-workflow-id="${workflowId}" style="margin-top: 10px; margin-right: 10px;">Copy Full JSON Workflow</button>

            */
            comfyuiDataDiv.innerHTML = `
                <div class="comfyui-workflow"><code>${this.formatJSON(metadata.comfyuiWorkflow)}</code></div>
                ${this.COPY_BUTTON_HTML}
                <button class="download-btn" onclick="UI.saveWorkflow('${workflowId}')" style="margin-top: 10px;">Save JSON Workflow</button>
            `;
        } else {
            comfyuiDataDiv.innerHTML = '<p>No ComfyUI workflow found</p>';
        }
        
        // Display ComfyUI node types
        const nodesDataDiv = document.getElementById('nodes-data');
        if (metadata.comfyuiNodesDetailed && metadata.comfyuiNodesDetailed.length > 0) {
            // Use detailed node information
            nodesDataDiv.innerHTML = UI.formatComfyUINodesDetailed(metadata.comfyuiNodesDetailed);
        } else if (metadata.comfyuiNodeTypes && metadata.comfyuiNodeTypes.length > 0) {
            // Fallback to original format if detailed info is not available
            // Sort node types alphabetically
            const sortedNodeTypes = [...metadata.comfyuiNodeTypes].sort();
            const nodesList = sortedNodeTypes.map(nodeType => `<li>${nodeType}</li>`).join('');
            nodesDataDiv.innerHTML = `<ul>${nodesList}</ul><br>`;
        } else {
            nodesDataDiv.innerHTML = '<p>No ComfyUI nodes found</p>';
        }
        ////////CHECK
        if (metadata.raw.hashes) {
            /*
            // Generate a unique ID for model hashes
            const hashesId = 'hashes-' + Math.random().toString(36).substr(2, 9);
            // Store the hashes value in a global object for later retrieval
            if (!window.storedArtefacts) {
                window.storedArtefacts = {};
            }

            window.storedArtefacts[hashesId] = this.formatJSON(metadata.raw.hashes);
            */

            const modelHashesDataDiv = document.getElementById('model-hashes-data');
            // wrap the data which should be copied into a <code>data</code> block (not use <pre/>)
            modelHashesDataDiv.innerHTML = `
                <h3>Model Hashes</h3>
                <div class="model-hashes"><code>${this.formatValue("hashes", metadata.raw.hashes, "json")}</code></div>
                ${this.COPY_BUTTON_HTML}
            `;
        }

        if (metadata.raw.prompt) { // aka WF Inputs Prompts
            const comfyuiInputsDataDiv = document.getElementById('comfyui-inputs-data');
            comfyuiInputsDataDiv.innerHTML = `
                <h3>Prompt / WF Inputs</h3>
                <div class="comfyui-inputs"><code>${this.formatValue("prompt", metadata.raw.prompt, "json")}</code></div>
                ${this.COPY_BUTTON_HTML}
            `;
        }
        ////////

        // Display AI generation parameters in the specified order
        const parametersDataDiv = document.getElementById('parameters-data');
        if (metadata.parameters && Object.keys(metadata.parameters).length > 0) {
            //let parametersHTML = '';

            // at the top of the parameters section, add a "Save AI Generation Parameters" button,
            // which downloads all same visible parameters, as we show here below

            // Generate a unique ID for the parameters
            const parametersId = 'params-' + Math.random().toString(36).substr(2, 9);

            // Store the parameters in a global object for later retrieval
            if (!window.storedParameters) {
                window.storedParameters = {};
            }
            window.storedParameters[parametersId] = metadata.parameters;

            let parametersHTML = `
                <div class="metadata-item">
                    <div class="metadata-key"></div>
                    <div class="metadata-value">
                        <button class="download-btn" data-parameters-id="${parametersId}" style="margin-top: 10px;">Save AI Generation Parameters</button>
                    </div>
                </div>
            `;
                        
            for (const key of this.PARAMETER_ORDER) {
                if (metadata.parameters.hasOwnProperty(key)) {
                    const value = metadata.parameters[key];
                    // Skip displaying hashes in the parameters section as they'll be shown in the resolved models section
                    //TODO if (key === 'Hashes' || key === 'Model' || key === 'Model hash') continue;
                    
                    // Handle Width and Height as a combined field
                    if (key === 'Width' || key === 'Height') {
                        // Skip Height since we'll combine it with Width
                        if (key === 'Height') continue;
                        
                        // Combine Width and Height
                        const width = metadata.parameters['Width'] || '';
                        const height = metadata.parameters['Height'] || '';
                        if (width || height) {
                            parametersHTML += `
                                <div class="metadata-item">
                                    <div class="metadata-key">Width x Height</div>
                                    <div class="metadata-value">${width} x ${height}</div>
                                </div>
                            `;
                        }
                    } else if (key === 'Prompt') {
                        // Special handling for Prompt to add Copy & Download buttons on a new line
                        // Store the original prompt value for clipboard copy to avoid HTML formatting issues
                        // RL - cleanup already done in parseAIGenerationParameters() //FIX
                        // Clean up extra whitespace from the prompt
                        //const promptValue = value.toString().replace(/\s+/g, ' ').trim();
                        const promptValue = value.toString();

                        // Check if the prompt looks like JSON data (which shouldn't be displayed as a prompt)
                        if (this.isJSONData(promptValue)) {
                            console.warn('Detected JSON data in prompt field, skipping display');
                            //TODO continue; // Skip displaying this as a prompt
                        }
                        
                        //NOTUSED anymore - Generate a unique ID for this prompt
                        const promptId = 'prompt-' + Math.random().toString(36).substr(2, 9);

                        // Store the prompt value in a global object for later retrieval
                        if (!window.storedPrompts) {
                            window.storedPrompts = {};
                        }
                        window.storedPrompts[promptId] = promptValue;

                        parametersHTML += this.createMetadataItemHtmlWithCopyButton(key, value);
                                                
                    } else { // metadata-item already has the needed button-anchor style for positioning the copy button
                        if (key.toLowerCase().includes("prompt")) // all "prompts" get a code-block style and a "Copy button"
                            parametersHTML += this.createMetadataItemHtmlWithCopyButton(key, value);
                        else // standard metadata-item with no code-block and no copy button
                            parametersHTML += `
                            <div class="metadata-item">
                                <div class="metadata-key">${key}</div>
                                <div class="metadata-value"><code>${this.formatValue(key, value)}</code></div>
                            </div>
                        `;
                    }
                }
            }
            
            // Display any other parameters that aren't in the specified order
            // Skip displaying certain parameters that are either duplicates or shouldn't be shown
            const skipParameters = ['Hashes', 'Width', 'Height', 'Model', 'Model hash', 'parameters_raw'];
            for (var [key, value] of Object.entries(metadata.parameters)) {
                // Skip parameters that match certain patterns (like LORA weights)
                if (!this.PARAMETER_ORDER.includes(key) && !skipParameters.includes(key)) {
                    // Skip LORA weight parameters (they contain ":" and ">")
                    if (value.includes(':') && value.includes('>')) {
                        value = this.escapeHTML(value);
                        //TODO continue;
                    }
                    parametersHTML += `
                        <div class="metadata-item">
                            <div class="metadata-key">${key}</div>
                            <div class="metadata-value">${this.formatValue(key, value)}</div>
                        </div>
                    `;
                }
            }
            
            // Display resolved model links if available, ordered by type
            if (metadata.resolvedModels) {
                parametersHTML += `
                    <div class="metadata-item">
                        <div class="metadata-key">Resources used</div>
                        <div class="metadata-value">${this.formatResolvedModels(metadata.resolvedModels)}</div>
                    </div>
                `;
            }
            
            parametersDataDiv.innerHTML = parametersHTML;
        } else {
            if (metadata.parameters['Workflow Prompt']) {
                parametersDataDiv.innerHTML = this.escapeHTML(metadata.parameters['Workflow Prompt']);
            }
            else
                parametersDataDiv.innerHTML = '<p>No AI generation parameters found</p>';
        }

        // Display raw metadata
        const rawDataDiv = document.getElementById('raw-data');
        if (metadata.raw && Object.keys(metadata.raw).length > 0) {
            let rawHTML = '';
            for (const [key, value] of Object.entries(metadata.raw)) {
                // Skip displaying hashes in the raw metadata section as they'll be shown in the resolved models section
                // Also skip "parameters" to avoid duplication with "parameters_raw"
                //if (key === 'hashes' || key === 'prompt' || key === 'workflow') continue;
                // we now let the formatValue() function render a short info with a reference to ComfyUI workflow
                //TODO //CHECK
                
                rawHTML += `
                    <div class="metadata-item">
                        <div class="metadata-key">${key}</div>
                        <div class="metadata-value">${this.formatValue(key, value, "raw")}</div>
                    </div>
                `;
            }
            rawDataDiv.innerHTML = rawHTML;
        } else {
            rawDataDiv.innerHTML = '<p>No raw metadata found</p>';
        }
    }

    static formatResolvedModels(resolvedModels) {
        // Group models by type
        const modelsByType = {};
        for (const [key, model] of Object.entries(resolvedModels)) {
            // Translate type names into Group Names
            let displayTypeGroup = model.type; // type is "as-is" from the model version REST JSON
            // unknown types will carry forward
            if (displayTypeGroup === 'TextualInversion' || displayTypeGroup === 'Embedding')
                displayTypeGroup = 'EMBEDDING';
            else if (displayTypeGroup === 'LORA')
                displayTypeGroup === 'LORA';
            else if (displayTypeGroup === 'Checkpoint')
                displayTypeGroup = 'CHECKPOINT';
            
            if (!modelsByType[displayTypeGroup]) {
                modelsByType[displayTypeGroup] = [];
            }
            modelsByType[displayTypeGroup].push({key, model});
        }
        
        // Order types: CHECKPOINT, LORA, EMBEDDING
        const typeOrder = ['CHECKPOINT', 'LORA', 'EMBEDDING'];
        const orderedModels = [];
        
        // Add models in the specified order
        for (const type of typeOrder) {
            if (modelsByType[type]) {
                orderedModels.push(...modelsByType[type]);
            }
        }
        
        // Add any other types that aren't in the specified order
        for (const [type, models] of Object.entries(modelsByType)) {
            if (!typeOrder.includes(type)) {
                orderedModels.push(...models);
            }
        }
        
        let html = '';
        for (const {key, model} of orderedModels) {
            // Create image gallery if images are available
            let imageGallery = '';
            if (model.images && model.images.length > 0) {
                const galleryId = `gallery-${Math.random().toString(36).substr(2, 9)}`;

                /*
                    1. Separate the hover effect from the scroll logic
                    The core problem is that overflow: visible on the scrollable container (.image-gallery)
                    is what allows the image to escape its boundaries, but it also causes the overflow calculations to fail.
                    The solution is to use a nested structure:
                        - An outer wrapper for the scrolling behavior.
                        - An inner wrapper for the pop-out effect.

                    2. Updated HTML structure
                    Introduce a new container inside .image-gallery that handles the horizontal scrolling. 
                    
                    This nested structure is a common pattern for scenarios where you need scrolling behavior within a container that also has elements that escape its boundaries. 

                    The solution involves a three-tier structure:
                        .gallery-container: A flex container to hold the scroll buttons and the gallery.
                        .image-gallery: This is now just a wrapper for the scrolling content, with overflow: visible to allow the pop-out effect.
                        .gallery-scroll-inner: The inner flex container that handles the scrolling and contains the image-wrappers. 

                    This arrangement isolates the scrolling and pop-out effects from each other.
                */
               
                imageGallery = `
                    <div class="gallery-container">
                        <button class="scroll-btn" onclick="UI.scrollGallery('${galleryId}', -1)">‹</button>
                        <div class="image-gallery" id="${galleryId}">
                            <div class="gallery-scroll-inner">  <!-- New inner container -->
                                ${model.images.map((img, index) => {
                                    console.debug("image", img);

                                    // Generate a unique ID for this image
                                    const imageId = 'img-' + Math.random().toString(36).substr(2, 9);
                                    // Store the image value in a global object for later retrieval
                                    if (!window.storedArtefacts) {
                                        window.storedArtefacts = {};
                                    }
                                    window.storedArtefacts[imageId] = this.formatJSON(img);

                                    // in "FULL" image mode we need to change from img to img.url
                                    // Check if the URL is a video (common video extensions)
                                    const isVideo = /\.(mp4|webm|mov|avi|mkv)(\?|$)/i.test(img.url);
                                    //TODO - request the image urls only in thumbnail size
                                    // leverage the umg.url "trick" with "height=" url replacement
                                    // CSS .image-gallery img and video height: 120px; /* Fixed height for gallery consistency */
                                    // we cannot read the "height" at runtime as it is just created here
                                    //const element = document.querySelector('.image-gallery img');
                                    //const computedStyle = window.getComputedStyle(element);
                                    //const height = computedStyle.getPropertyValue('height');
                                    //console.log(height); // e.g., "120px"

                                    // for the new hover effect to "pop-out" the hovered image
                                    // with a "transform: scale(2)", we need to double the height of the downloaded image
                                    // to 2 * 120 = 240px, otherwise the image will look unsharp
                                    const imageGalleryimgHeight = 120;
                                    const transormScaleFactor = 2;
                                    const requestedHeight = imageGalleryimgHeight * transormScaleFactor;

                                    const galleryImglUrl = img.url.replace(/\/width=\d+\//, `/height=${requestedHeight}/`);

                                    const imageContent = isVideo ?
                                        `<video src="${galleryImglUrl}" class="model-image" controls muted loop onclick="UI.showMediaModal('${imageId}', '${img.url}', '${model.name}', ${index + 1}, ${model.images.length}, true)" onmouseover="UI.preloadImage('${img.url}')"></video>` :
                                        `<img src="${galleryImglUrl}" alt="Model example" class="model-image" onclick="UI.showMediaModal('${imageId}', '${img.url}', '${model.name}', ${index + 1}, ${model.images.length}, false)" onmouseover="UI.preloadImage('${img.url}')">`;

                                    return `<div class="image-wrapper">${imageContent}</div>`;
                                }).join('')}
                            </div>
                        </div>
                        <button class="scroll-btn" onclick="UI.scrollGallery('${galleryId}', 1)">›</button>
                    </div>
                `;
            }
            
            // Create download button if download URL is available
            let downloadButton = '';
            if (model.downloadUrl) {
                downloadButton = `<button class="download-btn" onclick="window.open('${model.downloadUrl}', '_blank')">Download</button>`;
            }
            
           // Translate model type for display
            let type = model.type; // type is "as-is" from the model version REST JSON
            let displayType = type; // unknown types will carry forward

            if (type === 'TextualInversion' || type === 'Embedding')
                displayType = 'EMBEDDING';
            else if (type === 'LORA')
                displayType = "LORA";    
            else if (type === 'Checkpoint')
                displayType = 'CHECKPOINT';

            html += `
                <div class="model-container">
                    <a href="${model.url}" target="_blank" rel="noopener noreferrer" class="model-link">${model.name}</a><br>
                    ${model.version}<br>
                    Type: ${displayType}<br>
                    Hash: ${model.hash}<br>
                    Model Size: ${model.fileSizeMB} MB<br>
                    Base Model: ${model.baseModel}<br>
                    Trained Words (Tags): ${model.trainedWords}<br>
                    ${imageGallery}
                    ${downloadButton}
                </div>
                <br>
            `;
        }

        return html;
    }

    static formatValue(key, value, section = "parameters") {
        if (typeof value === 'object' && value !== null) {
            // Special handling for EXIF data
            if (!Array.isArray(value)) {
                // Check if this looks like formatted EXIF data
                const keys = Object.keys(value);
                if (keys.some(key => ['Make', 'Model', 'DateTime', 'ExposureTime', 'FNumber', 'ISO'].includes(key))) {
                    // Format as a readable table-like structure
                    let html = '<div class="exif-data">';
                    for (const [key, val] of Object.entries(value)) {
                        html += `<div class="exif-item"><strong>${key}:</strong> ${val}</div>`;
                    }
                    html += '</div>';

                    return html;
                }
            }
            
            return this.escapeHTML(this.formatJSON(value)); // format as pretty JSON
        }
        
        // Check if string value looks like JSON data
        var stringValue = value.toString();

        if (this.isJSONData(stringValue)) {
            // RL - for now we show the one RAW properties: "parameters".
            // "workflow" is the full ComfyUI WF, which also can be saved.
            // "prompt" is a subset from the WF, only showing the "inputs" of all WF nodes
            // from here its easy to parse "AI Generation Parameters",
            // when they do not exist as "Traditional" metadata (which only Non-ComfyWF images have attached)
            // "hashes" is a summary of all used models shown in the "Used Resources" section
            if (section === "raw" && (key === "prompt" || key === "workflow" || key === "hashes"))
                return '[JSON Data - See above ComfyUI/WF-Inputs/Hashes sections]'; //CHECK

            stringValue = this.formatJSON(stringValue); // format as pretty JSON
        }

        // RL - escape for HTML < > chars, which can be present in prompts from LoRA weight parameters
        // as this content goes directly into a <div> escape for HTML display, otherwise it is cut into its own tag
        stringValue = this.escapeHTML(stringValue);
        
        return stringValue;
    }

    static escapeHTML(unescapedString) {
        /*
         * escape HTML < > chars, which can be present in prompts from LoRA weight parameters
         * as this content goes directly into a <div>, escape for HTML display, otherwise it is cut into its own tag,
         * and omitted in the UI for the prompt
         * 
         * function escapeHtml(unsafeString) {
         *      const escapedText = unsafeString
         *          .replace(/&/g, "&amp;")
         *          .replace(/</g, "&lt;")
         *          .replace(/>/g, "&gt;")
         *          .replace(/"/g, "&quot;")
         *          .replace(/'/g, "&apos;"); // or "&#039;"
         *      return escapedText;
         * }
         * 
         * const unescapedString = "This is <b>bold</b> & 'quoted' text with <script>alert('XSS')</script>";
         * const escapedString = escapeHtml(unescapedString);
         * console.log(escapedString);
         * // Output: This is &lt;b&gt;bold&lt;/b&gt; &amp; &#039;quoted&#039; text with &lt;script&gt;alert(&#039;XSS&#039;)&lt;/script&gt;
         * 
         * Alternatively, for displaying text content within an HTML element without rendering it as HTML,
         * using textContent or innerText properties of DOM elements is a simpler and safer method,
         * as they automatically handle the escaping of special characters.
         * 
         * Option #2
         * You can leverage the browser's own security features by creating a temporary DOM element,
         * setting its textContent, and retrieving its innerHTML.
         * This effectively lets the browser do the work for you.
         * 
         * function escapeHtmlWithDom(unsafeString) {
         *  const div = document.createElement('div');
         *  div.textContent = unsafeString;
         *  return div.innerHTML;
         * }
        */

        const div = document.createElement('div');
        div.textContent = unescapedString;

        return div.innerHTML;
    }
    
    static isJSONData(value) {
        // Check if the value looks like JSON data that shouldn't be displayed as a prompt
        if (typeof value !== 'string' || value.length < 50)
            return false;
        
        const trimmed = value.trim();
        
        // Check for JSON structure indicators
        if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
            (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
            
            // Additional checks for ComfyUI workflow indicators
            if (trimmed.includes('"class_type"') ||
                trimmed.includes('"nodes"') ||
                trimmed.includes('"links"') ||
                trimmed.includes('"widgets_values"') ||
                trimmed.includes('"inputs"')) {

                return true;
            }
            
            // Try to parse as JSON to confirm
            try {
                const parsed = JSON.parse(trimmed);
                // If it's a large object or array, it's likely workflow data
                if (typeof parsed === 'object' &&
                    (Array.isArray(parsed) || Object.keys(parsed).length > 5)) {

                    return true;
                }
            } catch (e) {
                // Not valid JSON
            }
        }
        
        return false;
    }

    static formatJSON(obj) {
        if (typeof obj === 'string') {
            try {
                obj = JSON.parse(obj);
            } catch (e) {
                return obj;
            }
        }
        return JSON.stringify(obj, null, 2);
    }

    static formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    static formatComfyUINodesDetailed(nodesDetailed) {
        if (!nodesDetailed || nodesDetailed.length === 0) return 'None found';
        
        // Process nodes to extract detailed information
        const processedNodes = nodesDetailed.map(node => {
            // Extract cnr_id from properties, use defaults for specific node types
            let cnrId = node.properties && node.properties.cnr_id ? node.properties.cnr_id : '';
            
            // RL - special handling for Nodes without a cnr_id
            // Use "comfy-core" as default for GetNode and SetNode types
            //if (!cnrId && (node.type === 'GetNode' || node.type === 'SetNode')) {
            //  cnrId = 'comfy-core';
            //}
            // RL - as it seems, that all newer ComfyUI nodes not have any cnr_id
            // we well also add them to the "comfy-core" group of nodes
            if (!cnrId) {
                cnrId = 'comfy-core';
            }
            
            // Use "rgthree-comfy" for "Fast Groups Muter (rgthree)"
            if (!cnrId && node.type && node.type.includes('Fast Groups Muter (rgthree)')) {
                cnrId = 'rgthree-comfy';
            }
            
            // Extract model files from widgets_values
            let modelFiles = [];
            
            // Handle different types of widgets_values
            if (Array.isArray(node.widgets_values)) {
                // Check each item in widgets_values
                node.widgets_values.forEach((item, index) => {
                    if (typeof item === 'string') {
                        // Direct string value
                        if (/\.(pth|pt|safetensors|sft)(\?v=[0-9]+)?$/.test(item)) {
                            modelFiles.push(item);
                        }
                    } else if (typeof item === 'object' && item !== null) {
                        // Object with properties
                        if (item.lora && /\.(pth|pt|safetensors|sft)(\?v=[0-9]+)?$/.test(item.lora)) {
                            // For Power Lora Loader nodes
                            const prefix = item.on === true ? 'ON: ' : item.on === false ? 'OFF: ' : '';
                            modelFiles.push(`${prefix}${item.lora}`);
                        }
                        
                        // Check other string properties in the object
                        Object.values(item).forEach(value => {
                            if (typeof value === 'string' && /\.(pth|pt|safetensors|sft)(\?v=[0-9]+)?$/.test(value)) {
                                // For Power Lora Loader nodes, check if we have an "on" status in the previous item
                                if (node.type && node.type.includes('Power Lora Loader')) {
                                    // Look for "on" status in the previous item
                                    const prevItem = node.widgets_values[index - 1];
                                    if (prevItem && typeof prevItem === 'object' && prevItem !== null) {
                                        const prefix = prevItem.on === true ? 'ON: ' : prevItem.on === false ? 'OFF: ' : '';
                                        if (!modelFiles.includes(`${prefix}${value}`)) {
                                            modelFiles.push(`${prefix}${value}`);
                                        }
                                    } else {
                                        modelFiles.push(value);
                                    }
                                } else {
                                    // Check if this file is already in the list
                                    const isDuplicate = modelFiles.some(file => file.includes(value));
                                    if (!isDuplicate) {
                                        modelFiles.push(value);
                                    }
                                }
                            }
                        });
                    }
                });
            }
            
            return {
                type: node.type || 'Unknown',
                cnrId: cnrId,
                modelFiles: modelFiles,
                key: `${node.type || 'Unknown'}_${cnrId}_${modelFiles.sort().join('|')}` // Create unique key for deduplication
            };
        });
        
        // Remove duplicates based on the key
        const uniqueNodes = [];
        const seenKeys = new Set();
        
        processedNodes.forEach(node => {
            if (!seenKeys.has(node.key)) {
                seenKeys.add(node.key);
                uniqueNodes.push(node);
            }
        });
        
        // Group nodes by cnr_id
        const groupedNodes = {};
        uniqueNodes.forEach(node => {
            const groupKey = node.cnrId || 'Unknown';
            if (!groupedNodes[groupKey]) {
                groupedNodes[groupKey] = [];
            }
            groupedNodes[groupKey].push(node);
        });
        
        // Sort groups alphabetically
        const sortedGroupKeys = Object.keys(groupedNodes).sort();
        
        // Sort nodes within each group alphabetically
        const sortedGroups = {};
        sortedGroupKeys.forEach(groupKey => {
            sortedGroups[groupKey] = groupedNodes[groupKey].sort((a, b) => {
                // Sort by node type first
                const typeComparison = a.type.localeCompare(b.type);
                if (typeComparison !== 0) {
                    return typeComparison;
                }
                // If same type, sort by model files
                return a.modelFiles.join('').localeCompare(b.modelFiles.join(''));
            });
        });
        
        // Format the output as a table
        let tableHTML = '<table style="width: 100%; border-collapse: collapse;">';
        
        sortedGroupKeys.forEach((groupKey, index) => {
            const nodesInGroup = sortedGroups[groupKey];
            
            // Create the group content
            let groupContent = '';
            nodesInGroup.forEach(node => {
                groupContent += `• ${node.type}<br>`;
                
                if (node.modelFiles.length > 0) {
                    // Add model files with proper indentation and yellow color
                    const modelList = node.modelFiles.map(file => `  - <span style="color: yellow;">${file}</span>`).join('<br>');
                    groupContent += `${modelList}<br>`;
                }
            });
            
            // Add table row for this group
            tableHTML += `
                <tr>
                    <td style="width: 1%; white-space: nowrap; vertical-align: top; color: green; font-weight: bold; padding-right: 15px;">${groupKey}</td>
                    <td style="vertical-align: top;">${groupContent}</td>
                </tr>
            `;
            
            // Add empty row after each group (except the last one)
            if (index < sortedGroupKeys.length - 1) {
                tableHTML += '<tr><td colspan="2" style="height: 20px;"></td></tr>';
            }
        });
        
        tableHTML += '</table>';
        
        return tableHTML;
    }

    static copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => {
            alert('Copied to clipboard!');
        }).catch(err => {
            console.error('Failed to copy: ', err);
        });
    }

    static downloadTextArtefact(fileNameWithExt, fileMimeType, textArtefact) {
        // generate browser-safe blob with Url
        const blob = new Blob([textArtefact], { type: `'${fileMimeType}'` });
        const url = URL.createObjectURL(blob);

        // create a download link for this blob
        const a = document.createElement('a');
        a.href = url;
        a.download = fileNameWithExt;

        // add the download link to the body
        document.body.appendChild(a);

        a.click(); // start the download thru the browser

        // remove the download link
        document.body.removeChild(a);

         // free up memeory
        URL.revokeObjectURL(url);
    }

    static saveWorkflow(workflowId) {
        if (window.storedArtefacts && window.storedArtefacts[workflowId]) {
            const workflowJSON = window.storedArtefacts[workflowId];
            const fileNameWithExt = `workflow_(${window.storedFileName}).json`;

            this.downloadTextArtefact(fileNameWithExt, 'application/json', workflowJSON);
        }
    }

    static saveAIGenerationParameters(parameters) {
        if (!parameters)
            return;

        // Generate the AI generation parameters text in the requested format
        let parametersText = `AI Generation Parameters for Image ${window.storedFileName}\n\n`;
                    
        for (const key of this.PARAMETER_ORDER) {
            if (parameters.hasOwnProperty(key)) {
                const value = parameters[key];
                // Skip displaying hashes in the parameters section
                //TODO if (key === 'Hashes' || key === 'Model' || key === 'Model hash') continue;
                
                // Handle Width and Height as a combined field
                if (key === 'Width' || key === 'Height') {
                    // Skip Height since we'll combine it with Width
                    if (key === 'Height') continue;
                    
                    // Combine Width and Height
                    const width = parameters['Width'] || '';
                    const height = parameters['Height'] || '';
                    if (width || height) {
                        parametersText += `Width x Height: ${width} x ${height}\n\n`;
                    }
                } else {
                    // for all "prompt" parameters, put their values on a separate line (for easier consumption later)
                    parametersText += `${key}: ${(key.toLowerCase().includes("prompt")) ? '\n' : ''}${value}\n\n`; // separate with a blank line
                }
            }
        }
        
        // Add any other parameters that aren't in the specified order
        //const skipParameters = ['Hashes', 'Width', 'Height', 'Model', 'Model hash', 'parameters_raw'];
        const skipParameters = []; //DEBUG - save all parameters
        for (const [key, value] of Object.entries(parameters)) {
            if (!this.PARAMETER_ORDER.includes(key) && !skipParameters.includes(key)) {
                // Skip LORA weight parameters (they contain ":" and ">")
                if (key.includes(':') && key.includes('>')) {
                    //TODO continue;
                }
                parametersText += `${key}: ${value}\n\n`; // separate with a blank line
            }
        }
        
        // Create and download the file
        const fileNameWithExt = `ai_generation_parameters_(${window.storedFileName}).txt`;
        this.downloadTextArtefact(fileNameWithExt, 'text/plain', parametersText);

    }

    static scrollGallery(galleryId, direction) {
        const gallery = document.getElementById(galleryId);
        if (!gallery) return;

        /*
            We now need to target the .gallery-scroll-inner element instead of the .image-gallery element
        */
        /*        
        const scrollAmount = 130; // Width of one image plus gap
        const currentScroll = gallery.scrollLeft;
        const newScroll = currentScroll + (direction * scrollAmount);
        
        gallery.scrollTo({
            left: newScroll,
            behavior: 'smooth'
        });
        */

        const scrollInner = gallery.querySelector('.gallery-scroll-inner');
        const scrollAmount = 250 * direction;
        scrollInner.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }

    static showMediaModal(imageId, mediaUrl, modelName, mediaIndex, totalMedia, isVideo = false) {
        let image = null;

        if (window.storedArtefacts && window.storedArtefacts[imageId])
            // deserialize the stored image metadata object
            image = JSON.parse(window.storedArtefacts[imageId]);

        // image, e.g.
        /*
    {
        "url": "https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/fee36d09-7dda-4745-87f1-4646f5fc5ff7/width=1536/67554754.jpeg",
        "nsfwLevel": 1,
        "width": 1536,
        "height": 2040,
        "hash": "UBFio*-p00D*0d9Yv_^,]{rp009a01Rk~Vng",
        "type": "image",
        "metadata": {
          "hash": "UBFio*-p00D*0d9Yv_^,]{rp009a01Rk~Vng",
          "size": 3516734,
          "width": 1536,
          "height": 2040
        },
        "minor": false,
        "poi": false,
        "meta": {
          "Eta": "0.67",
          "RNG": "NV",
          "ENSD": "31337",
          "Size": "1024x1360",
          "seed": 4158428821,
          "Model": "WAI-Nsfw-Illustrious-13",
          "steps": 30,
          "hashes": {
            "model": "a810e710a2"
          },
          "prompt": "1girl, furina \\(genshin impact\\), genshin impact, ahoge, ascot, bare legs, black ascot, blue eyes, blue hair, blue headwear, blue jacket, blue sash, brooch, eyelash ornament, gloves, jacket, jewelry, long hair, long sleeves, looking at viewer, sash, short shorts, shorts, sitting, solo, thigh strap, thighs, very long hair, white gloves, white shorts light censor., creates a striking contrast with the dark background and highlights the character's features. the overall mood of the image is mysterious and edgy\n,masterpiece,best quality,amazing quality,",
          "Version": "v1.10.1-84-g374bb6cc3",
          "sampler": "Euler a",
          "cfgScale": 7,
          "clipSkip": 2,
          "resources": [
            {
              "hash": "a810e710a2",
              "name": "WAI-Nsfw-Illustrious-13",
              "type": "model"
            }
          ],
          "Model hash": "a810e710a2",
          "Hires steps": "20",
          "Hires upscale": "1.5",
          "Schedule type": "Automatic",
          "Hires upscaler": "R-ESRGAN 4x+ Anime6B",
          "negativePrompt": "bad quality,worst quality,worst detail,sketch,censor,",
          "Denoising strength": "0.4",
          "Discard penultimate sigma": "True"
        },
        "availability": "Public",
        "hasMeta": true,
        "hasPositivePrompt": true,
        "onSite": false,
        "remixOfId": null
    },
        */
        
        // Create modal if it doesn't exist
        let modal = document.getElementById('media-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'media-modal';
            modal.className = 'image-modal';
            modal.innerHTML = `
                <span class="close-btn" onclick="UI.hideMediaModal()">&times;</span>
                <div class="zoom-controls">
                    <button class="zoom-btn" onclick="UI.zoomIn()">+</button>
                    <button class="zoom-btn" onclick="UI.resetZoom()">Reset</button>
                    <button class="zoom-btn" onclick="UI.zoomOut()">−</button>
                </div>
                <div class="media-container" id="media-container">
                    <img id="modal-image" src="" alt="Full size image" style="display: none;">
                    <video id="modal-video" controls muted loop style="display: none;"></video>
                </div>
                <div class="image-info" id="modal-info"></div>
            `;
            document.body.appendChild(modal);
            
            // Close modal when clicking outside the media
            modal.addEventListener('click', function(e) {
                if (e.target === modal) {
                    UI.hideMediaModal();
                }
            });
            
            // Close modal with Escape key
            document.addEventListener('keydown', function(e) {
                if (e.key === 'Escape' && modal.classList.contains('show')) {
                    UI.hideMediaModal();
                }

                if (e.key === 'Enter' && modal.classList.contains('show')) {
                    //const originalUrl = mediaUrl.replace(/\/width=\d+\//, "/original=true,quality=100/");
                    /*
                        The issue we're facing is a classic stale closure problem.
                        When we define the keydown event listener, the mediaUrl variable is captured in a closure with its initial value.
                        This value is then "frozen" for the lifetime of the event listener, which is typically until the page is reloaded.
                        One Solution: Update the mediaUrl inside the event handler
                        Instead of relying on the globally or externally scoped mediaUrl, fetch the most current URL from the DOM element
                        that displays the image inside your modal.
                        This is the most reliable method, as it doesn't depend on outside state. 

                    */
                    // re-evaluate the mediaUrl and Fetch the URL directly from the modal's image element
                    // cannot use (isVideo) as it has the same "closure" issue as "mediaUrl"
                    //const currentMediaUrl = (isVideo) ? modalVideo.src : modalImage.src;
                    // make sure we set modalVideo.src = "" for Image, and modalImage.src = "" for Video
                    const currentMediaUrl = (modalVideo.src === window.location.href) ? modalImage.src : modalVideo.src;
                    
                    const originalUrl = currentMediaUrl.replace(/\/width=\d+\//, "/original=true,quality=100/");
                    /*
                        / ... /: Denotes the start and end of the regular expression.
                        \/: Escapes the forward slash (/), which is a special character in regex. This matches the literal / in the URL path.
                        width=: Matches the literal text "width=".
                        \d+: Matches one or more digits (0-9).
                        \: Escapes the final forward slash. 
                    */
                    console.log("default image url", currentMediaUrl);
                    console.log("opening image as original in new Tab", originalUrl);

                    window.open(originalUrl, "_blank", "noopener, noreferrer");
                }
            });
        }
        
        // Update modal content
        const modalImage = document.getElementById('modal-image');
        const modalVideo = document.getElementById('modal-video');
        const modalInfo = document.getElementById('modal-info');
        const mediaContainer = document.getElementById('media-container');
        
        // Reset zoom state
        UI.currentZoom = 1;
        UI.isZoomed = false;
        
        if (isVideo) {
            modalImage.style.display = 'none'; // hide image
            modalImage.src = ""; // set ("" === window.location.href) Info for 'media-modal' Modal dialog reuse (disclosure problem)
            modalVideo.style.display = 'block';
            modalVideo.src = mediaUrl;
            modalInfo.innerHTML = `${modelName} - Video ${mediaIndex} of ${totalMedia}<br><b>Prompt</b>:&nbsp;${(image && image.hasPositivePrompt) ? image.meta.prompt : "Unknown"}`;
            
            // Add click handler for video zoom
            modalVideo.onclick = function() {
                UI.toggleZoom();
            };
        } else { // Image
            modalVideo.style.display = 'none'; // hide video
            modalVideo.src = ""; //  set ("" === window.location.href) Info for 'media-modal' Modal dialog reuse (disclosure problem)
            modalImage.style.display = 'block';
            modalImage.src = mediaUrl;
            modalInfo.innerHTML = `${modelName} - Image ${mediaIndex} of ${totalMedia}<br><b>Prompt</b>:&nbsp;${(image && image.hasPositivePrompt) ? image.meta.prompt : "Unknown"}`;
            
            // Add click handler for image zoom
            modalImage.onclick = function() {
                UI.toggleZoom();
            };
        }
        
        // Update cursor and zoom state
        UI.updateModalCursor();
        
        // Show modal
        modal.classList.add('show');
        document.body.style.overflow = 'hidden'; // Prevent background scrolling
    }

    static hideMediaModal() {
        const modal = document.getElementById('media-modal');
        if (modal) {
            modal.classList.remove('show');
            document.body.style.overflow = ''; // Restore background scrolling
            
            // Pause video if playing
            const modalVideo = document.getElementById('modal-video');
            if (modalVideo) {
                modalVideo.pause();
            }
        }
    }

    // Legacy function for backward compatibility
    static showImageModal(imageId, imageUrl, modelName, imageIndex, totalImages) {
        this.showMediaModal(imageId, imageUrl, modelName, imageIndex, totalImages, false);
    }

    static hideImageModal() {
        this.hideMediaModal();
    }

    static preloadImage(imageUrl) {
        // Preload image for faster display in modal
        const img = new Image();
        img.src = imageUrl;
    }

    static toggleZoom() {
        const modalImage = document.getElementById('modal-image');
        const modalVideo = document.getElementById('modal-video');
        const modal = document.getElementById('media-modal');
        
        if (!UI.isZoomed) {
            // Zoom in to original size
            UI.isZoomed = true;
            UI.currentZoom = 2; // 200% zoom for better viewing
            
            if (modalImage && modalImage.style.display !== 'none') {
                modalImage.classList.add('zoomed');
                modalImage.style.transform = `scale(${UI.currentZoom})`;
            }
            if (modalVideo && modalVideo.style.display !== 'none') {
                modalVideo.classList.add('zoomed');
                modalVideo.style.transform = `scale(${UI.currentZoom})`;
            }
            
            modal.classList.add('zoomed');
        } else {
            // Zoom out to fit screen
            UI.isZoomed = false;
            UI.currentZoom = 1;
            
            if (modalImage) {
                modalImage.classList.remove('zoomed');
                modalImage.style.transform = 'scale(1)';
            }
            if (modalVideo) {
                modalVideo.classList.remove('zoomed');
                modalVideo.style.transform = 'scale(1)';
            }
            
            modal.classList.remove('zoomed');
        }
        
        UI.updateModalCursor();
        UI.updateZoomButtons();
    }

    static zoomIn() {
        if (!UI.currentZoom) UI.currentZoom = 1;
        
        UI.currentZoom = Math.min(UI.currentZoom * 1.5, 5); // Max 500% zoom
        UI.isZoomed = UI.currentZoom > 1;
        
        const modalImage = document.getElementById('modal-image');
        const modalVideo = document.getElementById('modal-video');
        const modal = document.getElementById('media-modal');
        
        if (modalImage && modalImage.style.display !== 'none') {
            modalImage.style.transform = `scale(${UI.currentZoom})`;
            if (UI.isZoomed) modalImage.classList.add('zoomed');
        }
        if (modalVideo && modalVideo.style.display !== 'none') {
            modalVideo.style.transform = `scale(${UI.currentZoom})`;
            if (UI.isZoomed) modalVideo.classList.add('zoomed');
        }
        
        if (UI.isZoomed) modal.classList.add('zoomed');
        
        UI.updateModalCursor();
        UI.updateZoomButtons();
    }

    static zoomOut() {
        if (!UI.currentZoom) UI.currentZoom = 1;
        
        UI.currentZoom = Math.max(UI.currentZoom / 1.5, 0.5); // Min 50% zoom
        UI.isZoomed = UI.currentZoom > 1;
        
        const modalImage = document.getElementById('modal-image');
        const modalVideo = document.getElementById('modal-video');
        const modal = document.getElementById('media-modal');
        
        if (modalImage && modalImage.style.display !== 'none') {
            modalImage.style.transform = `scale(${UI.currentZoom})`;
            if (!UI.isZoomed) modalImage.classList.remove('zoomed');
        }
        if (modalVideo && modalVideo.style.display !== 'none') {
            modalVideo.style.transform = `scale(${UI.currentZoom})`;
            if (!UI.isZoomed) modalVideo.classList.remove('zoomed');
        }
        
        if (!UI.isZoomed) modal.classList.remove('zoomed');
        
        UI.updateModalCursor();
        UI.updateZoomButtons();
    }

    static resetZoom() {
        UI.currentZoom = 1;
        UI.isZoomed = false;
        
        const modalImage = document.getElementById('modal-image');
        const modalVideo = document.getElementById('modal-video');
        const modal = document.getElementById('media-modal');
        
        if (modalImage) {
            modalImage.style.transform = 'scale(1)';
            modalImage.classList.remove('zoomed');
        }
        if (modalVideo) {
            modalVideo.style.transform = 'scale(1)';
            modalVideo.classList.remove('zoomed');
        }
        
        modal.classList.remove('zoomed');
        
        UI.updateModalCursor();
        UI.updateZoomButtons();
    }

    static updateModalCursor() {
        const modal = document.getElementById('media-modal');
        if (!modal) return;
        
        if (UI.isZoomed) {
            modal.style.cursor = 'zoom-out';
        } else {
            modal.style.cursor = 'zoom-in';
        }
    }

    static updateZoomButtons() {
        const zoomButtons = document.querySelectorAll('.zoom-btn');
        if (zoomButtons.length >= 3) {
            // Update button states
            const zoomInBtn = zoomButtons[0]; // +
            const resetBtn = zoomButtons[1];   // Reset
            const zoomOutBtn = zoomButtons[2]; // -
            
            // Disable zoom in if at max zoom
            zoomInBtn.disabled = UI.currentZoom >= 5;
            
            // Disable zoom out if at min zoom
            zoomOutBtn.disabled = UI.currentZoom <= 0.5;
            
            // Reset is always enabled
            resetBtn.disabled = false;
        }
    }

    // const imageUrl = 'https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/9731fe2e-e32b-48f7-8811-25e20bf18ba8/original=true,quality=100/Fox_girl_107.png';
    static async loadImage(imageUrl) {
        // Load a new image into the app from URL

        // fileName = 'Fox_girl_107.png';
        const fileName = MetadataExtractor.getFileName(imageUrl);
        // fileExt = 'png';
        const fileExt = MetadataExtractor.getFileExtension(imageUrl);

        console.log(`Loading fileName '${fileName}' with fileExt '${fileExt}' from Url ${imageUrl} ...`);

        const response = await fetch(imageUrl);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const arrayBuffer = await response.arrayBuffer();

        /*
            get MIME-type from File
            - either read it from the headers of the image (safe method)
            - or map it from the file extension (can be faked)

            https://stackoverflow.com/questions/18299806/how-to-check-file-mime-type-with-javascript-before-upload

            https://en.wikipedia.org/wiki/List_of_file_signatures

            https://mimesniff.spec.whatwg.org/#matching-an-image-type-pattern
            (this one even has an algorithm outlined)
        */

        // read the first 4-Bytes
        var arrBytes = (new Uint8Array(arrayBuffer)).subarray(0, 4);
        var fileHeader = "";
        for(var i = 0; i < arrBytes.length; i++) {
            fileHeader += arrBytes[i].toString(16); // HEX notation string
        }
        console.log(`4-Byte file header: ${fileHeader}`);
        
        // type = 'image/png';
        let type = undefined;

        // for now we only support PNG, JPEG, WEBP and GIF
        switch (fileHeader.toUpperCase()) {
            case "89504E47": // "?PNG"... CR LF SUB LF
                type = "image/png";
                break;

            case "52494646": // "RIFF"...size...WEBPVP
                type = "image/webp";
                break;

            case "47494638": // "GIF8"...7|8a
                type = "image/gif";
                break;

            case "FFD8FFE0":
            case "FFD8FFE1":
            case "FFD8FFE2":
            case "FFD8FFE3":
            case "FFD8FFE8":
                type = "image/jpeg";
                break;

            default: // here we can fall-back to extension mapping
                type = "unknown"; // Or we can use the blob.type as fallback
                break;
        }

        // Create a File-like object
        const testFile = new File([arrayBuffer], fileName, { type: type });

        // *** this runs fine but does not "trigger" the fileInput processing
        // for security reasons we need to work with DataTransfers
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(testFile);
        //const fileInput = document.querySelector('input[type="file"]');
        const fileInput = document.getElementById('file-input');

        // drop the Test Image for processing
        fileInput.files = dataTransfer.files;

        console.log(`transfered fileName '${fileName}' with MimeType '${type}' loaded from Url ${imageUrl}`);

        return testFile;
    }
}

// Initialize UI when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    UI.initialize();
});

// Make UI available globally
window.UI = UI;