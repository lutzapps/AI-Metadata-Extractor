class UI {
    static processFile(file) {
        // Store the current file name in a global object for later retrieval (in SAVE operations)
        window.storedFileName = file.name;

        // Display file information
        UI.displayFileInformation(file);

        // show img/video preview
        UI.showMediaPreview(file);

        // Show results section
        UI.showResults();

        // Extract metadata
        MetadataExtractor.extractMetadata(file);
    }

    static initialize() {
        // *** Initialize any UI components
        // init settings dialog
        UI.initSettingsPanel();

        // get a fresh copy of the modal dict, ersonalized with userSettings.pan
        modal = this.initModal();

        // get a fresh copy of the state dict, personalized with userSettings.pan
        state = this.initState();

        this.setupEventListeners();
        this.setupSectionToggles(); // event-handlers
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

        /*
            NEW "global" version with "event delegation"

            Attach a single listener to a static parent element, like the document body.

            we could go up to the "document" level,
            but then we need to "handle" that all here
            for now we "scope" that to the "results" area
        */

        // if not in v7 speed test with enablePanning(), use global version
        if (!UI.v7SpeedTest)
            document.body.addEventListener('mousedown', UI.handleMouseDown);
        
        document.body.addEventListener('click', function(e) {
        //const resultsDiv = document.getElementById("results");
        //resultsDiv.addEventListener('click', function(e) {

            /*
        🔗      Add to our UI (index.html or app.js)

                ✅ How it works:
                    - App shell cache: only our core files (index, manifest, icons). Rarely changes.
                    - Runtime cache: anything loaded at runtime (images, metadata, JSON). Cleared separately.
                    - From the UI, our button sends a message to the SW → deletes only the runtime cache → app shell remains intact.
            */
            if (main.useServiceWorker) {
                //document.getElementById("clear-cache-btn").addEventListener("click", () => {
                const clearCacheBtn = e.target.closest(".clear-cache-btn");
                if (clearCacheBtn) {
                    if (navigator.serviceWorker.controller) {
                        navigator.serviceWorker.controller.postMessage("clear-runtime-cache");
                        alert("Runtime cache cleared ✅");
                    } else {
                        alert("No service worker active ❌");
                    }
                }
                //});

                return;
            }

            // global click handler for image zoom
            // support autoZoom on any image with class "zoom-target"
            const image = e.target.closest('.zoom-target');
            if (image) {
                UI.autoZoom(image, e);

                return;
            }

            // special handling for our "modal-media" class iamge/video
            const modalImage = e.target.closest('.modal-media');
            // in v7 speed test - disable global image click handler
            if (!UI.v7SpeedTest && modalImage) {
                if (UI.stateDragging.dragThresholdMet) {
                    // prevent autoZoom() toogle and resetZoomAndPan()
                    e.preventDefault();
                    e.stopPropagation();
                    UI.stateDragging.dragThresholdMet = false;

                    return;
                }

                UI.autoZoom(modalImage, e);

                return;
            }

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

                return;
            } // standard copyBtn buttons for <code> sections

            // *** ADV COPY button(s) event handlers

            /*
            // ** retrieve stored ComfyUI workflow
            // Add event listener for "Copy JSON Workflow" button
            if (e.target && e.target.classList.contains('copy-btn-adv') && e.target.hasAttribute('data-workflow-id')) {
                const workflowId = e.target.getAttribute('data-workflow-id');
                if (window.storedArtefacts && window.storedArtefacts[workflowId]) {
                    UI.copyToClipboard(window.storedArtefacts[workflowId]);
                }

                return;
            }
            */

            /*
            // ** retrieve stored Prompts (Positive, Negative, ...)
            if (e.target && e.target.classList.contains('copy-btn-adv') && e.target.hasAttribute('data-prompt-id')) {
                const promptId = e.target.getAttribute('data-prompt-id');
                if (window.storedPrompts && window.storedPrompts[promptId]) {
                    UI.copyToClipboard(window.storedPrompts[promptId]);
                }

                return;
            }
            */

            // *** SAVE button(s) event handlers

            // ** add event listener for "Save AI Generation Parameters" buttons
            if (e.target && e.target.classList.contains('download-btn')
                 && e.target.hasAttribute('data-parameters-id')) {
                const parametersId = e.target.getAttribute('data-parameters-id');

                if (window.storedParameters && window.storedParameters[parametersId]) {
                    UI.saveAIGenerationParameters(window.storedParameters[parametersId]);
                }

                return;
            }

            // Check if the clicked element (e.target) has the 'close-btn' class.
            // Using `closest()` is a robust way to find the button, even if a child element inside it was clicked.
            const closeBtn = e.target.closest(".close-btn");

            if (closeBtn) {
                if (closeBtn.classList.contains("settings"))
                    UI.closeSettings();
                else if (closeBtn.classList.contains("modal"))
                    UI.closeMediaModal();

                return;
            }

            // *** Zoom Panel click event handlers *** //
            const zoomInBtn = e.target.closest(".zoom-btn.in");
            if (zoomInBtn) {
                const zoomIn = true;
                // can also pass e = null (as not meaningful for a 'targeted' zoom)
                UI.zoomBtnClick(zoomIn, null, e); // zoomIn

                return;
            }

            const zoomResetBtn = e.target.closest(".zoom-btn.reset");
            if (zoomResetBtn) {
                const applyZoom = true;
                UI.resetZoomAndPan(null, applyZoom);
                
                return;
            }

            const zoomOutBtn = e.target.closest(".zoom-btn.out");
            if (zoomOutBtn) {
                const zoomIn = true;
                // can also pass e = null (as not meaningful for a 'targeted' zoom)
                UI.zoomBtnClick(!zoomIn, null, e); // !zoomIn = zoomOut
                
                return;
            }

            // *** Modal Navigation click event handlers *** //
            const prevBtn = e.target.closest(".nav-btn.prev");
            if (prevBtn) {
                // can also pass e = null (as not meaningful for a 'targeted' zoom)
                UI.modalPrev(e);
                
                return;
            }

            const nextBtn = e.target.closest(".nav-btn.next");
            if (nextBtn) {
                // can also pass e = null (as not meaningful for a 'targeted' zoom)
                UI.modalNext(e);
                
                return;
            }

        }); // END of global "click" event-handlers (via 'event delegation')
    
        // Handle all keypress events "globally" at the document level via "event delegation"

        // *** Visual cue when Shift is held
        // Add a small CSS pulse on the thumbnail while the user is holding Shift, so they know they’re about to override.
        document.addEventListener('keyup', e => {
            if (e.key === 'Shift') {
                // Visual cue when Shift is held
                document.body.classList.remove("shift-mode");
            }
        });
        //document.addEventListener('keydown', function(e) {
        document.addEventListener('keydown', e => {
            if (e.key === 'Shift') {
                // Visual cue when Shift is held
                document.body.classList.add("shift-mode");

                return;
            }

            if (e.key === 'Escape') {
                const settingsPanel = document.getElementById("settings-panel");
                const isSettingsPanelOpen = (!settingsPanel.classList.contains("hidden"));

                // for keydown events, the e.target is the next closest focusable element (e.g. textbox)
                // but in this case it is the body element!
                // therefor the following does not work
                //if (e.target === settingsPanel) {
                if (isSettingsPanelOpen) {
                    // hide the parameters (modal) panel
                    settingsPanel.classList.add("hidden"); // hide panel

                    return;
                }
            }

            const modalDialog = document.getElementById("media-modal");
            const modalExDialog = document.getElementById("media-modal-ex");

            // check if and which modal dialog is open
            const isModalDialogOpen = (!modalDialog.classList.contains("hidden"));
            const isModalExDialogOpen = (!modalExDialog.classList.contains("hidden"));

            // here we are in key press support for the 2 modals
            if (isModalDialogOpen || isModalExDialogOpen) {
                // Escape key closes modal and modalEx dialog(s)
                if (e.key === 'Escape') {
                    UI.closeMediaModal();

                    return;
                }

                // modal-media-info panel on/off Toggle with Space
                if (e.code === 'Space') { // or e.key ???
                    e.preventDefault();

                    const infoDiv = document.getElementById(`modal-media-info${modal.elIDPostFix}`);
                    /*
                    if (infoDiv) {
                        infoDiv.classList.toggle("hidden"); // "visible" ??
                    */
                    UI.toggleInfoOverlay();

                    return;
                }

                // Left-arrow in modal
                if (e.key === 'ArrowLeft') {                    
                    UI.modalPrev(e);

                    return;
                }

                // Right-arrow in modal
                if (e.key === 'ArrowRight') {
                    UI.modalNext(e);

                    return;
                }

                // 0 (aka Reset) in modal
                if (e.key === '0') {
                    UI.resetZoomAndPan();

                    return;
                }

                if (e.key === 'Enter') {
                    e.preventDefault();

                    /*
                        we are in modal or modalEx open modal dialog, where we can have
                        
                        "CLOSURE" issues with modal dialogs
                        why using the passed parameters "mediaUrl" and "isVideo" are
                        NOT working as expected, and only SAVE their FISRT values
                        //const originalUrl = mediaUrl.replace(/\/width=\d+\//, "/original=true,quality=100/");
                    */
                    /*
                        The issue we're facing is a classic stale closure problem.
                        When we define the keydown event listener, the mediaUrl variable is captured in a "closure" with its INITIAL value.
                        This value is then "frozen" for the lifetime of the event listener, which is typically until the page is reloaded.

                        One Solution: Update the "mediaUrl" inside the event handler
                        Instead of relying on the globally or externally scoped "mediaUrl",
                        fetch the most current URL from the DOM element,
                        that displays the image inside your modal.
                        This is the most reliable method, as it doesn't depend on outside state. 

                    */
                    /*
                    re-evaluate the "mediaUrl" and Fetch the URL directly from the modal's image <img> element tag
                    we also cannot use (isVideo), as it has the same "closure" issue as "mediaUrl"
                    //const currentMediaUrl = (isVideo) ? modalVideo.src : modalImage.src;
                    make sure we set modalVideo.src = "" for Image, and modalImage.src = "" for Video
                    so we are only "dependend" on the 2 DOM element tags "<img>" and "<video>"
                    note also that setting .src="" does NOT resolve to "" when comparing values,
                    but resolves to our "base" Url domain, which is window.location.href
                    from where we run our "index.html" 
                    */

                    const modalImage = document.getElementById(`modal-image${modal.elIDPostFix}`);
                    const modalVideo = document.getElementById(`modal-video${modal.elIDPostFix}`);

                    // get the currentUrlMediaUrl from media .src and NOT from passed param mediaUrl ("closure" problem)
                    let currentMediaUrl =
                        (modalVideo.src === "") // window.location.href
                            ? modalImage.src
                            : modalVideo.src
                    ;

                    console.log("Current image url: ", currentMediaUrl);

                    // convert this image Url to its "original" dimensions and quality (JPEG compression)
                    /*
                    let originalUrl = currentMediaUrl.replace(
                        /\/width=\d+\//, "/original=true,quality=100/");
                    */
                    /*
                        / ... /: Denotes the start and end of the regular expression.
                        \/: Escapes the forward slash (/), which is a special character in regex. This matches the literal / in the URL path.
                        width=: Matches the literal text "width=".
                        \d+: Matches one or more digits (0-9).
                        \: Escapes the final forward slash. 
                    */
                    /*
                    const mediaFileExtension = MetadataExtractor.getFileExtension(currentMediaUrl).toLowerCase();
                    if (['jpeg', 'jpg'].includes(mediaFileExtension)) {
                        // try to get a PNG image from the given JPEG image
                        // as CivitAI tends to prefer the "lighter" 90% compressed JPEG versions
                        // from an original generated/uploaded PNG image
                        // and we "may" also get an embedded ComfyUI workflow
                        // *only* from PNG files, as it stands currently
                        originalUrl = originalUrl
                            .replace(".jpeg", ".png")
                            .replace(".jpg", ".png");

                            console.log("changed possible JPEG to PNG format for original Url");
                    }
                    */

                    // build our preferred Url version based on user settings
                    // convert this image Url to its "original" dimensions and quality (JPEG compression)
                    const originalUrl = UI.buildDownloadUrl(currentMediaUrl, userSettings.downloadImageQuality);
        
                    console.log("Original image url: ", originalUrl);

                    try {
                        if (userSettings.loadIntoApp) {
                            //const file = await UI.loadImage(originalUrl);
                            //UI.processFile(file);
                            UI.loadImage(originalUrl)
                                .then(file => {
                                UI.processFile(file); // process it
                            })
                            .catch(error => {
                                console.error("An error occurred while loading into the app: ", error);
                            });

                            // as we loaded the new image into the app
                            // for further inspection, we need
                            //  to close the modal dialog
                            UI.closeMediaModal();
                                }

                        if (userSettings.openOriginal) {
                            /* That string "noopener, noreferrer" is being parsed by the browser as window features,
                                not as rel attributes. So instead of just opening a tab,
                                Chrome interprets it like "hey, new popup with features"
                                — and we end up with navigation instead of a background tab.
                                Then when we call UI.downloadImage, the browser
                                already has that URL loaded in the app context,
                                so it just opens it instead of downloading.
                            */
                            //window.open(originalUrl, "_blank", "noopener,noreferrer");
                            window.open(originalUrl, "_blank", "noopener=yes,noreferrer=yes");
                            // or just window.open(originalUrl, "_blank");
                        }

                        if (userSettings.autoDownload) {
                            // await UI.downloadImage(MetadataExtractor.getFileName(originalUrl), originalUrl);
                            UI.downloadImage(MetadataExtractor.getFileName(originalUrl), originalUrl)
                            .catch(error => {
                                console.error("An error occurred while downloading the image: ", error);
                            });                           
                        }
                    } catch (err) {
                        console.error("Error handling 'Enter' event handler: ", err);
                    }
                } // END "Enter" key

                // Left-arrow in gallery (outside modal)
                if (e.key === 'ArrowLeft') {
                    UI.scrollGallery(modal.currentGalleryId, -1);

                    return;
                }

                // Right-arrow in gallery (outside modal)
                if (e.key === 'ArrowRight') {
                    UI.scrollGallery(modal.currentGalleryId, 1);

                    return;
                }

            } // here we are in key press support for the 2 modals
        }); // "keypress" events

        // Old-Style: we do with now with event delegation
        //UI.setupModalNavigation();
        //UI.setupZoomButtons();
    }

    // not used, moved to 'global' event delegation code above
    static setupModalNavigation() {
        const prevBtn = document.querySelector('.nav-btn.prev');
        const nextBtn = document.querySelector('.nav-btn.next');

        if (prevBtn) {
            prevBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                UI.modalPrev(e);
            });
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                UI.modalNext(e);
            });
        }
    }

    static setupZoomButtons() {
        const zoomInBtn = document.querySelector('.zoom-btn.in');
        const zoomResetBtn = document.querySelector('.zoom-btn.reset');
        const zoomOutBtn = document.querySelector('.zoom-btn.out');

        if (zoomInBtn) {
            zoomInBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                UI.zoomIn(e);
            });
        }

        if (zoomResetBtn) {
            zoomResetBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                UI.resetZoomAndPan(e);
            });
        }

        if (zoomOutBtn) {
            zoomOutBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                UI.zoomOut(e);
            });
        }
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

        // Get a reference to the container of the media preview
        const mediaPreviewContainer = document.getElementById('media-preview');

        if (file.type.startsWith('image/')) {
            const url = URL.createObjectURL(file);
            this.lastObjectURL = url; // store as class property
            mediaPreviewContainer.innerHTML = `<img class="zoom-target" src="${url}" alt="Preview of ${file.name}">`;

        } else if (file.type.startsWith('video/')) {
            const url = URL.createObjectURL(file);
            this.lastObjectURL = url; // retrieve from class property
            // Responsive UI → max-width / max-height keeps video from breaking layout
            mediaPreviewContainer.innerHTML = `
                <video src="${url}" controls autoplay muted style="max-width:100%;max-height:400px;">
                    Your browser does not support the video tag.
                </video>
            `;

        } else {
            mediaPreviewContainer.innerHTML = '<p>No preview available</p>';
        }

        // Display image preview for image files
        // Use scrollIntoView() to scroll to the container
        mediaPreviewContainer.scrollIntoView({
            behavior: 'smooth', // Optional: for a smooth scrolling animation
            block: 'center'      // Optional: align the element to the top of the viewport
        });
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
                ${UI.COPY_BUTTON_HTML}
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
        'Seed', 'Steps', 'Flux Guidance', 'Denoising strength',
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
                ${UI.COPY_BUTTON_HTML.replace('class="copy-btn"', 'class="copy-btn json"')}
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

        // Display resolved model links if available, ordered by type
        const resourcesDataDiv = document.getElementById('resources-data');
        if (metadata.resolvedModels && Object.keys(metadata.resolvedModels).length > 0) {
            resourcesDataDiv.innerHTML = `
                <div class="resolved-models">
                    ${this.formatResolvedModels(metadata.resolvedModels)}
                </div>
            `;

            // register the Event Handlers for all generated galleries
            const galleryIds = window.storedArtefacts["galleryIds"];
            galleryIds.forEach(galleryId => UI.attachGalleryPopouts(galleryId));
        }
        else {
            resourcesDataDiv.innerHTML = '<p>No used AI models found and resolved</p>';
        }

        const modelHashesDataDiv = document.getElementById('model-hashes-data');
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

            // wrap the data which should be copied into a <code>data</code> block (not use <pre/>)
            modelHashesDataDiv.innerHTML = `
                <div class="model-hashes"><code>${this.formatValue("hashes", metadata.raw.hashes, "json")}</code></div>
                ${UI.COPY_BUTTON_HTML.replace('class="copy-btn"', 'class="copy-btn json"')}
            `;
        }
        else {
            modelHashesDataDiv.innerHTML = '<p>No model hashes found</p>';
        }

        const comfyuiInputsDataDiv = document.getElementById('comfyui-inputs-data');
        if (metadata.raw.prompt) { // aka WF Inputs Prompts
            comfyuiInputsDataDiv.innerHTML = `
                <h2>Prompt / WF Inputs</h2>
                <div class="comfyui-inputs"><code>
                    ${this.formatValue("prompt", metadata.raw.prompt, "json")}
                </code></div>
                ${UI.COPY_BUTTON_HTML.replace('class="copy-btn"', 'class="copy-btn json"')}
            `;
        }
        else {
            comfyuiInputsDataDiv.innerHTML = '<p>No WF prompts found</p>';
        }

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
                        //const promptId = 'prompt-' + Math.random().toString(36).substr(2, 9);

                        // Store the prompt value in a global object for later retrieval
                        //if (!window.storedPrompts) {
                        //    window.storedPrompts = {};
                        //}
                        //window.storedPrompts[promptId] = promptValue;

                        parametersHTML += this.createMetadataItemHtmlWithCopyButton(key, value);
                                                
                    } else { // metadata-item already has the needed button-anchor style for positioning the copy button
                        if (value.toString() == "") // only render keys which have a non-empty value
                            continue; // skip empty values

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
                if (value.toString() == "") // only render keys which have a non-empty value
                    continue; // skip empty values

                // Skip parameters that match certain patterns (like LORA weights)
                if (!this.PARAMETER_ORDER.includes(key) && !skipParameters.includes(key)) {
                    // Skip LORA weight parameters (they contain ":" and ">")
                    if (typeof value === 'string' && value.includes(':') && value.includes('>')) {
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

            // load the parametersHTML into the DOM
            parametersDataDiv.innerHTML = parametersHTML;
        } else {
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
        let galleryIds = [];

        for (const {key, model} of orderedModels) {
            // Create image gallery if images are available
            let imageGallery = '';
            if (model.images && model.images.length > 0) {
                const galleryId = `gallery-${Math.random().toString(36).substr(2, 9)}`;
                // add it to the gallery array for later event registartions
                galleryIds.push(galleryId);
                
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
                    <div>💡 Click to open (Shift+Click = open in alternate modal)></div>

                    <div class="gallery-container">
                        <button class="scroll-btn" onclick="UI.scrollGallery('${galleryId}', -1)">‹</button>

                        <div class="gallery-scroll" id="${galleryId}">
                            ${model.images.map((img, index) => {
                                console.debug("image", img);

                                const mediaName = MetadataExtractor.getFileName(img.url); // e.g. "67554754.jpeg"

                                // Generate a unique ID for this image, e.g. "img-123456789@67554754.jpeg"
                                const mediaId = `img-${Math.random().toString(36).substr(2, 9)}@${mediaName}`;

                                // Check if the URL is a video (common video extensions)
                                //const isVideo = img.type && img.type.startsWith("video");
                                const isVideo = /\.(mp4|webm|mov|avi|mkv)(\?|$)/i.test(img.url);
                                
                                // request the image urls only in thumbnail size
                                // leverage the img.url "trick" with "height=" url replacement
                                // CSS .image-gallery img and video height: 120px; /* Fixed height for gallery consistency */
                                // we cannot read the "height" at runtime as it is just created here
                                //const element = document.querySelector('.image-gallery img');
                                //const computedStyle = window.getComputedStyle(element);
                                //const height = computedStyle.getPropertyValue('height');
                                //console.log(height); // e.g., "120px"

                                // for the new hover effect to "pop-out" the hovered image
                                // with a "transform: scale(2)", we need to double the height of the downloaded image
                                // to 120 * 2 = 240px, otherwise the image will look unsharp in the pop-out hover scaled media
                                const galleryThumbHeight = userSettings.galleryThumbHeight; // 120
                                const galleryPopoutScale = userSettings.galleryPopoutScale; // 2
                                const requestedHeight = galleryThumbHeight * galleryPopoutScale; // 240

                                //const galleryMedialUrl = img.url.replace(/\/width=\d+\//, `/height=${requestedHeight}/`);
                                const mediaGalleryUrl = this.buildMediaUrl(img.url, isVideo, { height: requestedHeight});

                                // original size, userSettings.modalImageQuality, userSettings.modalForcePNG
                                const mediaFullUrl = this.buildModalMediaUrl(img.url, isVideo, true); // original

                                /*
                                const media = {
                                    name: mediaName,
                                    isVideo: isVideo,
                                    // initialize all media Urls
                                    url: {
                                        base: img.url, // as-is from img metadata
                                        gallery: mediaGalleryUrl,
                                        full: mediaFullUrl
                                    },
                                    // initialize model reference
                                    model: {
                                        id: model.id,
                                        name: model.name
                                    },
                                    data: img // { JSON from REST call }
                                }
                                */
                               // this ensures "schema" validity
                                const media = structuredClone(this.DEFAULT_MEDIA);
                                    media.name = mediaName;
                                    media.isVideo = isVideo;
                                    // initialize all media Urls
                                    media.url.base = img.url; // as-is from img metadata
                                    media.url.gallery = mediaGalleryUrl;
                                    media.url.full = mediaFullUrl
                                    // initialize model reference
                                    media.model.id = model.id;
                                    media.model.name = model.name;
                                    media.data = img; // { JSON from REST call }

                                // Store the image value in a global object for later retrieval
                                if (!window.storedArtefacts) {
                                    window.storedArtefacts = {};
                                }
                                //window.storedArtefacts[mediaId] = media;
                                // store it serialized
                                window.storedArtefacts[mediaId] = this.formatJSON(media);

                                const mediaContent = (isVideo)
                                    ? `<video id="${mediaId}" 
                                        src="${mediaGalleryUrl}" 
                                        data-medianame="${mediaName}" 
                                        data-url="${img.url}" 
                                        data-fullurl="${mediaFullUrl}" 
                                        data-modelid="${model.id}" 
                                        data-modelname="${model.name}" 
                                        alt="Model Video example"
                                        class="gallery-model-video" 
                                        controls muted loop
                                        onclick="UI.handleMediaClick(event, '${mediaId}', '${galleryId}', ${index})"
                                        onmouseover="UI.preloadMedia('${mediaFullUrl}')"></video>`
                                    : `<img id="${mediaId}" 
                                        src="${mediaGalleryUrl}" 
                                        data-medianame="${mediaName}" 
                                        data-url="${img.url}" 
                                        data-fullurl="${mediaFullUrl}" 
                                        data-modelid="${model.id}" 
                                        data-modelname="${model.name}" 
                                        alt="Model Image example"
                                        class="gallery-model-image"
                                        onclick="UI.handleMediaClick(event, '${mediaId}', '${galleryId}', ${index})"
                                        onmouseover="UI.preloadMedia('${mediaFullUrl}')"></img>`;

                                return `<div class="gallery-item">${mediaContent}</div>`;
                            }).join('')}
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
                    Resolved AutoV2 Hash: ${model.hash}<br>
                    (Extracted Hash: ${model.extractedHash})<br>
                    Model Size: ${model.fileSizeMB} MB<br>
                    Base Model: ${model.baseModel}<br>
                    Trained Words (Tags): ${model.trainedWords}<br>
                    ${imageGallery}
                    ${downloadButton}
                </div>
                <br>
            `;            
        }

        /* GPT-5 BEGIN Gallery Pop-Out */
        window.storedArtefacts["galleryIds"] = galleryIds;

        // galleryId is the id you generated, e.g. 'gallery-eikbx5rs5'
        //UI.attachGalleryPopouts(galleryId);

        /* GPT-5 END Gallery Pop-Out */


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
        const link = document.createElement('a');
        link.href = url;
        link.download = fileNameWithExt;

        // add the download link to the body
        document.body.appendChild(link);

        link.click(); // start the download thru the browser

        // remove the download link
        document.body.removeChild(link);

         // free up memory
        URL.revokeObjectURL(url);
    }

    /* this has CORS issues with remote Origins from other domains
        If the server blocks download
        Some CDNs (like Civitai’s) set Content-Disposition: inline or omit CORS headers.
        In that case, browsers ignore download=.

        The below download attribute works only if the link is created
        in the same execution context and the file is served with CORS headers that allow it.
        Otherwise, the browser ignores it and just navigates.

        Workaround: we fetch the blob ourself and then trigger a local download
        see below new downloadImage() function
    */
    static downloadImageFromUrl(fileNameWithExt, imageUrl) {
        const link = document.createElement('a');
        link.href = imageUrl;
        link.download = fileNameWithExt; // || 'downloaded-image.jpeg'; // Default filename if not provided

        // add the download link to the body
        document.body.appendChild(link);

        link.click(); // start the download thru the browser

        // remove the download link
        document.body.removeChild(link);
    }

    // We make download independent from CORS quirks & navigation
    static async downloadImage(fileNameWithExt, imageUrl) {
        try {
            const response = await fetch(imageUrl);
            if (!response.ok)
                throw new Error(`HTTP ${response.status}`);

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);

            const link = document.createElement("a");
            link.href = url;
            link.download = fileNameWithExt || "downloaded-image.png";

            // add the download link to the body
            document.body.appendChild(link);

            link.click(); // start the download thru the browser
    
            // remove the download link
            document.body.removeChild(link);

            // free up browser resources from this URL
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error("Download failed: ", err);
        }
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
                //if (typeof value === 'string' && value.includes(':') && value.includes('>')) {
                    //TODO continue;
                //}
                parametersText += `${key}: ${value}\n\n`; // separate with a blank line
            }
        }
        
        // Create and download the file
        const fileNameWithExt = `ai_generation_parameters_(${window.storedFileName}).txt`;
        this.downloadTextArtefact(fileNameWithExt, 'text/plain', parametersText);

    }

    static scrollGallery(galleryId, direction) {
        const gallery = document.getElementById(galleryId);
        if (!gallery)
            return;

        //const galleryScroll = gallery.querySelector('.gallery-scroll');
        //TODO: we need to calculate that better an/or
        // add a userSetting 'galleryHorizontalScrollBy' = 250 ???
        const scrollAmount = 120 + 10; // Height(=Width) of one image (120) plus gap (10)
        const currentScroll = 0; //gallery.scrollLeft;
        const newScroll = currentScroll + (direction * scrollAmount * 2);
        //const newScroll = 250 * direction;
        
        gallery.scrollBy({
            left: newScroll, // left means horizontal
            behavior: 'smooth' // auto (browser decides)
        });
    }

    /*** BEGIN - HELPERS for galleries and mediaModal dialog(s) SUPERv1 ***/

    // ** display controls of "modal-media-info" metadata panel

    // call this function when opening/scrolling the modal dialog
    //  e.g. initInfoOverlay(image.meta.prompt); 
    static initInfoOverlay(htmlText) {
        const overlay = document.getElementById(`modal-media-info${modal.elIDPostFix}`);
        //overlay.style.fontSize = userSettings.infoFontSize;

        /* consume in CSS as a dynamic var:
        .modal-media-info {
            font-size: var(--info-font-size, 12px);
        }
        
        the second param is optional and can be a default
        */

        overlay.innerHTML = htmlText || "<i>No metadata info available</i>";

        // instead of always start from the user settings for each image,
        // we respect the last (global) state the user used for modalMediaInfo
        // stored in 'modal.mediaInfoVisible'
        //overlay.classList.toggle("hidden", !userSettings.showMediaInfo);
        UI.renderInfoOverlay();
    }

    static renderInfoOverlay() {
        // render/display on last state of global 'modal.mediaInfoVisible' var
        const overlay = document.getElementById(`modal-media-info${modal.elIDPostFix}`);
        if (overlay)
            overlay.classList.toggle("hidden", !modal.mediaInfoVisible); // force the toggle()
    }

    static toggleInfoOverlay() { // used by 'Space' keydown handler
        modal.mediaInfoVisible = !modal.mediaInfoVisible;
        UI.renderInfoOverlay();
    }

    static onNavigate() {
        if (!userSettings.persistInfoOverlay) {
            modal.mediaInfoVisible = userSettings.showMediaInfo; // reset
        }
        UI.renderInfoOverlay();
    }

    // ** preload images / videos [head]
    static preloadMediaNeighbors(mediaUrls) {
        // preload neighbor images as they are likely to be consumend next
        if (mediaUrls.nextUrl) UI.preloadMedia(mediaUrls.nextUrl);
        if (mediaUrls.prevUrl) UI.preloadMedia(mediaUrls.prevUrl);
    }

    static preloadMedia(mediaUrl) {
        //const isVideoUrl = /\.(mp4|webm|mov|avi|mkv)(\?|$)/i.test(mediaUrl);
        const mediaExtension = MetadataExtractor.getFileExtension(mediaUrl).toLowerCase();
        const isVideoUrl = !['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(mediaExtension);

        console.log(`caching/preloading media ${(isVideoUrl) ? '[head]' : ''}`, mediaUrl);

        // from non-sure images and potentially all videos (e.g. 'webm', 'mp4', etc.)
        // we can’t preload fully (heavy), but we can warm up the caches
        if (isVideoUrl) {
            // trigger an async fetch "HEAD" of the url to warm caches
            UI.loadMediaHead(mediaUrl).then().catch();
        }
        else {
            // Preload image into the browser cache for faster display in modal
            const img = new Image();
            img.src = mediaUrl;
        }
    }

    static async loadMediaHead(mediaUrl) {
        const response = await fetch(mediaUrl, { method: "HEAD" });
        if (!response.ok) {
            console.error(`HTTP error! status: ${response.status}`);
        }
        console.debug(`response from getting HEAD of '${mediaUrl}'`, response);
        // only read the HEAD
        //const arrayBuffer = await response.arrayBuffer();        
    }


    // ** gallery/model helper functions
    /*
    🧩 URL Strategy
    We’ll treat the different image URLs as tiers of quality:
    1.	galleryMediaUrl → small thumbnail (height = userSettings.galleryThumbHeight, e.g. 120px).
        // the galleryMediaUrl resolution should be the pop-out size, otherwise it is unsharp
        // = galleryThumbHeight * galleryPopoutScale, e.g. 120 * 2 = 240px
        - Used in the scrollable gallery.
        - Might be scaled up (scaleFactor, e.g. 2) for hover pop-out sharpness.
    2.	mediaUrl → higher quality for the modal view.
        - Derived from original 'img.url'.
        - If userSettings.modalImageQuality exists, use /original=true,quality=${q}/ regEx.
        - Could be limited by a userSetting 'modalMaxHeight' (like 1024) to avoid huge downloads.
    3.	originalUrl → always full-quality.
        - regEx with /original=true,quality=${userSettings.downloadImageQuality}/
        - With JPEG → PNG swap trick.
    */
    static buildMediaUrl(baseUrl, isVideo, { height, original = false, quality = 90, forcePNG = false }) {
        let url = baseUrl;

        if(isVideo) // videos are not supported by civitai resize REST-API
            return baseUrl; // return unmodified url as found in sample image metadata

        /*
            normally civitai image urls default with ".../width=1536/12345678.jpeg"
            the replace regEx for this would be /\/width=\d+\// as in:

            const widthIsxxxRegEx = /\/width=\d+\//;
            url = url.replace(widthIsxxxRegEx, `/height=${height}/`);

            however some img.url NOT initially have this '/width=1234/' pattern, and already specify 'original=true'
            "https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/20fcc1d7-29ce-42d8-1502-02c4e50e9100/original=true/174703.jpeg"
            from such a url we would fail to build a mediaGalleryUrl with '/height=240/'

            *** improved version ***
            const customString = "my-custom-value"; // this will be build depending on params of this function
            // The regex below captures everything before the second-to-last slash
            // in the first capturing group ($1).
            // The part to be replaced is matched by [^/]+.
            // The part after the last slash is matched by [^/]+$.
            const replacedUrl = url.replace(/^(.+)\/[^/]+\/([^/]+)$/, `$1/${customString}/$2`);
            // Output:
            // https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/20fcc1d7-29ce-42d8-1502-02c4e50e9100/my-custom-value/174703.jpeg

            Breakdown of the replace() function call
            url.replace(...): Calls the replace() method on the original URL string.
            ^(.+)\/[^/]+\/([^/]+)$: The regular expression pattern.
            $1/${customString}/$2: The replacement string.
            $1 refers to the content of the first capturing group, which is everything up to the second-to-last /.
            ${customString} is the new string we want to insert.
            $2 refers to the content of the second capturing group, which is everything after the last /.

            This is the most reliable way to perform this replacement, as it handles the full URL structure correctly.
        */

        //const widthIsxxxRegEx = /\/width=\d+\//; // here the enclosing slashes get removed from the url
        const anyCustomStringRegEx = /^(.+)\/[^/]+\/([^/]+)$/; // here the enclosing slashes stay in the url

        if (original) {
            //url = url.replace(widthIsxxxRegEx, `/original=true,quality=${quality}/`);
            url = url.replace(anyCustomStringRegEx, `$1/original=true,quality=${quality}/$2`);

            if (forcePNG && !isVideo) {
                url = url.replace(/\.jpe?g$/i, ".png"); // case-insensitive ".jpg" || ".jpeg"
            }
        } else if (height) { // modal can request a specific height
            //url = url.replace(widthIsxxxRegEx, `/height=${height}/`);
            url = url.replace(anyCustomStringRegEx, `$1/height=${height}/$2`);
        }

        return url;
    }

    static buildModalMediaUrl(baseUrl, isVideo = false, original = null, quality = 0, height = 0) {
        let url = baseUrl;

        // videos are not supported by civitai resize REST-API
        if(isVideo || userSettings.modalDefaultImage)
            return baseUrl; // return unmodified url as found in sample image metadata

        let modalOriginal = (original) ? original :  userSettings.modalOriginal;
        let modalImageQuality = (quality > 0) ? quality : userSettings.modalImageQuality;
        let modalImageHeight = (height > 0) ? height : (userSettings.modalImageHeight > 0) ? userSettings.modalImageHeight : 240; // ensure a minimum 'height'
        let modalForcePNG = userSettings.modalForcePNG

        if (modalOriginal) {
            url = UI.buildMediaUrl(url, isVideo, {
                original: true,
                quality: modalImageQuality,
                forcePNG: !isVideo && modalForcePNG
            });
        }
        else { // currently we only generate 'original' or a specific 'height'
            url = UI.buildMediaUrl(url, isVideo, {
                original: false,
                height: modalImageHeight // request a specific height
            });
        }

        return url;
    }

    static buildDownloadUrl(mediaUrl, downloadJpegQuality) {
        let downloadUrl = "";

        switch (userSettings.downloadFormat) {
            case "png":
                downloadUrl = mediaUrl
                    .replace(/\/width=\d+\//, "/original=true,quality=100/")
                    .replace(/\.jpe?g/i, ".png");
                break;

            case "jpeg":
                downloadUrl = mediaUrl
                    .replace(/\/width=\d+\//, `/original=true,quality=${downloadJpegQuality}/`)
                    .replace(/\.png/i, ".jpeg");
                break;

            case "original":
            default:
                downloadUrl = mediaUrl.replace(/\/width=\d+\//, "/original=true,quality=100/");
                break;
        }

        return downloadUrl;
    }

    // ** other modal helpers

    /*** END - HELPERS for galleries and mediaModal dialog(s) SUPERv1 ***/

    static showMediaModalEx(mediaId, galleryId, galleryIndex) {
        let media = null;

        if (window.storedArtefacts && window.storedArtefacts[mediaId]) {
            // deserialize the stored image metadata object
            media = JSON.parse(window.storedArtefacts[mediaId]);
            modal.media = media; // pass media to modal dialog
        }

        // media.data, e.g. media.data.hasPositivePrompt, media.data.meta.prompt

        //WORK
        // Create modal if it doesn't exist
        // currently we defined this directly in index.html
        let modalExDialog = document.getElementById('media-modal-ex');
        if (!modalExDialog) { // modalEx dialog initialization
            modalExDialog = document.createElement('div');
            modalExDialog.id = 'media-modal-ex';
            modalExDialog.className = 'media-modal hidden';
            modalExDialog.innerHTML = `
                <span class="close-btn modal">&times;</span>

                <div id="zoom-controls-ex" class="zoom-controls">
                    <button class="zoom-btn in">+</button>
                    <button class="zoom-btn reset">0</button>
                    <button class="zoom-btn out">−</button>
                    <span id="current-zoomScale-ex" class="current-zoomScale">(1)</span>
                </div>

                <div id="media-container-ex" class="media-container">
                    <!-- Spinner -->
                    <div id="modal-spinner-ex" class="modal-spinner hidden"></div>

                    <img id="modal-image-ex" class="modal-media media-hidden" alt="Fullsize Sample Image">
                    <video id="modal-video-ex" class="modal-media media-hidden" controls autoplay loop></video>
                    <div id="modal-media-info-ex" class="modal-media-info hidden button-anchor"></div>
                </div>
            `;
            document.body.appendChild(modalExDialog);
        }

        modal.dialog = modalExDialog;
            
        // Close modal when clicking outside the media
        // currently we try "global" "event delegation"
        /*            
        modalExDialog.addEventListener('click', function(e) {
            if (e.target === modalExDialog) {
                UI.closeMediaModalEx();
            }
        });
        */
       
        // Close modal dialog with Escape key
        // currently we use "global" "event delegation"
        /*
        document.addEventListener('keydown', function(e) {
        });
        */

        // ... modal setup
        const mediaContainer = document.getElementById('media-container');
        modal.container = mediaContainer;
        const modalImage = document.getElementById('modal-image-ex');
        modal.image = modalImage;
        const modalVideo = document.getElementById('modal-video-ex');
        modal.video = modalVideo;
        const modalSpinner = document.getElementById("modal-spinner-ex");
        modal.spinner = modalSpinner;
        const modalMediaInfo = document.getElementById('modal-media-info-ex');
        modal.mediaInfo = modalMediaInfo;
  
        modal.currentGalleryId = galleryId; // unique id (only used to query its gallery-item media (img and video)

        // we want/need the whole context of all images for this gallery
        modal.galleryImages = [...document.querySelectorAll(`#${galleryId} .gallery-item img, #${galleryId} .gallery-item video`)];
        const totalMedia = modal.galleryImages.length;

        // galleryIndex: passed as param from scroll/nav event
        // wrap around image gallery (make sure we are not "out-of-bounds")
        galleryIndex = galleryIndex % totalMedia; // 0-based gallery index
        modal.currentGalleryIndex = galleryIndex; // persist for global scroll/nav handlers

        
        const el = modal.galleryImages[galleryIndex];

        // get the full Url
        const fullUrl = el.dataset.fullurl || el.src; // prefer the full size Url

        //const isVideo = el.tagName.toLowerCase() === "video";
        const isVideo = media.isVideo;
        
        // reset media (both existing media files)
        modalImage.classList.add("media-hidden"); // no more add("hidden");
        modalImage.src = ""; // release image ressource

        modalVideo.classList.add("media-hidden"); // no more add("hidden");
        /* release resources and stop playback, reset and release resource */
        modalVideo.pause(); // stop playing a video
        modalVideo.removeAttribute("src"); // release video resource
        modalVideo.load(); // clears and release any buffer and stops network activity

        modalMediaInfo.innerHTML = `
            ${media.model.name} - ${(media.isVideo) ? 'Video' : 'Image'} ${media.name} [ ${galleryIndex} of ${totalMedia} ]<br>
            <b>Prompt</b>:&nbsp;${(media && media.data && media.data.hasPositivePrompt)
            ? media.data.meta.prompt
            : "Unknown"}`;
        
        // show spinner
        modalSpinner.classList.remove("media-hidden");
    

        if (isVideo) {
            /* for videos, call modalVideo.load()
            before play() when switching sources */
            modalVideo.onloadeddata = () => { // after loaded
                modalSpinner.classList.add("media-hidden"); // hide spinner
                modalVideo.classList.remove("media-hidden"); // show video
                UI.applyZoomAndPan(modalVideo, modalVideo.parentElement);
                modalVideo.play(); // 2nd: play()
            };
            modalVideo.onerror = (error) => {
                modalSpinner.classList.add("media-hidden"); // hide spinner
                console.error(`Failed to load video: ${error}`, fullUrl);
            };

            modalVideo.src = fullUrl; // set url to load *after* handlers

        } else { // Image
            modalImage.onload = () => { // after loaded
                modalSpinner.classList.add("media-hidden"); // hide spinner
                modalImage.classList.remove("media-hidden"); // show image
                UI.applyZoomAndPan(modalImage, modalImage.parentElement);
            };
            modalImage.onerror = (error) => {
                modalSpinner.classList.add("media-hidden"); // hide spinner
                console.error(`Failed to load image: ${error}`, fullUrl);
                };

            modalImage.src = fullUrl; // set url to load *after* handlers

            // * prepare autoZoom (with [Shift]-Click) Zoom-Out support
            /*modalImage.onclick = (e) => {
                UI.autoZoom(modalImage, e);
            };*/    
        }
        
        // Update cursor and zoom state
        //UI.updateModalCursor();
        
        // Update modal state
        modalExDialog.classList.remove("hidden"); // show modal dialog
        modal.isOpen = true;

        // Prevent background scrolling
        document.body.style.overflow = "hidden";
    }

    static closeMediaModalEx() {
        modal.isOpen = false;

        const modalExDialog = document.getElementById(`media-modal${modal.elIDPostFix}`);

        if (modalExDialog.classList.contains("hidden"))
            return; // modal dialog is already closed

        modalExDialog.classList.add("hidden"); // hide (close) modal dialog

        // Pause video if playing
        const modalVideoEx = document.getElementById("modal-video-ex");
        if (modalVideoEx) {
            modalVideoEx.pause();
            modalVideoEx.src = ""; // release resource
        }

        // Restore background scrolling
        document.body.style.overflow = "";
    }

    /* GPT-5 Media-Modal SUPERv1 */
    // called from UI.initialize() and also from UI.applySettings()
    static initModal() {
        // Step 1: Create a deep clone of the default state
        const defaultModal = structuredClone(this.DEFAULT_MODAL); // global shared UI modal

        defaultModal.version = userSettings.modalChoice;

        const elIDPostFix =
            (userSettings.modalChoice === 'modalEx') // or 'modal'
                ? this.DEFAULT_MODAL.elID_POSTFIX_MODALEX // "-ex"
                : this.DEFAULT_MODAL.elID_POSTFIX_MODAL; // "" (default) for anything else

        defaultModal.elIDPostFix = elIDPostFix;

        // ** info panel - state management for displayed metadata
        defaultModal.mediaInfoVisible = userSettings.showMediaInfo; // init from settings
        // during the "session" it can be flipped with the 'Space' key
        // and then persists during the session during scrolling
        // and for different model galleries

        return defaultModal;
    }

    // *** global state vars
    
    // *** BEGIN Zoom Control in modal/modalEx dialog
    static isZoomed() {
        //return (UI.stateTransform.scale != 1); // ?????
        return (state.transform.scale != 1);
    };
    //static minZoomScale = 0.5;  // 50% minimum zoom scale (userSettings)
    //static maxZoomScale = 10;   // 1000% maximum zoom scale (userSettings)
    // *** END Zoom Control in modal/modalEx dialog

    static getMediaZoomTarget() {
        let modalMedia = null;

        //const modal = document.getElementById(`media-modal${modal.elIDPostFix}`);
        const modalImage = document.getElementById(`modal-image${modal.elIDPostFix}`);
        const modalVideo = document.getElementById(`modal-video${modal.elIDPostFix}`);

        if (modalImage && !modalImage.classList.contains("media-hidden")) // && modalImage.style.display !== 'none')
            modalMedia = modalImage;
        if (modalVideo && !modalVideo.classList.contains("media-hidden")) // && modalVideo.style.display !== 'none')
            modalMedia = modalVideo;

        return modalMedia;
    }

    /*
        *ONE* authorative function needed for
            applyZoom() and
            autoZoom() which calls resetZoomAndPan()

        special handling needed for zoomScale === 1
        delete the 'transform' style, when scale === 1
        for CSS rule:
            .media-preview:hover img, video {
                transform: scale(1.5);
            }
        to work again!

        if we leave a 'transform="scale(1)";'
        in the 'style' attribute of the unzoomed image element,
        the CSS 'hover' rule does not apply anymore,
        as element CSS styles overwrite CSS class styles
    */
    static applyZoomTransform(mediaElement, scale) {
        if (scale === 1) {
            // if the target scale is 1,
            // always remove the property to allow CSS (hover) to take over
            mediaElement.style.removeProperty("transform");
        } else {
            // for any other scale, set the transform
            mediaElement.style.transform = `scale(${scale})`;
        }
    }

    // mouse "pointed" zoom (for modalMedia and all other images with "zoom-target" class)
    static applyZoom(mediaElement, e, zoomScale = 1, debug = false) {
        if (!mediaElement) // we were called by resetZoom()
            mediaElement = UI.getMediaZoomTarget();

        if (!mediaElement) // we not have a mediaZoomTarget means,
            // no media-modal dialog is open
            return null;
        
        let { x, y } = UI.getMouseCoordinate(e); // null aware

        if (e) { //DRAGGINGBUG
            // hard-coded "pointed" zoom for debugging
            //x = 300;
            //y = 280;
            mediaElement.style.transformOrigin = `${x}px ${y}px`;
            state.transform.hasOriginOffset = true;
        }
        else { // default zoom from the center
            mediaElement.style.transformOrigin = "center center"; // or "50% 50%"
            state.transform.hasOriginOffset = false;
        }

        // special handling needed for zoomScale === 1
        UI.applyZoomTransform(mediaElement, zoomScale);

        if(debug) {
            const res = {
                image: mediaElement.alt,
                coordinatesMethod: UI.stateDragging.coordinatesMethod,

                x: x,
                y: y,

                e_offsetX: e?.offsetX,
                e_offsetY: e?.offsetY,

                e_clientX: e?.clientX,
                e_clientY: e?.clientY,

                shiftKey: e?.shiftKey,
                autoZoomVersion: userSettings.autoZoomVersion,

                zoomScale: zoomScale,
                style_transformOrigin: mediaElement.style.transformOrigin,
                style_transform: mediaElement.style.transform
            }
            console.debug("applyZoom()\n", UI.formatJSON(res));
        }

        return mediaElement;
    }

    // this function is only used in 'autoZoom' mode
    // now with "pointed" zoom
    static autoZoom(mediaElement = null, e = null) {
        const debug = state.pan.debug; // use pan.debug state

        /*
            Check if we are in a "fake.click" event, coming from the
            end of a PAN/move session with the image/video.

            Even if we try to stop that from happening in our "handleMouseUp"
            eventhandler, the click event seems to be firing, because
            even with e.stopPropagation() and e.preventDefault(),
            the browser is still queuing up the event.
            
            Our PAN logic works, but it's not correctly canceling the pending click event?
        */
        if (state.pan.dragThresholdMet) { //????? need to eliminate
            alert("state.pan.dragThresholdMet=true"); //TODO - check
            state.pan.dragThresholdMet = false; // Reset the flag
                return; // exit if a PAN has just happened
        }

        // autoZoomVersion 1 = 'autoZoom' in only ONCE with 'autoZoomStep' (and then back to normal)
        // autoZoomVersion 2 = combine with '#zoom-controls' and allow MULTIPLE autoZoomStep(s) up to 'maxZoom'
        let currentZoomScale = 1; // v1 (start always from original unzoomed size)
        const autoZoomVersion = userSettings.autoZoomVersion; // 1

        if (!UI.isZoomed() || autoZoomVersion === 2) {
             // v2 (start from any zoomed size, where we are already from #zoom-controls)
            //currentZoomScale = UI.stateTransform.scale; // ?????
            currentZoomScale = state.transform.scale;

            const newZoomScale = 
                UI.getNextZoomScale(
                    currentZoomScale,
                    !e.shiftKey // use the shiftKey state (negated) for zoomIn / zoomOut
                );
    
            // remember current zoomScale, and set isZoomed() boolean
            //UI.stateTransform.scale = newZoomScale; // ?????
            state.transform.scale = newZoomScale;

            /*
                it is important to add the "autov?" CSS style
                AFTER setting "zoomed" on the classlist,
                otherwise the CSS rule for the 'zoom-out' cursor style
                will NOT be displayed:
                    - on autoZoom ('click' handler) or
                    - on zoomed img with the SHIFT key

                .media-modal img.zoomed.autov1 {
                    cursor: zoom-out;
                }

                body.shift-mode .modal-media.zoomed {
                    cursor: zoom-out;
                }
            */

            // pass the event data 'e' (with mouse-coordinates of the click)
            //UI.applyZoom(mediaElement, e, UI.stateTransform.scale, debug); // ?????
            UI.applyZoom(mediaElement, e, state.transform.scale, debug);

            if (UI.isZoomed()) {
                mediaElement.classList.add("zoomed");
                if (userSettings.autoZoom)
                    mediaElement.classList.add(`autov${autoZoomVersion}`);
            }
            else { // !applyZoom
                UI.resetZoomAndPan(mediaElement, false, debug); // !applyZoom
            }
            
        } else { // UI.isZoomed && autoZoomVersion != 2
            // there could be later a autoZoomVersion 3
            if (autoZoomVersion === 1) // toggleZoom reset, applyZoom
                UI.resetZoomAndPan(mediaElement, false, debug); // applyZoom
        }
        
        // Update cursor and zoom state
        //UI.updateModalCursor();
        UI.updateZoomButtons(); // min/max ZoomScale
    }

    static getNextZoomScale(currentZoomScale = 1, zoomIn = true) {
        const zoomStep =
            (userSettings.autoZoom)
                ? userSettings.autoZoomStep // 'auto' zoomStep (usually bigger)
                : userSettings.zoomStep // 'regular' zoomStep (usually smaller)
            ;

        let nextZoomScale = currentZoomScale; // start from last zoom scale

        // zoom-in/out with 'zoomStep' (within "boundaries")
        nextZoomScale = 
            (zoomIn)
                ? Math.min(userSettings.maxZoomScale, currentZoomScale + zoomStep)
                : Math.max(userSettings.minZoomScale, currentZoomScale - zoomStep)
            ;
        
        return nextZoomScale;
    }

    // this is used from 'zoom.btn' in/out click-handler,
    // and e === null (or not meaningful for a 'targeted' zoom)
    static zoomBtnClick(zoomIn = true, modalMedia = null, e = null) {
        const debug = state.pan.debug; // use pan.debug state

        //TODO ?????
        //UI.stateTransform.scale =
        state.transform.scale =
            UI.getNextZoomScale(
                state.transform.scale, //UI.stateTransform.scale,
                zoomIn // true=zoomIn, false=zoomOut
            );

        //modalMedia = UI.applyZoom(modalMedia, e, UI.stateTransform.scale, debug); // ?????
        modalMedia = UI.applyZoom(modalMedia, e, state.transform.scale, debug);

        if (UI.isZoomed()) {
            if (modalMedia)
                modalMedia.classList.add("zoomed");

            // Update cursor and zoom state
            //UI.updateModalCursor();
            UI.updateZoomButtons(); // min/max ZoomScale
        }
        else {
            UI.resetZoomAndPan(modalMedia, false); // !applyZoom, as we did already here
        }
    }

    // called by [ UI.initialize(), EnablePanning() ] and UI.resetZoomAndPan()
    static initState() {
        // the following only creates a SHALLOW copy on the first level
        // child objects are passed by reference and treated as the SAME object in memory!!!
        //const defaultState = this.DEFAULT_STATE; // resets scale to 1


        // Step 1: Create a deep clone of the default state
        const defaultState = structuredClone(this.DEFAULT_STATE); // global shared UI state

        // Step 2: Create a deep clone of the user settings, just for the pan properties
        const panUserSettings = structuredClone(modal.pan); // structuredClone(userSettings.pan);
        //TODO: read directly from userSettings.pan ?????

        // overwrite with PAN user preferences (stored in this modal.pan)
        // use spread operator(...)

        // Merge the objects. The order is important.
        // The user settings are spread *after* the default settings,
        // ensuring they override any default values for keys 'a' and 'b'.

        /* this does NOT merge, only the panUserSettings survive in mergedState.pan
        const mergedState = {
            ...defaultState,
            pan: { ...panUserSettings } // overwrite the DEFAULTS
        };
        */

        // Step 3: Perform a nested merge for the `pan` object
        const mergedState = {
            ...defaultState,
            pan: {
                ...defaultState.pan, // First, spread the default pan settings
                ...panUserSettings, // Then, spread the user's pan settings to override
                // You may need to do this recursively for nested objects like `momentum` and `smoothing`
                momentum: {
                    ...defaultState.pan.momentum,
                    ...panUserSettings.momentum
                },
                smoothing: {
                    ...defaultState.pan.smoothing,
                    ...panUserSettings.smoothing
                }
            }
        };

        return mergedState;
    }

    // called from '0' zoom-controls button
    // and from '0' key handler
    // and also used from autoZoom() in 'autoZoom' mode when zoom-out
    static resetZoomAndPan(mediaElement = null, applyZoom = true) {
        const debug = state.pan.debug; // use pan.debug state

        if (!mediaElement) // when called from reset 'zoom-btn'
            mediaElement = UI.getMediaZoomTarget();
        
        if (applyZoom)
            // zoomOut existing mediaElement to fit screen again
            UI.applyZoom(mediaElement, null, 1, debug); // !mediaElement aware and returns null

        //UI.stateTransform.scale = 1; // ?????
        // get a fresh copy of the state dict, personalized with userSettings.pan
        state = this.initState();

        if (mediaElement) {
            // remove all zoom classes from mediaElement
            mediaElement.classList.remove("zoomed", "autov1", "autov2");

            // reset transformOrigin
            mediaElement.style.transformOrigin = "center center" // or "50% 50%"

            // Reset existing transform(s):
            //  (scale) from zoom and
            //  optional (translate) from panning

             // special handling needed for zoomScale === 1
            UI.applyZoomTransform(mediaElement, 1);
        }

        // reset the stateDragging from DRAG/PAN/MOVE op
        UI.stateDragging = this.DEFAULT_DRAGGING;

        // reset the stateTransform from DRAG/PAN/MOVE op
        UI.stateTransform = this.DEFAULT_TRANSFORM; // v12 RL

        // Update cursor and zoom state
        //UI.updateModalCursor();
        UI.updateZoomButtons(); // min/max ZoomScale
    }

    // this is the programatic way of controlling the cursor
    // for 'zoom-in' or 'zoom-out' state
    static updateModalCursor(modalMedia = null) {
        //return; //TODO - for now we test the CSS rulesets

        if (!modalMedia)
            modalMedia = this.getMediaZoomTarget();

        if (!modalMedia) // cannot find element
            return;

        if (UI.isZoomed && modalMedia.classList.contains("zoomed")) {
            // in all "zoomed" cases except one, the cursor should be set to "zoom-out"
            if (userSettings.autoZoom &&
                userSettings.autoZoomVersion === 2 &&
                // ?????
                //UI.stateTransform.scale < userSettings.maxZoomScale &&
                state.transform.scale < userSettings.maxZoomScale &&
                modalMedia.classList.contains(`autov${autoZoomVersion}`)) {

                modalMedia.style.cursor = 'zoom-in';
            }
            else { // autoZoomVersion === 1
                modalMedia.style.cursor = 'zoom-out';
            }
        }
        else {
            modalMedia.style.cursor = 'zoom-in';
        }
    }

    static updateZoomButtons() {
        if (!userSettings.zoomPanelEnabled)
            return;

        const zoomButtons = document.querySelectorAll(`#zoom-controls${modal.elIDPostFix} .zoom-btn`);

        if (zoomButtons.length >= 3) {
            // Update button states
            const zoomInBtn = zoomButtons[0];   // +
            const resetBtn = zoomButtons[1];    // 0
            const zoomOutBtn = zoomButtons[2];  // -
            
            // Disable zoom in if at max zoom
            // ?????            
            //zoomInBtn.disabled = (UI.stateTransform.scale >= userSettings.maxZoomScale);
            zoomInBtn.disabled = (state.transform.scale >= userSettings.maxZoomScale);
            
            // Disable zoom out if at min zoom
            //zoomOutBtn.disabled = (UI.stateTransform.scale <= userSettings.minZoomScale);
            zoomOutBtn.disabled = (state.transform.scale <= userSettings.minZoomScale);
            
            // Reset is always enabled
            resetBtn.disabled = false;
        }

        const currentZoomScaleSpan = document.getElementById(`current-zoomScale${modal.elIDPostFix}`);
        //currentZoomScaleSpan.innerText = `(${UI.stateTransform.scale})`;
        currentZoomScaleSpan.innerText = `(${state.transform.scale})`;
    }
    // *** END Zoom Control in modal /modalEx dialog
    
    // *** BEGIN Zoomed Image panning

    //static debug = true; // global debugging state
    static v7SpeedTest = true; // use global or v7 speed test version

    /* media TEMPLATE passed from galleryItems to mediaModal:

        showMediaModal(mediaId, galleryId, galleryIndex)

        'mediaId' is used to access the de-serialized instance
        stored in 'window.storedArtefacts[mediaId]:

        // de-serialize the stored image metadata object
        media = JSON.parse(window.storedArtefacts[mediaId]);
    */
    static DEFAULT_MEDIA = { // mediaId: "img-123456789@67554754.jpeg"
        name: null, isVideo: false,
        url: { base: null, gallery: null, full: null },
        // an instance of this.DEFAULT_STATE is copied here at runtime
        //TODO - decide on state scope global or per media ?????
        //state: { transform, dims: { image, container, scalePrecalcs }, pan },
        model: { id: null, name: null },
        data: null // { JSON from REST call }
    };

    //TODO - activate/integrate this ?????
    static DEFAULT_MODAL = { // modal:
        version: 'modal', // 'modal' or 'modalEx'
        elIDPostFix: "", // appended at runtime to query modal element ids
        // can be one of the following 2 constants:
        elID_POSTFIX_MODAL: "", // only used for 'modal' element ids
        elID_POSTFIX_MODALEX: "-ex", // only used for 'modalEx' element ids
        // e.g. "#modal-image" vs. "#modal-image-ex"

        debug: true,
        dialog: null, // "#media-modal(-ex)" element
        isOpen: false, // classList.contains("hidden")

        media: null, // JSON object with all media info (REST call)

        currentGalleryId: null, // for global handlers
        galleryImages: [], // [...document.querySelectorAll(`#${galleryId} .gallery-item img, #${galleryId} .gallery-item video`)];
        currentGalleryIndex: 0, // for scroll/nav global handlers

        container: null, // "#media-container(-ex)" element
        image: null, // "#modal-image(-ex)" element
        video: null, // "#modal-video(-ex)" element
        spinner: null, // "#modal-spinner(-ex)" element

        mediaInfo: null, // "#modal-media-info(-ex)" element
        mediaInfoVisible: false, // boolean (initial default from userSettings.showMediaInfo)
        // can be toggled with the SPACE key; state persists during session

        pan: {
            enabled: true, //TODO read from userSettings ?????

            useTranslate3D: true, // 3D-DOMMatrix (GPU), false uses 2D-DOMMatrix
            divideTranslationsByScale: false, // DEBUGPAN ?????
            // applied to dx/dy for adding to 'initialTranslate' (Treshold adjust !JUMP)
            // and for calculating the 'targetPosition'

            useAnimationFrame: true, // adapt to browser framerate
            useWindowsEventHandlers: true, // false attaches EventHandlers to 'modalImage' element

            THRESHOLD: 7, // in Pixels to distinguish a drag/pan from a mouse 'click'
            RESOLUTION: 10, // (1-n) DRAG/PAN mouse resolution,
            /* e.g. 20 means 1px mouse movement = 20px translation movement
                deltaMouse = mouse - start
                state.transform.translate = initialTranslate + deltaMouse * RESOLUTION
                only used in 'regular' panning, see below
            */
            // initialTranslate, start

            momentum: {
                enabled: false, // overwritable by 'pan.enabled'
                /*  'momentum' can work without 'smoothing.enabled',
                    'momentum' calculates a 'targetPosition' based on 'velocity' * FRICTION
                    but 'smoothing' needs 'momentum.enabled', because it
                    smoothes this 'momentum.targetPosition' by 'FACTOR'

                    if ('smoothing.enabled'), it will enforce also 'momentum.enabled'
                    if (! 'soothing.enabled'), 'momentum.enabled' is free for its choice
                */ 
                FRICTION: 0.95, // (% 0-1) 'velocity' *= FRICTION;
                SMOOTHING: 0.80,// (% 0-1) 'velocity' smoothing
                THRESHOLD: 0.1  // (> 0) NON-neglible 'velocity' movements
                // newVelocity = e.offset (currentMouse) - lastMouse
                // velocity *= SMOOTHING + newVelocity * (1 - SMOOTHING); // 0.8 + 0.2 = 100%
                // velocity, lastMouse, targetPosition
            },
            smoothing: {
                enabled: false, // overwritable by 'pan.enabled'
                FACTOR: 0.2 // (% 0-1) Adjust for desired smoothness
                // currentPosition += (targetPosition - currentPosition) * FACTOR;
                // currentPosition
            }
        }
    };

    //static modal = structuredClone(this.DEFAULT_MODAL);
    // defined as class var

    static DEFAULT_TRANSFORM_SCALE_PRECALC = {
        /* the following 4 properties get calculated on each scale/zoom change
            by 'getScalePrecalcs()' and are "merged/overwritten" into 'state.transform'
            by 'handleMouseDown()' event handler

            This dict is then used during 'mousemove' which is using 'animationFrame()' call-back function,
            which calls the 'updatePosition()' function during PANNING,
            which itself uses the helper function 'handleMouseMoveLogic()'
            which uses this (pre-calculated) values:

            // Apply clamping to the interpolated current position
            const newTranslate = state.pan.smoothing.currentPosition;
            this.handleMouseMoveLogic(newTranslate, state.transform, state.dims.scalePrecalc,  true);
        */
        hasOriginOffset: false, // true with "pointed" zoomed, false when "centered" zoom
        transformOrigin: "center center", // when !hasOriginOffset,
        // else e.g. "300px 280px"
        // for now we need to stay compatible and use X/Y Names instead od 2D-point
        //origin: { x: 0, y: 0 }, // mouse, e.g. { x: 300, y: 280 }
        // for now we need to stay compatible and use X/Y Names instead od 2D-point
        //origin: { x: 0, y: 0 } // last "pointed" zoom
        originX: 0, // mouse.x, e.g. 300
        originY: 0 //mouse.y, e.g. 280
        // when the mouse "pointed zoom" occured at
        // mouse { x: e.offsetX, y: e.offsetY }, e.g. { x: 300, y: 280 }
    }


    static DEFAULT_STATE = { // state:
        transform: {
            image: null, // image element (img), needed for only autoZoom() on any image,
            // e.g. modalImage, or the '#media-preview img' (which will NOT be PANNED)
            container: null, // image.parentElement (div), e.g. modalContainer, or the #media-preview

            scale: 1, // default zoom scale (scale driven by userSettings)
            // for now we need to stay compatible and use X/Y Names instead od 2D-point
            //translate: { x: 0, y: 0 } // last PAN
            translateX: 0, // last PAN
            translateY: 0, // last PAN

            /* these 4 properties get calculated on each scale/zoom change
                by 'getScalePrecalcs()' and returned as second tuple result 'transformScalePrecalc'
                It can be "merged/overwritten" here into 'state.transform'
                by 'handleMouseDown()' event handler
            */
            hasOriginOffset: false, // true with "pointed" zoomed, false when "centered" zoom
            transformOrigin: "center center", // when !hasOriginOffset,
            // else e.g. "300px 280px"
            // for now we need to stay compatible and use X/Y Names instead od 2D-point
            //origin: { x: 0, y: 0 }, // mouse, e.g. { x: 300, y: 280 }
            // for now we need to stay compatible and use X/Y Names instead od 2D-point
            //origin: { x: 0, y: 0 } // last "pointed" zoom
            originX: 0, // mouse.x, e.g. 300
            originY: 0 //mouse.y, e.g. 280
            // when the mouse "pointed zoom" occured at
            // mouse { x: e.offsetX, y: e.offsetY }, e.g. { x: 300, y: 280 }
        },
        
        dims: { /* used by getScalePrecalcs() to generate above transform.scalePrecalcs
                otherwise dims() are not used and here for reference.
                dims do NOT change on scale/zoom changes, only need to be updated
                when UI is resized, e.g. on an 'resize' event
            */
            image: { // only for reference (not really needed);
                // important is only 'calculatedTranslateRanges' dict
                element: null, // image element (img)
                width: 0, // image.offsetWidth
                height: 0, // image.offsetHeight
                scaledWidth: 0, // image.getBoundingClientRect().width
                scaledHeight: 0, // image.getBoundingClientRect().height
                defaultOriginX: 0, // width / 2,
                defaultOriginY: 0 // height / 2
            },
            container: { // only for reference (not really needed);
                // important is only 'calculatedTranslateRanges' dict
                element: null, // container element (div)
                width: 0,  // container.offsetWidth
                height: 0, // container.offsetHeight
            },
        
            scalePrecalc: { // these get calculated on each scale/zoom change
                /* by 'getScalePrecalcs()' and used by 'handleMouseMove()' event handler:

                    // Apply clamping to the interpolated current position
                    const newTranslate = state.pan.smoothing.currentPosition;
                    handleMouseMoveLogic(newTranslate, state.transform, state.dims.scalePrecalc,  true);

                    This is needed together with 'pan.smoothing.currentPosition'
                    for calculating the clamped boundaries applied during PANNING.
                    This will be pre-calculated in 'handleMouseDown()' event and then
                    used in "handleMouseMove()'s animationFrame's 'updatePosition()"" LOOP
                */
                usedScaleForPrecalc: null, // passed from getScalePrecalcs(scale, dims, ...)
                // if (scale === usedScaleForPrecalc) no recalculation of 'dims'
                // occurs during the PANNING and 'dims' just pass-thru
                // otherwise 'usedScaleForPrecalc' gets updated to 'scale' used during preCalc

                originOffsetX: 0, // (originX - defaultOriginX) * (scale - 1)
                originOffsetY: 0, // (originY defaultOriginY) * (scale - 1)
                //rangeX: ? // Math.max(0, Math.round(image.scaledWidth) - container.width);
                //rangeY: ? // Math.max(0, Math.round(image.scaledHeight) - container.height);
                maxX: 0, // Math.round(rangeX / 2);
                maxY: 0, // Math.round(rangeY / 2);
                minX: 0, // (0 - maxX)
                minY: 0 // (0 - maxY)
            }
        },

        pan: {
            enabled: true, // if set to false,
            // it overwrites smoothing.enabled and momentum.enabled,
            // because then the whole PAN is disabled on this image,
            // and only ZOOM will work, without PANNING the zoomed image
            // if set to true, smoothing.enabled and momentum.enabled
            // can be set individually in any 4 combinations

            // consider disabling debugging for speed reasons during "mouseevents"
            debug: true, // drag/pan debug state

            useTranslate3D: true, // 3D-DOMMatrix (GPU), false uses 2D-DOMMatrix
            divideTranslationsByScale: false, // DEBUGPAN ?????
            // applied to dx/dy for adding to 'initialTranslate' (Treshold adjust !JUMP)
            // and for calculating the 'targetPosition'

            useAnimationFrame: true, // adapt to browser framerate
            animationFrameId: null, // a single state variable for the animation loop
            useWindowsEventHandlers: true, // false attaches EventHandlers to 'modalImage' element

            coordinatesMethod: 'offset', // 'offset' or 'client' (used by applyZoom() and during 'mousemove' events)
            isPanning: false, // state var during 'mouse' events
            hasPanned: false, // state var for multiple drags (avoids fake 'click' event detection)

            dragThresholdMet: false, // Math.sqrt(dx * dx + dy * dy) > TRESHOLD

            THRESHOLD: 5, // in Pixels to distinguish a drag/pan from a mouse 'click'
            // dx/dy distance before a DRAG/PAN is started
            RESOLUTION: 20, // (1-n) DRAG/PAN mouse resolution,
            /* e.g. 20 means 1px mouse movement = 20px translation movement
                deltaMouse = mouse - start
                state.transform.translate = initialTranslate + deltaMouse * RESOLUTION
                only used in 'regular' panning, see below
            */
            initialTranslate: { x: 0, y: 0 }, // when pan starts ('mousedown'),
            /* 'initialTranslate' is captured from the 3D-CaptureMatrix
                this translate is also copied into 'state.transform.translate' ?????
                during 'mousemove' it is corrected accordingly to dx/dy mouse-changes
                for 'treshold' corrections (together with 'start') avoiding JUMPS

                during real panning (above the 'treshold'), when 'momentum.enabled':
                'targetPosition' = 'initialTranslate' + dx/dy mouse-changes
                this 'targetPosition' is then further incremented with 'velocity' (in the animationFrame)
                'smoothing' then takes over the accelerated 'targetPosition',
                and smoothes it into its 'currentPosition' (also in the animationFrame)
                'currentPosition' is then clamped and passed into the 3D-ApplyMatrix

                when neither 'momentum' nor 'smoothing' is enabled, 'regular' panning is used:
                'state.transform.translate' = 'initialTranslate' + deltaMouse * RESOLUTION
                and then 'state.transform.translate' is clamped and applied via 3D-Matrix
            */
            start: { x: 0, y: 0 }, // when drag/pan starts every consecutive time
            // needed for 'dragThresholdMet' detection during 'mousemove'

            // in the 'AnimationFrame's 'updatePosition(timestamp)' Loop
            // first momentum/velocity is applied (if enabled)
            // then 'smoothing' is applied to 'currentPossision' (if enabled)
            // and 'currentPosition' is then clamped by the (pre-calculated) image boundaries
            // and 'originOffset' from a "pointed" zoom is also applied to the image
            momentum: { // in the updatePosition() Loop
                enabled: true, // overwritable by 'pan.enabled'
                /*  'momentum' can work without 'smoothing.enabled',
                    'momentum' calculates a 'targetPosition' based on 'velocity' * FRICTION
                    but 'smoothing' needs 'momentum.enabled', because it
                    smoothes this 'momentum.targetPosition' by 'FACTOR'

                    if ('smoothing.enabled'), it will enforce also 'momentum.enabled'
                    if (! 'soothing.enabled'), 'momentum.enabled' is free for its choice
                */ 
                FRICTION: 0.95, // (% 0-1) 'velocity' *= FRICTION;
                SMOOTHING: 0.80,// (% 0-1) 'velocity' smoothing
                THRESHOLD: 0.1, // (> 0) NON-neglible 'velocity' movements 
                // newVelocity = e.offset (currentMouse) - lastMouse
                // velocity *= SMOOTHING + newVelocity * (1 - SMOOTHING); // 0.8 + 0.2 = 100%
                velocity: { x: 0, y: 0 }, // tracks the velocity
                lastMouse: { x: 0, y: 0 }, // for velocity calculation
                targetPosition: { x: 0, y: 0 }, // track the target position where we are heading to
                // targetPosition += velocity * deltaTime;
                // deltaTime = timestamp (param) - lastFrameTime
                lastFrameTime: 0 // performance.now(); // start the timer
            },

            smoothing: { // in the updatePosition() Loop
                enabled: true, // overwritable by 'pan.enabled'
                FACTOR: 0.2, // (% 0-1) Adjust for desired smoothness
                // currentPosition += (targetPosition - currentPosition) * FACTOR;
                currentPosition: { x: 0, y: 0 } // this goes into the clamped translate
            }
        }
    }

    //static state = structuredClone(this.DEFAULT_STATE); // global shared UI state ????? vs. per-media state
    // defined as class var

    // Store state for the current drag operation ?????
    static DEFAULT_DRAGGING = {
        enabled: true,
        // consider disabling debugging for speed reasons during "mouseevents"
        debug: true, // dragging debug state

        useTranslate3D: true, // 3D-DOMMatrix (GPU), false uses 2D-DOMMatrix
        useAnimationFrame: true, // adapt to browser framerate
        useWindowsEventHandlers: true, // false attaches EventHandlers to 'modalImage' element

        coordinatesMethod: 'offset', // 'offset' or 'client' (used by applyZoom() and during 'mousemove' events)
        isDragging: false, // state var during 'mouse' events
        hasDragged: false, // state var for multiple drags (avoids fake 'click' event detection)
        dragThresholdMet: false, // state var during 'mouse' events

        THRESHOLD: 5, // // Pixels to distinguish a drag/pan from a mouse 'click'
        // dx/dy distance before a DRAG/PAN is started
        RESOLUTION: 20, // DRAG/PAN mouse resolution: 20 means 1px mouse = 20px translation
        startX: 0, // needed for trashhold detection during 'mousemove'
        startY: 0, // needed for trashhold detection during 'mousemove'
    }

    static stateDragging = structuredClone(this.DEFAULT_DRAGGING);
    

    static DEFAULT_TRANSFORM = { // ?????
        image: null, // image element (img)
        container: null, // image.parentElement (or custom div)
        scale: 1, // default zoom scale
        hasOriginOffset: false, // "pointed" zoom
        transformOrigin: "center center", // "300px 280px"
        originX: 0, // 300: zoom pointX (e.offsetX)
        originY: 0, // 280: zoom pointY (e.offsetY)
        translateX: 0, // last panX
        translateY: 0 // last panY
    }

    static stateTransform = structuredClone(this.DEFAULT_TRANSFORM);

    /* the UI.stateDragging.coordinatesMethod 'offset' property will be used by:
        
        UI.applyZoom():
            "offset" is needed for a real "pointed" zoom
            "client" will not fully center the zoom to the zoom-point

        UI.handleMouseDown():
            To initialize a PANNING operation
            (captures UI.stateDragging.startX / UI.stateDragging.startY)

        UI.handleMouseMove():
            To start a PANNING operation (uses state.transform)
        
        UI.handleMouseMoveLogic():
            this helper function of UI.handleMouseMove()
            does the actual panning/moving of the image.
            It uses the "translate()" or translate3d() in the form of
            matrix(2d) / matrix3d style transform functions,
            applying scale and translate all together with a matrix
    */

    /*
        translate() seems to use 'offset' coordinates:

        Note: The coordinates in translate() are relative to
        the element's original position, not absolute page coordinates.
        If absolute positioning is desired,
            position: absolute; top: 0; left: 0;
        can be used in conjunction with translate() or alternative positioning methods.

        Our '.media-container' class uses position:relative;
    */
    
    static initialTranslate = { x: 0, y: 0 }; // v12 global ?????

    static initialImageDimensions = null; // used by global events ?????


    // A helper function to apply initial zoom and activate PANNING
    // called by UI.showMediaModal(), also called from UI.navInModal() [called by UI.modalPrev() & UI.modalNext()]
    static applyZoomAndPan(modalMedia, modalContainer) {
        // consider disabling debugging for speed reasons during "mouseevents"
        const debug = state.pan.debug; // use pan.debug state

        // Reset state and get initial dimensions
        UI.resetZoomAndPan(modalMedia);
        
        if (UI.v7SpeedTest) { // local const events
            // *** v7 speed test ***
            UI.enablePanning(modalMedia, modalContainer, true); // debug
        }
        else { // global static events
            // For video or if image is already loaded
            UI.initialImageDimensions = UI.getInitialImageDimensions(modalMedia, modalContainer, debug);
        }

        /*
        if (modalMedia.tagName === 'IMG') {
            modalMedia.onload = () => {
                UI.initialImageDimensions = UI.getInitialImageDimensions(modalMedia, modalContainer);
                UI.enablePanning(modalMedia, modalContainer);
            };
        } else {
            // For video or if image is already loaded
            UI.initialImageDimensions = UI.getInitialImageDimensions(modalMedia, modalContainer);
            UI.enablePanning(modalMedia, modalContainer);
        }
        */
        
        /*
        window.addEventListener('resize', () => {
            const modalMedia = document.querySelector('.modal-media.zoomed');
            if (modalMedia) {
                // re-initialize UI.initialImageDimensions
                const modalContainer = modalMedia.parentElement;
                UI.initialImageDimensions = UI.getInitialImageDimensions(modalMedia, modalContainer, debug);
            }
        });
        */
    }


    /*
    Combining all optimizations

    - Pre-calculate dimensions: Do this outside the mousemove loop.
    - Use DOMMatrix consistently: Avoid parsing strings.
    - requestAnimationFrame: Implement the refined loop with interpolation.
    - translate3d: Use this for GPU acceleration.
    - Velocity and smoothing: Add a velocity tracking system for momentum. 

    By applying these advanced animation techniques, your panning behavior will become significantly smoother and more responsive, matching the performance of a dedicated library.
    */

    // *** v7 - speed test for PANNING ***
    // Attach event listeners when the modal is shown
    static enablePanning(modalImage, modalContainer, debug = false) {
        // get a fresh LOCAL copy of the state dict, personalized with userSettings.pan
        // already initialized from UI.resetZoomAndPan()
        //state = this.initState();
        state.debug = debug; // parameter


        state.dims.image.element = modalImage; // init with modalImage parameter
        state.dims.container.element = modalContainer; // init with modalContainer parameter

        //let isDragging = false;
        state.pan.isPanning = false; // already set with default
        //let hasDragged = false;
        state.pan.hasPanned = false; // already set with default
        //let dragThresholdMet = false;
        //const DRAG_THRESHOLD = UI.stateDragging.DRAG_THRESHOLD; // 5 pixel
        // state.pan.THRESHOLD = 5; // already set with default

        // currently does not respect state.smoothing.useAnimationFrame
        // and ALWAYS uses animationFrame
        //const useAnimationFrame = UI.stateDragging.useAnimationFrame;

        //let animationFrameId = null; // a single state variable for the animation loop
        state.pan.animationFrameId = null; // a single state variable for the animation loop; already set with default

        //let initialTranslate = { x: 0, y: 0 }; // already set with default
        state.pan.initialTranslate = { x: 0, y: 0 }; // already set with default

        //let startX = 0;
        //let startY = 0;
        state.pan.start = { x: 0, y: 0 }; // already set with default

        // *** BEGIN initialize input smoothing
        if (state.pan.smoothing.enabled) {
            if (state.debug)
                console.debug("*** initialize input smoothing");

            //let currentPosition = { x: 0, y: 0 }; // want to translate before clamp
            state.pan.smoothing.currentPosition = { x: 0, y: 0 }; // already set with default
        }
        // *** END initialize input smoothing

        // *** BEGIN initiaize momentum/velocity tracking
        if (state.pan.momentum.enabled) {
            if (state.debug)
                console.debug("*** initiaize momentum/velocity tracking");

            //let velocity = { x: 0, y: 0 }; // tracks the velocity
            state.pan.momentum.velocity = { x: 0, y: 0 }; // tracks the velocity; already set with default
            //let lastMouseX, lastMouseY; // for velocity calculation
            state.pan.momentum.lastMouse = { x: 0, y: 0 }; // for velocity calculation; already set with default
            //let targetPosition = { x: 0, y: 0 }; // track the target position where we are heading to
            state.pan.momentum.targetPosition = { x: 0, y: 0 }; // // track the target position where we are heading to; already set with default

            //let lastFrameTime = performance.now(); // start the timer
            state.pan.momentum.lastFrameTime = performance.now(); // start the timer
        }
        // *** END initialize momentum/velocity tracking


        // the "updatePosition(timestamp)" function is our abimation loop
        // as it also runs AFTER the mouseUp event handler has fired
        // we need Detecting the end of the animation loop
        // The best place to check this is at the end of the updatePosition function

        // added (optional) timestamp for momentum/velocity tracking
        // the updatePosition() is "THE LOOP" and handle
        // all 4 smoothing.enabled and momentum.enabled combinations
        function updatePosition(timestamp = null) {
            // *** BEGIN momentum/velocity tracking
            if (state.pan.momentum.enabled) {
                if (state.debug)
                    console.info("*** updatePosition(): momentum/velocity tracking");

                const deltaTime = timestamp - state.pan.momentum.lastFrameTime;

                // Calculate new target based on velocity
                state.pan.momentum.targetPosition.x
                    += state.pan.momentum.velocity.x * deltaTime;
                state.pan.momentum.targetPosition.y
                    += state.pan.momentum.velocity.y * deltaTime;

                // Apply friction to slow down the velocity
                // Adjust for desired drag, e.g. (state.pan.momentum.FRICTION = 5)
                state.pan.momentum.velocity.x *= state.pan.momentum.FRICTION;
                state.pan.momentum.velocity.y *= state.pan.momentum.FRICTION;
            }
            // *** END momentum velocity tracking

            // *** BEGIN input smoothing
            if (state.pan.smoothing.enabled) {
                if (state.debug)
                    console.info("*** updatePosition(): input smoothing");

                // Interpolate the current position towards the target position
                state.pan.smoothing.currentPosition.x +=
                  (state.pan.momentum.targetPosition.x - state.pan.smoothing.currentPosition.x)
                  * state.pan.smoothing.FACTOR; // // e.g. 0.2; Adjust for desired smoothness
                state.pan.smoothing.currentPosition.y +=
                  (state.pan.momentum.targetPosition.y - state.pan.smoothing.currentPosition.y)
                  * state.pan.smoothing.FACTOR;
            }
            // *** END input smoothing

            let newTranslate = { x: 0, y: 0 };

            // *** BEGIN regular PANNING
            if (!state.pan.smoothing.enabled && !state.pan.momentum.enabled) {
                if (state.debug)
                    console.info("*** updatePosition(): regular panning NOP");

                // Apply clamping to the 'regular' panned image
                newTranslate = { x: state.transform.translateX, y: state.transform.translateY };
            }
            else { // 'smoothing' and/or 'momentum'
                // Apply clamping to the interpolated current position
                newTranslate = state.pan.smoothing.currentPosition;
                // but copy state also as "copy" into 'state.transform.translate'
                state.transform.translateX = state.pan.smoothing.currentPosition.x;
                state.transform.translateY = state.pan.smoothing.currentPosition.y;
            }
            // *** END regular PANNING


            UI.handleMouseMoveLogic(newTranslate, state.transform, state.dims.scalePrecalc, true);

            state.pan.momentum.lastFrameTime = timestamp; // for velocity tracking

            // Request the next frame if the position is still changing
            // *** 'smoothing' version (wins over momentum version)
            if (state.pan.smoothing.enabled
                && (Math.abs(state.pan.momentum.targetPosition.x
                    - state.pan.smoothing.currentPosition.x) > state.pan.momentum.TRESHOLD
                || Math.abs(state.pan.momentum.targetPosition.y
                    - state.pan.smoothing.currentPosition.y) > state.pan.momentum.TRESHOLD)) {

                state.pan.animationFrameId = requestAnimationFrame(updatePosition);
            } else {
                // Stop the animation
                cancelAnimationFrame(state.pan.animationFrameId);
                state.pan.animationFrameId = null;
            }

            // *** 'momentum' (velocity) added version (if used standalone without 'smoothing')
            // Continue animation if still panning/moving and
            // velocity is NON-neglible (state.pan.momentum.THRESHOLD), e.g. 0.1
            if (state.pan.momentum.enabled && !state.pan.smoothing.enabled
                && (state.pan.isPanning
                || Math.abs(state.pan.momentum.velocity.x) > state.pan.momentum.THRESHOLD
                || Math.abs(state.pan.momentum.velocity.y) > state.pan.momentum.THRESHOLD)) {
                
                state.pan.animationFrameId = requestAnimationFrame(updatePosition);

            } else {
                // Stop the animation
                cancelAnimationFrame(state.pan.animationFrameId);
                state.pan.animationFrameId = null; // reset
                
                // Optional: Reset velocity for next pan/move
                state.pan.momentum.velocity = { x: 0, y: 0 };
            }
        }

        const handleMouseDown = (e) => {
            // consider disabling debugging for speed reasons during "mouseevents"
            const debug = state.pan.debug; // use pan.debug state

            state.pan.hasPanned =
                (state.pan.initialTranslate.x > 0
                || state.pan.initialTranslate.y > 0 );

if(debug)
    console.info(`handleMouseDown():
        zoomed: ${modalImage.classList.contains('zoomed')},
        isPanning: ${state.pan.isPanning},
        hasPanned: ${state.pan.hasPanned},
        dragThresholdMet: ${state.pan.dragThresholdMet}, 
    `);

            if (!modalImage.classList.contains('zoomed'))
                return; // we have nothing to do on regular unzoomed images

            // here we initiate the PAN and add the 'mousemove' and 'mouseup' listeners

            state.pan.isPanning = true;

            // do NOT reset state.pan.hasPanned, we support multiple DRAG/PAN ops
            //state.pan.hasPanned = false;

            state.pan.dragThresholdMet = false; // reset the trashhold

            // invite user to move/drag the zoomed image
            //modalImage.style.cursor = 'move'; //'grab';
            /* handled as CSS rule
                .modal-media.zoomed:active {
                    cursor: move;
                }
            */

            // remember the start position of this move/pan/drag op
            // this is needed to calculate a dx/dy in 'mousemove' event handler
            state.pan.start = { x: e.offsetX, y: e.offsetY }; // current mouse

            // Keep track of the last mouse position for velocity calculation
            // initially this is the same as state.pan.start
            state.pan.momentum.lastMouse = { x: e.offsetX, y: e.offsetY };

            // capture current translate() start settings for the 'mousemove' handler
            // when using translate3D() x/y should be divided by scale ?
            // on first PAN this will be always ZERO
             state.pan.initialTranslate = (state.pan.useTranslate3D)
                ? UI.getTranslateValues_3d(modalImage, debug)
                : UI.getTranslateValues_2d(modalImage, debug);

            // store a copy also in the state.transform (for reference)
            state.transform.translateX = state.pan.initialTranslate.x;
            state.transform.translateY = state.pan.initialTranslate.y;

            // precalculate and cache all relevant (and expensive) image dimensions
            // this precalc is then used in the 'mousemove' event handler
            // for fast and easy clampX/clampY calculation for the translation transform
            state.transform.image = modalImage; // safe a reference to the image
            state.transform.container = modalContainer; // safe a reference to the container

            // 'initial' call, or a 'resize' event occured
            // 'resize' the UI changes the 'image' and 'container' dims and
            // everything needs to be recalculated, even if 'scale' did not change
            // same call as an 'initial' call during 'mousedown' event:

            // 'initial' call during a 'resize' or 'mousedown' event
            const { dims, transformScalePrecalc }
                = UI.getScalePrecalcs(state.transform.scale, null, modalImage, modalContainer, debug);
            // *** integrate updated (re-)calculated values into our state

            // 'dims' are new calculated (passed as 'null'),
            // including the important 'dims.scalePrecalc' sub-dict
            state.dims = dims; // update the (empty) state.dims with the (pre-)calculated 'dims'

            // 'dims.scalePrecalc.usedScaleForPrecalc' === scale
            // gets updated for sub-sequent call optimizations

            // 'transformScalePrecalc' dict is new calculated,
            // ready to be "merged/updated" back into state.transform
            // following 4 values need to be updated:
            state.transform.hasOriginOffset = transformScalePrecalc.hasOriginOffset;
            state.transform.transformOrigin = transformScalePrecalc.transformOrigin;
            state.transform.originX = transformScalePrecalc.originX;
            state.transform.originY = transformScalePrecalc.originY;

            // dynamically attach "mouse" event handlers only when needed
            // attaching them to the 'window' object should be faster
            if (state.pan.useWindowsEventHandlers) {
                window.addEventListener('mousemove', handleMouseMove);
                window.addEventListener('mouseup', handleMouseUp);
                window.addEventListener('mouseleave', handleMouseUp); // Add leave handler
            }
            else {
                modalImage.addEventListener('mousemove', handleMouseMove);
                modalImage.addEventListener('mouseup', handleMouseUp);
                modalImage.addEventListener('mouseleave', handleMouseUp); // Add leave handler
            }

            e.preventDefault();
            e.stopPropagation();
        };


        const handleMouseMove = (e) => {
            if (!state.pan.isPanning) return;

            let dx = e.offsetX - state.pan.start.x;
            let dy = e.offsetY - state.pan.start.y;

            // Check if the drag threshold has been met
            if (!state.pan.dragThresholdMet) {
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance > state.pan.THRESHOLD) {
                    state.pan.dragThresholdMet = true;
                    state.pan.hasPanned = true;

                    state.pan.isPanning = true; // only after dragThresholdMet ?????

                    // apply after the 'dragThresholdMet' is met
                    if (state.pan.divideTranslationsByScale) {
                        dx /= state.transform.scale; // divideTranslationsByScale applied
                        dy /= state.transform.scale; // divideTranslationsByScale applied
                    }

                    // now we need to adjust the starting points for the translation
                    // and avoid the image "jumps" 5 pixel (Threshold value) when moving it

                    // making the following two adjustments,
                    // the drag will start smoothly and continuously,
                    // with no visible jump, as soon as the Threshold is met.

                    // ---- CORRECTION TO PREVENT JUMP ----
                    // When the Threshold is met, adjust the initial transform
                    // to account for the movement that has already occurred.
                    // This ensures the drag starts smoothly from the current position.

                    // immediately add the dx and dy from the pre-threshold movement
                    // to the initialTranslate. This ensures that the
                    // translation "catches up" to the current mouse position.

                    //DEBUGPAN - need to divide by scale, JUMPS ?????
                    state.pan.initialTranslate.x += dx; // divideTranslationsByScale applied
                    state.pan.initialTranslate.y += dy; // divideTranslationsByScale applied
                    // Also reset the state.pan.start to the current mouse position
                    // all subsequent dx and dy calculations will be relative to
                    // this new, corrected starting point.
                    state.pan.start = { x: e.offsetX, y: e.offsetY };
                    // ---- END OF CORRECTION ----
                }
            }
            else { // apply on any 'mousemove' event after dragThresholdMet 
                if (state.pan.divideTranslationsByScale) {
                    dx /= state.transform.scale; // divideTranslationsByScale applied
                    dy /= state.transform.scale; // divideTranslationsByScale applied
                }
            }

            // Only proceed with PANNING if the threshold has been met
            if (!state.pan.dragThresholdMet)
                return; // wait for dragThresholdMet

            // *** PANNING STARTS HERE ***

            // *** BEGIN momentum/velocity tracking
            // 'smoothing' needs 'momentum' to smooth, but not opposite)
            //  so enforce 'momentum.enabled' when 'smoothing.enabled'
            if (state.pan.smoothing.enabled && !state.pan.momentum.enabled) {
                // enforce also 'momentum.enabled'
                state.pan.momentum.enabled = true;
                if (debug)
                    console.info("'momentum.enabled' was enforced, consider setting it to true, when smoothing.enabled: true");
            }
            //else
                // 'momentum.enabled' is free for its choice

            if (state.pan.momentum.enabled) {
                if (debug)
                    console.info("Momentum.velocity tracking");

                // Update the target position based on mouse movement
                state.pan.momentum.targetPosition = {
                    x: state.pan.initialTranslate.x + dx, // divideTranslationsByScale applied
                    y: state.pan.initialTranslate.y + dy  // divideTranslationsByScale applied
                };

                // Calculate velocity
                const newVelocity = {
                    x: e.offsetX - state.pan.momentum.lastMouse.x,
                    y: e.offsetY - state.pan.momentum.lastMouse.y
                };

                if (state.pan.smoothing.enabled) {
                    // Add some smoothing to the velocity itself
                    state.pan.momentum.velocity.x *= state.pan.momentum.SMOOTHING
                        + newVelocity.x * (1 - state.pan.momentum.SMOOTHING);
                        // 0.8 + (1-0.8=0.2) = 1 (=100%)
                    state.pan.momentum.velocity.y *= state.pan.momentum.SMOOTHING
                        + newVelocity.y * (1 - state.pan.momentum.SMOOTHING);

                    // Keep track of the last mouse position for velocity calculation
                    state.pan.momentum.lastMouse = { x: e.offsetX, y: e.offsetY };
                }
            }
            // *** END momentum/velocity tracking

            // *** BEGIN regular PANNING
            if(!state.pan.smoothing.enabled && !state.pan.momentum.enabled) {
                if (debug)
                    console.info(`Regular tracking (dx: ${dx}, dy: ${dy}) with resolution 1:${state.pan.RESOLUTION}`);

                // 'regular' panning - Update the state.transform.translateX/Y values
                //  based on mouse movement of 'initialTranslate'

                state.transform.translateX = state.pan.initialTranslate.x + dx * state.pan.RESOLUTION; // divideTranslationsByScale applied
                state.transform.translateY = state.pan.initialTranslate.y + dy * state.pan.RESOLUTION; // divideTranslationsByScale applied
            }
            // *** END regular PANNING

            // The animation loop should only start once there is actual movement,
            // and the 'mousemove' event is the right place to trigger it.
            // This prevents the loop from running for no reason and
            // correctly syncs the start of the animation with the start of the mouse movement.

            // This loop ensures that the animation is always running
            // at the browser's refresh rate, making it look and feel much smoother.

            // Only start the animation loop if it's not already running
            if (!state.pan.animationFrameId) {
                state.pan.animationFrameId = requestAnimationFrame(updatePosition);
            }
        };

        const handleMouseUp = (e) => {
            // consider disabling debugging for speed reasons during "mouseevents"
            const debug = state.pan.debug; // use pan.debug state

if(debug)
    console.info(`handleMouseUp():
        isPanning: ${state.pan.isPanning}, 
        hasPanned: ${state.pan.hasPanned}, 
        dragThresholdMet: ${state.pan.dragThresholdMet}, 
    `);

            if (!state.pan.isPanning) return;

            //if (state.pan.isPanning) {
                if (!state.pan.dragThresholdMet) {
                    //alert('click');
                    // It was a click, not a pan/drag. Perform zoom toggle.
                    // E.g., modalImage.dispatchEvent(new CustomEvent('imageclick', { detail: { x: e.clientX, y: e.clientY } }));

console.info(`handleMouseUp() - FakeClick (!dragThresholdMet):
    isPanning: ${state.pan.isPanning}, 
    hasPanned: ${state.pan.hasPanned}, 
    dragThresholdMet: ${state.pan.dragThresholdMet}, 
`);

                    //"borrowed" from handleClick()
                    // prevent autoZoom() toogle and resetZoomAnPan()
                    e.preventDefault();
                    e.stopPropagation();
                    state.pan.dragThresholdMet = false;
                    state.pan.isPanning = false;
                    state.pan.hasPanned = false;

                    return; // added
                }
            //}

            // stopping the drag and cleaning up the listeners, as the drag is over
            state.pan.isPanning = false;

            // dont set this, as then the 'mouseup' event is treated a 'click' event
            // and will trigger autZoom Toogle after one drag
            // we set state.pan.dragThresholdMet = false;
            // in the handleClickEvent() later
            //***state.pan.dragThresholdMet = false;

            // In this model, the mouseup event doesn't stop the animation;
            // it simply ends the user's direct control.
            // The animation continues to run until the velocity fades out.

            // Let the animation loop handle the deceleration
            if (!state.pan.animationFrameId) {
                state.pan.animationFrameId = requestAnimationFrame(updatePosition);
            }

            // reset the mouse cursor
            // we are still on a "zoomed" image
            // handled via CSS rule
            //modalImage.style.cursor = 'grab';
            //UI.updateModalCursor(modalImage);

            // dynamically remove the now unneeded event handler, the drag is over
            if (state.pan.useWindowsEventHandlers) {
                window.removeEventListener('mousemove', handleMouseMove);
                window.removeEventListener('mouseup', handleMouseUp);
                window.removeEventListener('mouseleave', handleMouseUp);
            }
            else {
                modalImage.removeEventListener('mousemove', handleMouseMove);
                modalImage.removeEventListener('mouseup', handleMouseUp);
                modalImage.removeEventListener('mouseleave', handleMouseUp);
            }
        };

        const handleClick = (e) => {
            // consider disabling debugging for speed reasons during "mouseevents"
            const debug = state.pan.debug; // use pan.debug state

if(debug)
    console.info(`handleClick():
        isPanning: ${state.pan.isPanning},
        hasPanned: ${state.pan.hasPanned},
        dragThresholdMet: ${state.pan.dragThresholdMet}, 
    `);

            if (state.pan.dragThresholdMet || state.pan.hasPanned) {
                // prevent autoZoom() toogle and resetZoomAnPan()
                e.preventDefault();
                e.stopPropagation();
                state.pan.dragThresholdMet = false;
                state.pan.hasPanned = false;

                return;
            }

            UI.autoZoom(modalImage, e);
        };

        modalImage.addEventListener('mousedown', handleMouseDown);
        modalImage.addEventListener('click', handleClick, true);
    }

    /*** VERSION WITH GLOBAL Event Delegation ***/
    // BEGIN PANNING EVENT HANDLERS
    
    // Event handlers
    static handleMouseDown = (e) => {
        const modalImage = e.target.closest('.modal-media');
        const modalContainer = e.target.closest('.media-container');
        
        if (!modalImage || !modalContainer || !modalImage.classList.contains('zoomed'))
            return; // we have nothing to do on regular unzoomed images

        // consider disabling debugging for speed reasons during "mouseevents"
        const debug = state.pan.debug; // use pan.debug state

        UI.stateDragging.isDragging = true;
        // do NOT reset hasDragged, we support multiple DRAG/PAN ops
        //UI.stateDragging.hasDragged = false;
        UI.stateDragging.hasDragged =
            (UI.stateTransform.translateX > 0 ||
            UI.stateTransform.translateY > 0 );

        UI.stateDragging.dragThresholdMet = false; // wait for trashhold in "mousemove"

        // invite user to move/drag the zoomed image
        //modalImage.style.cursor = 'move'; //'grab';
        /* handled as CSS rule
            .modal-media.zoomed:active {
                cursor: move;
            }
        */

        // needed for UI.stateDragging.DRAG_THRESHOLD detection
        // in "mousemove" to trigger the move
        const mouse = UI.getMouseCoordinate(e);
        UI.stateDragging.startX = mouse.x; // e.offsetX || e.clientX
        UI.stateDragging.startY = mouse.y; // e.offsetX || e.clientX

        //DRAGGINGBUG

        const useTranslate3D = UI.stateDragging.useTranslate3D;
        const useWindowEventHandlers = UI.stateDragging.useWindowsEventHandlers;

        // capture translate() start settings for the "mousemove" handler
        // when using translate3D() x/y should be divided by scale ???

        /*
        if (useTranslate3D) {   
            //const {x, y} = UI.getTranslateValues_3d(modalImage, debug);
            //UI.stateTransform.translateX = x;
            //UI.stateTransform.translateY = y;
            UI.initialTranslate = UI.getTranslateValues_3d(modalImage, debug);
        }
        else {
            UI.initialTranslate = UI.getTranslateValues_2d(modalImage, debug);
        }
        */

        UI.initialTranslate = (useTranslate3D)
            ? UI.getTranslateValues_3d(modalImage, debug)
            : UI.getTranslateValues_2d(modalImage, debug);

        // store them also in the state.transform
        UI.stateTransform.translateX = UI.initialTranslate.x;
        UI.stateTransform.translateY = UI.initialTranslate.y;

        // precalculate and cache all relevant (and expensive) image dimensins
        // this precalc is then used in the 'mousemove' event handler
        // for fast and easy clampX/clampY calculation for the translation transform
        UI.transform = modalImage; // safe a reference to the image
        UI.stateTransform.container = modalContainer; // safe a reference to the container
        
        //UI.transformDims = UI.precalculateImageDimension(modalImage, modalContainer, UI.stateTransform.scale, debug)
        UI.transformDims =
            UI.precalculateImageDimension(modalImage, modalContainer, state.transform.scale, debug)

        // dynamically attach "mouse" event handlers only when needed
        // attaching them to the 'window' object should be faster
        if (useWindowEventHandlers) {
            window.addEventListener('mousemove', UI.handleMouseMove);
            window.addEventListener('mouseup', UI.handleMouseUp);
            window.addEventListener('mouseleave', UI.handleMouseUp);
        }
        else {
            modalImage.addEventListener('mousemove', UI.handleMouseMove);
            modalImage.addEventListener('mouseup', UI.handleMouseUp);
            modalImage.addEventListener('mouseleave', UI.handleMouseUp);
        }

        e.preventDefault();
        e.stopPropagation();
    };

    static handleMouseMove = (e) => {
        const stateDragging = UI.stateDragging; // use global dragging state
        if (!stateDragging.isDragging)
            return;

        // consider disabling debugging for speed reasons during "mouseevents"
        const debug = stateDragging.debug; // use dragging debug state

        // when we run in AnimationFrame() callback,
        // e.target === "div#media-modal.media-modal"
        // and *NOT* our image "#modal-media.modal-media"
        // use the reference we saved during handleMouseDown()
        // and avoid modal and modalEx stupity with element names "-ex"

        /*
        const modalImage = e.target.closest('.modal-media');
        const modalContainer = e.target.closest('.media-container');
        // or simply
        //const modalContainer = modalImage.parentElement;
        */
        
        //const modalImage = UI.transform;
        //const modalContainer = UI.stateTransform.container;

        const useAnimationFrame = stateDragging.useAnimationFrame;
        let animationFrameId = null; // force initialization of a new AnimationFrame

        if (useAnimationFrame) {
            if (!animationFrameId) {
                animationFrameId = requestAnimationFrame(() => {
                    //DRAGGINGBUG
                    // check stateDragging.DRAG_THRESHOLD detection to trigger the move
                    // stateDragging.startX/Y set in handleMouseDown() handler
                    const mouse = UI.getMouseCoordinate(e);
                    const deltaMouse = {
                        x: mouse.x - stateDragging.startX,   // e.offsetX || e.clientX
                        y: mouse.y - stateDragging.startY }; // e.offsetX || e.clientX

                    // check if we pass the Theshold for PAN/MOVE already
                    if (Math.abs(deltaMouse.x) > stateDragging.THRESHOLD
                        || Math.abs(deltaMouse.y) > stateDragging.THRESHOLD) {

                        stateDragging.dragThresholdMet = true;
                        stateDragging.hasDragged = true;

                        // adjust initials for not "jumping" the image
                        //UI.initialTranslate.x += deltaMouse.x; // deltaMouse.x / state.transform.scale; // ???
                        //UI.initialTranslate.y += deltaMouse.y; // deltaMouse.y / state.transform.scale; // ???
                        UI.initialTranslate.x += deltaMouse.x / state.transform.scale; // deltaMouse.x / state.transform.scale; // ???
                        UI.initialTranslate.y += deltaMouse.y / state.transform.scale; // deltaMouse.x / state.transform.scale; // ???
                        // Also reset the startX/startY to the current mouse position
                        // all subsequent dx and dy calculations will be relative to
                        // this new, corrected starting point.
                        stateDragging.startX = e.offsetX;
                        stateDragging.startY = e.offsetY;
                    }

                    // apply DRAG/PAN mouse resolution,
                    // e.g. DRAG_RESOLUTION = 20 means 1px mouse = 20px translation
                    const newTranslate = {
                        //x: UI.stateTransform.translateX + stateDragging.RESOLUTION * deltaMouse.x,
                        //y: UI.stateTransform.translateY + stateDragging.RESOLUTION * deltaMouse.y
                        x: UI.initialTranslate.x + stateDragging.RESOLUTION * deltaMouse.x,
                        y: UI.initialTranslate.y + stateDragging.RESOLUTION * deltaMouse.y
                    };

                    UI.handleMouseMoveLogic(newTranslate, UI.stateTransform, UI.transformDims, debug);

                    animationFrameId = null; // Reset for the next frame
                });
            }
        }        
        else { // without animationFrame LOOP
            // check DRAG_THRESHOLD detection to trigger the move
            const mouse = UI.getMouseCoordinate(e);
            const stateDragging = UI.stateDragging; // global dragging state
            const dx = mouse.x - stateDragging.startX; // e.offsetX || e.clientX
            const dy = mouse.y - stateDragging.startY; // e.offsetX || e.clientX

            if (Math.abs(dx) > stateDragging.THRESHOLD
                || Math.abs(dy) > UI.stateDragging.THRESHOLD) {
                stateDragging.dragThresholdMet = true;
                stateDragging.hasDragged = true;

                // no adjust for not jumping
            }

            // apply DRAG/PAN mouse resolution,
            // e.g. DRAG_RESOLUTION = 20 means 1px mouse = 20px translation
            const newTranslate = {
                x: UI.stateTransform.translateX + stateDragging.RESOLUTION * dx,
                y: UI.stateTransform.translateY + stateDragging.RESOLUTION * dy
            };

            UI.handleMouseMoveLogic(newTranslate, UI.stateTransform, UI.transformDims, debug);
        }
    };


    static handleMouseUp = (e) => {
        /*
        if (!UI.stateDragging.isDragging)
             return;
        */
        if (UI.stateDragging.isDragging) {
            if (!UI.stateDragging.dragThresholdMet) {
                // It was a click, not a drag. Perform zoom toggle.
                // E.g., modalImage.dispatchEvent(new CustomEvent('imageclick', { detail: { x: e.clientX, y: e.clientY } }));
            }
        }

        // stopping the drag and cleaning up the listeners, as the drag is over
        UI.stateDragging.isDragging = false;

        // dont set this, as then the 'mouseup' event is treated a 'click' event
        // and will trigger autZoom Toogle after one drag
        // we set dragThresholdMet = false;
        // in the handleClickEvent() later
        //*** UI.stateDragging.dragThresholdMet = false;


        // reset the mouse cursor
        //const modalImage = e.target.closest('.modal-media');
        //UI.updateModalCursor(modalImage);

        // dynamically remove unneeded event handler
        if (UI.stateDragging.useWindowsEventHandlers) {
            window.removeEventListener('mousemove', UI.handleMouseMove);
            window.removeEventListener('mouseup', UI.handleMouseUp);
            window.removeEventListener('mouseleave', UI.handleMouseUp);
        }
        else {
            modalImage.removeEventListener('mousemove', UI.handleMouseMove);
            modalImage.removeEventListener('mouseup', UI.handleMouseUp);
            modalImage.removeEventListener('mouseleave', UI.handleMouseUp);
        }
    };

    // this click-event is handled via global event delegation
    /*
    static handleClick = (e) => {
        const modalImage = e.target.closest('.modal-media');
        if (!modalImage) return;

        if (UI.stateDragging.hasDragged) {
            // prevent autoZoom() toogle and resetZoomAndPan()
            e.preventDefault();
            e.stopPropagation();
            UI.stateDragging.hasDragged = false;

            return;
        }

        UI.autoZoom(modalImage, e);
    };
    */

    // END PANNING EVENT HANDLERS

    // shared helpers between const (local) 'handleMouseXXX' and
    // static (global) 'handleMouseXXX' event handlers

    // aka handleImagePan(...)
    static handleMouseMoveLogic(newTranslate, stateTransform = UI.stateTransform, imageDims = UI.transformDims, debug = false) {
        //if (!UI.stateDragging.isDragging) return;

        // for now mapping from "old" global dicts, used only by global 'mouse' handlers
        const scale = stateTransform.scale; // state.transform.scale
        const modalImage = stateTransform.image; // state.transform.image
        const modalContainer = stateTransform.container; // state.transform.container

        // v12 - implement renderer.ts
        const res_12 = UI.handleMouseMoveLogic_v12(scale, newTranslate, imageDims, modalImage, modalContainer, debug);

        if (debug)
            console.debug("handleMouseMoveLogic_v12\n", UI.formatJSON(res_12));
    }

    static getMouseCoordinate(e, coordinatesMethod = state.pan.coordinatesMethod) {
        if(!e) return { x: null, y: null };

        const x = (coordinatesMethod === 'offset')
            ? e.offsetX : e.clientX; // 'client'
        const y = (coordinatesMethod === 'offset')
            ? e.offsetY : e.clientY; // 'client'

        return { x: x, y: y };
    }

    /* - deprecated, use new DOMMatrix for that
    static createTransformMatrix(scale, translateX, translateY) {
        // return a 2D-matrix(a, b, c, d, e, f)
        return `matrix(${scale}, 0, 0, ${scale}, ${translateX}, ${translateY})`;
    }
    */

    static createTransformMatrix(scale, translateX, translateY) {
        // A 2D-matrix is represented as matrix(a, b, c, d, e, f)
        // a, d are scaleX, scaleY
        // e, f are translateX, translateY
        // Assuming uniform scaling (scaleX = scaleY)
        return new DOMMatrix([scale, 0, 0, scale, translateX, translateY]);
    }

    static createTransformMatrix3d(scale, translateX, translateY) {
        // A 3D-matrix is represented as matrix3d(a, b, c, d, e, f, g, h, i, j, k, l, m, n, o, p)
        // a, f, k are scaleX, scaleY, scaleZ
        // m, n, o are translateX, translateY, translateZ
        return new DOMMatrix([scale, 0, 0, 0, 0, scale, 0, 0, 0, 0, 1, 0, translateX, translateY, 0, 1]);
    }

    // Clamp function to constrain a value between a minimum and maximum
    static clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }

        // *** BEGIN 2D matrix/dict helpers ***
    // extract x/y dict with optionally mapping custom names
    // from 2D-point x/y matrix/dict
    // can "map" x/y names, but can only extract from x/y values
    //
    // e.g. 2D-point = { x: 300, y: 400 };
    // const { newX, newY } = getDims(point, 'newX', 'newY');
    // newX === 300, newY === 400
    static getDims(point, nameX = 'x', nameY = 'y') {
        // use [] syntax, to get the "computed" name instead of the static literals nameX/nameY
        return { [nameX]: point.x, [nameY]: point.y };
    }

    // extract x/y dict with optionally mapping custom names and custom values
    // from 2D-point x/y or a/b matrix/dict
    // can "map" x/y names, AND also can extract from "mapped" x/y values
    //
    // e.g. 2D-point = { dx: 50, dy: 40 };
    // const { deltaX, deltaY } = getDimsEx(point, 'deltaX', 'deltaY', 'dx'. 'dy');
    // deltaX === 50, deltaY === 40
    static getDimsEx(point, nameX = 'x', nameY = 'y', valueX = 'x', valueY = 'y') {
        // use [] syntax, to get the "computed" name and value instead of the static literals nameX/nameY and valueX/valueY
        return { [nameX]: point[valueX], [nameY]: point[valueY] };
    }

    // TODO: need similar functions to ADD or MULTIPLE 2 2D-points
    // *** END 2D matrix/dict helpers ***

    // new v12 (RL) - implement 'renderer.ts' ;-)
    static handleMouseMoveLogic_v12(scale, newTranslate, imageDims, modalImage, modalContainer = modalImage.parentElement) {
        //if (!UI.stateDragging.isDragging) return;

        // newTranslate has the shifted coordinates since the last mousemove
        // they are already calculated by the dx/dy between
        // current mouseCoordinates from the startX/startY
        // added to the last translateX/translateY
        //const newX = newTranslate.x;
        //const newY = newTranslate.y;
        const {newX, newY} = UI.getDims(newTranslate, 'newX', 'newY'); // default nameX='x', nameY='y'

        // BEGIN 'renderer.ts' - clampedTranslate()
        // needs: scale and originX/originY
        // get it originally from 'state.transform'
        // now gets them from 'UI.stateTransform'

        //const scale = state.transform.scale;
        
        // // get the cached values from handleMouseDown()
        // const hasOriginOffset = UI.stateTransform.hasOriginOffset;
        // const originX = UI.stateTransform.originX;
        // const originY = UI.stateTransform.originY;

        // *** BEGIN - moved to UI.precalculateImageDimension()
        // or now to he new UI.getScalePrecalcs(scale, dims, ...) function
        // // Get the container and image dimensions for clamping
        // const containerWidth = modalContainer.offsetWidth;
        // const containerHeight = modalContainer.offsetHeight;
        // const imageWidth = modalImage.offsetWidth;
        // const imageHeight = modalImage.offsetHeight;
        // // what is contraining (the image or the container?)
        // //const bounds = modalContainer.getBoundingClientRect();
        // const bounds = modalImage.getBoundingClientRect();

        // // get scaled width from bounds (and not calculate it yourself from currentScale)
        // const imageScaledWidth = bounds.width;
        // const imageScaledHeight = bounds.height;

        // // default assumption is always a 'centered' scale/zoom
        // const defaultOriginX = imageWidth / 2; // 'center' aka 50%
        // const defaultOriginY = imageHeight / 2; // 'center' aka 50%

        //  // let it also work with a centered zoom
        // let originOffsetX = 0;
        // let originOffsetY = 0;
        // if (hasOriginOffset) {
        //     // IMPORTANT - calculate the origin offset
        //     // of the zoom point from the default center point
        //     originOffsetX = (originX - defaultOriginX) * (scale - 1);
        //     originOffsetY = (originY - defaultOriginY) * (scale - 1);
        // }

        // // IMPORTANT - account for negative deltas between (scaled) boundedImage and container sizes
        // const rangeX = Math.max(0, Math.round(imageScaledWidth) - containerWidth);
        // const rangeY = Math.max(0, Math.round(imageScaledHeight) - containerHeight);

        // const maxX = Math.round(rangeX / 2);
        // const maxY = Math.round(rangeY / 2);
        // const minX = (0 - maxX);
        // const minY = (0 - maxY);
        // *** END - moved to UI.getScalePrecalcs()

        // load precalculated imageDims from handleMouseDown()
        const minX = imageDims.minX;
        const minY = imageDims.minY;
        const maxX = imageDims.maxX;
        const maxY = imageDims.maxY;

        const originOffsetX = imageDims.originOffsetX;
        const originOffsetY = imageDims.originOffsetY;

        const clampedX = UI.clamp(newX, minX + originOffsetX, maxX + originOffsetX);
        const clampedY = UI.clamp(newY, minY + originOffsetY, maxY + originOffsetY);

        // END 'renderer.ts'

        // ????? CHECK if that is true and depends on 3D-Matrix
        let newScaledTranslateX = (clampedX / ((state.pan.divideTranslationsByScale) ? scale : 1));
        let newScaledTranslateY = (clampedY / ((state.pan.divideTranslationsByScale) ? scale : 1));

        // Apply the clamped translation and the existing scale
        //const newTransform = `scale(${scale}) translate(${newTranslateX}px, ${newTranslateY}px)`;
        // Force GPU acceleration: 
        // Use transform: translate3d() instead of transform: translate().
        // This "tricks" the browser into moving the image rendering to the GPU,
        // which is much faster for simple transform operations. 

        /*
            Browsers can sometimes perform subpixel rounding when rendering with translate3d(),
            especially with decimal values, which can cause visual artifacts like blurring.
            To avoid this, and to ensure consistent calculations,
            we should round pur final clamped x and y values before applying the transform. 

        */
        const newTranslateX = Math.round(newScaledTranslateX); // clampedX);
        const newTranslateY = Math.round(newScaledTranslateY); // clampedY);

        let newTransform = "";

        // if (state.pan.useTranslate3D)
        //     newTransform = `scale(${scale}) translate3d(${newTranslateX}px, ${newTranslateY}px, 0)`;
        // else
        //     newTransform = `scale(${scale}) translate(${newTranslateX}px, ${newTranslateY}px)`;

        const newTransformMatrix = (state.pan.useTranslate3D) // force GPU-acceleration ??
            ? UI.createTransformMatrix3d(scale, newTranslateX, newTranslateY)
            : UI.createTransformMatrix(scale, newTranslateX, newTranslateY);

        newTransform = newTransformMatrix.toString();

        modalImage.style.transform = newTransform; // apply new transform

        //DEBUGPAN ?????

        const res_12 = {
            version: "v12_RL",
            coordinatesMethod: `'${state.pan.coordinatesMethod}' for mouse events, '${state.pan.coordinatesMethod}' for autoZoom`,
            newX: newX,
            newY: newY,

            scale: scale,
            hasOriginOffset: state.transform.hasOriginOffset,
            originX: state.transform.originX,
            originY: state.transform.originY,
            transformOrigin: state.transform.transformOrigin, // only debugging

            //containerWidth: modalContainer.offsetWidth,
            //containerHeight: modalContainer.offsetHeight,
            //imageWidth: modalImage.offsetWidth,
            //imageHeight: modalImage.offsetHeight,

            //bounds_image: modalImage.getBoundingClientRect,
            //bounds_container: modalContainer.getBoundingClientRect(), // debug only, not needed for calculation
            //imageScaledWidth: modalImage.getBoundingClientRect().width,
            //imageScaledHeight: modalImage.getBoundingClientRect().height,

            //defaultOriginX: defaultOriginX, // modalImage.offsetWidth / 2
            //defaultOriginY: defaultOriginY, // modalImage.offsetHeight / 2
            originOffsetX: originOffsetX,
            originOffsetY: originOffsetY,

            rangeX: maxX * 2,
            rangeY: maxY * 2,
            minX: minX,
            minY: minY,
            maxX: maxX,
            maxY: maxY,

            clampedX: clampedX,
            clampedY: clampedY,

            newTranslateX: newTranslateX,
            newTranslateY: newTranslateY,

            newTransform: newTransform,
            //transform_style: modalImage.style.transform,
            //transform_computed: window.getComputedStyle(modalImage).transform
        }

        return res_12;

        /* EXAMPLE result with Testimage 'DRAGGING-ISSUE Test-Image 381746.jpeg'

        handleMouseMoveLogic_v12
        {
            "version": "v12_RL",
            "coordinatesMethod": "'offset' for mouse events, 'offset' for autoZoom",
            "DRAG_THRESHOLD": 5,
            "startX": 407,
            "startY": 300,
            "x": 368,
            "y": 301,
            "dx": -39,
            "dy": 1,
            "newX": -288,
            "newY": 2,
            "scale": 3,
            "hasOriginOffset": true,
            "originX": 300,
            "originY": 280,
            "transformOrigin": "300px 280px",
            "containerWidth": 462,
            "containerHeight": 638,
            "imageWidth": 434,
            "imageHeight": 638,
            "bounds_image": {
                "x": -783.140625,
                "y": -538,
                "width": 1302.796875,
                "height": 1914,
                "top": -538,
                "right": 519.65625,
                "bottom": 1376,
                "left": -783.140625
            },
            "bounds_container": {
                "x": 57.796875,
                "y": 20,
                "width": 462.3984375,
                "height": 638,
                "top": 20,
                "right": 520.1953125,
                "bottom": 658,
                "left": 57.796875
            },
            "imageScaledWidth": 1302.796875,
            "imageScaledHeight": 1914,
            "defaultOriginX": 217,
            "defaultOriginY": 319,
            "originOffsetX": 166,
            "originOffsetY": -78,
            "rangeX": 841,
            "rangeY": 1276,
            "maxX": 421,
            "maxY": 638,
            "minX": -421,
            "minY": -638,
            "clampedX": -255,
            "clampedY": 2,
            "newTranslateX": -255,
            "newTranslateY": 2,
            "newTransform": "matrix(3, 0, 0, 3, -255, 2)",
            "transform_style": "matrix(3, 0, 0, 3, -255, 2)",
            "transform_computed": "matrix(3, 0, 0, 3, -255, 2)"
        }
        */
    }

    static getScalePrecalcs(scale, dims = null, modalImage, modalContainer, debug = false) {
        /*
            When a 'dims' dict is already passed in (!null), then it is used
            for the 'DEFAULT_TRANSFORM_SCALE_PRECALC' and *NOT* be calculated again.
            It is then only "passed-thru" without any changes to it

            Pass dims = null (default) for initial calc and during 'resize' events

            Currently we always return back 2 dicts as tuples:

            { dims, transformScalePrecalc }

            - when 'dims' param is null, an instance of 'this.DEFAULT_STATE.dims'
                will be filled with precalcs.
                
                From this only the 'state.dims.scalePrecalc' sub-dict is needed
                It will also contain the passed 'scale' param in the 'usedScaleForPrecalc' property.
                This is used on sub-sequent calls and controls
                if the second return value 'transformScalePrecalc' returns:
                    'null' (nothing has changed, same scale as already calculated before)
                    'changed' originOffsetX/Y values
                
                'state.dims.image' and 'state.dims.container' are
                only used and filled with intermediate calc-steps and can
                be used for reference/debugging.
                
                This "dims" dict only needs to get updated initially and on "resize" events,
                and is INDEPENDENT of the current scale (zoom) factor!!!

            - an instance of 'this.DEFAULT_TRANSFORM_SCALE_PRECALC' with
                4 values for recalculated 'state.transform' "merge/update":
                    - hasOriginOffset
                    - transformOrigin
                    - originX
                    - originY
                
                This needs to be updated on *ANY* scale (zoom) updates


            SUMMARY:
            // 'initial' call, or a 'resize' event occured
            // 'resize' the UI changes the 'image' and 'container' dims and
            // everything needs to be recalculated, even if 'scale' did not change
            // same call as an 'initial' call during 'mousedown' event:

            // 'initial' call during a 'resize' or 'mousedown' event
            scale = state.transform.scale; // e.g. 3
            dims = null;
            const { dims, transformScalePrecalc }
                = this.getScalePrecalcs(scale, dims)
            // *** integrate updated (re-)calculated values into our state

            // 'dims' are new calculated (passed as 'null'),
            // including the important 'dims.scalePrecalc' sub-dict
            state.dims = dims; // update the (empty) state.dims with the (pre-)calculated 'dims'

            // 'dims.scalePrecalc.usedScaleForPrecalc' === scale
            // gets updated for sub-sequent call optimizations

            // 'transformScalePrecalc' dict is new calculated,
            // ready to be "merged/updated" back into state.transform
            // following 4 values need to be updated:
            state.transform.hasOriginOffset = transformScalePrecalc.hasOriginOffset;
            state.transform.transformOrigin = transformScalePrecalc.transformOrigin;
            state.transform.originX = transformScalePrecalc.originX;
            state.transform.originY = transformScalePrecalc.originY;


            // sub-sequent calls (during a possible change of 'scale')
            scale = state.transform.scale; // e.g. 3
            dims = state.dims;
            const { dims, transformScalePrecalc}
                = this.getScalePrecalcs(scale, dims)
            
            // 'dims' are 'path-thru' without (re-)calculation,
            // because (scale === dims.scalePrecalc.usedScaleForPrecalc)

            transformScalePrecalc === null,
            no need to "merge/update any values into state.transform,
            it was already updated from 'mousedown' event handler

            When called with 'scale' = 5
            'dims' pass-thru unchanged, but 
            transformScalePrecalc dict was (re-)calculated with new scale=5,
            // because (scale != dims.scalePrecalc.usedScaleForPrecalc)


            Using existing TEMPLATES ensures, we get some "schema"-validation,
            and will error-out, if these TEMPLATES uses a different schema later!
        */

        // *** BEGIN calculations
        if (!dims) {
            // start from empty STATE_TEMPLATE for image and container
            dims = structuredClone(this.DEFAULT_STATE.dims);

            // Get the container and image dimensions for clamping
            //const containerWidth = modalContainer.offsetHeight;
            dims.container.width = modalContainer.offsetWidth;
            //const containerHeight = modalContainer.offsetHeight;
            dims.container.height = modalContainer.offsetHeight;
            //const imageWidth = modalImage.offsetWidth;
            dims.image.width = modalImage.offsetWidth;
            //const imageHeight = modalImage.offsetHeight;
            dims.image.height = modalImage.offsetHeight;
            // what is contraining (the image or the container?)
            //const bounds = modalContainer.getBoundingClientRect();
            const bounds = modalImage.getBoundingClientRect();

            // get scaled width from bounds (and not calculate it yourself from scale!!!)
            //const imageScaledWidth = bounds.width;
            dims.image.scaledWidth = bounds.width;
            //const imageScaledHeight = bounds.height;
            dims.image.scaledHeight = bounds.height;

            // default assumption is always a 'centered' scale/zoom
            //const defaultOriginX = imageWidth / 2; // 'center' aka 50%
            dims.image.defaultOriginX = dims.image.width / 2; // 'center' aka 50%
            //const defaultOriginY = imageHeight / 2; // 'center' aka 50%
            dims.image.defaultOriginY = dims.image.height / 2; // 'center' aka 50%
        }

        /*
            from here on, we consume the 'scale' parameter, to recalc

            *** we only need ro (re-) calculate the following 4 origin values,
            if a scale change happend (initially, or on zoom changes)

            This 'transformScalePrecalc' dict will then be returned,
            and ready to be consumed by 'handleMouseMove())' event handler,
            so they not need to be (re-)calculated on every 'mousemove'.

            These then are "merged/overwritten" into the current 'state.transform' sub-dict
        */
        let transformScalePrecalc = null; // returns like that, if no 'scale' changes detected

        if (!(scale && dims.scalePrecalc.usedScaleForPrecalc
            && scale === dims.scalePrecalc.usedScaleForPrecalc)) {
            // initial preCalc, or 'scale' param changed from last preCalc

            // update usedScaleForPrecalc from current passed 'scale' param
            dims.scalePrecalc.usedScaleForPrecalc = scale;
            
            // in this case originOffsetX/Y needs to be also (re-)calculated
            // init a new transformScalePrecalc dict from TEMPLATE
            transformScalePrecalc = structuredClone(this.DEFAULT_TRANSFORM_SCALE_PRECALC);
            // these 4 values are very important for correct clamping during PAN ops
            let hasOriginOffset = false;
            let originX = 0;
            let originY = 0;
            const transformOrigin = window.getComputedStyle(modalImage).transformOrigin;
            
            //UI.stateTransform.transformOrigin = transformOrigin;
            transformScalePrecalc.transformOrigin = transformOrigin;

            if (transformOrigin === "center center" || transformOrigin === "50% 50%") {
                hasOriginOffset = false;
                //UI.stateTransform.hasOriginOffset = false;
                transformScalePrecalc.hasOriginOffset = false;
            }
            else { // custom originOffset from "pointed" zoom
                hasOriginOffset = true;
                //UI.stateTransform.hasOriginOffset = true;
                transformScalePrecalc.hasOriginOffset = true;
                // get the originX/originY float values (without 'px')
                const originValues = transformOrigin.split(' ').map(parseFloat);
                originX = originValues[0]; // x
                originY = originValues[1]; // y
                //UI.stateTransform.originX = originX;
                transformScalePrecalc.originX = originX;
                //UI.stateTransform.originY = originY;
                transformScalePrecalc.originY = originY;
            }

            // let it also work with a centered zoom (additionally to a "pointed" scale (zoom)
            let originOffsetX = 0;
            let originOffsetY = 0;

            if (hasOriginOffset) {
                // IMPORTANT - calculate the origin offset
                // of the zoom point from the default center point
                originOffsetX = (originX - dims.image.defaultOriginX) * (scale - 1);
                originOffsetY = (originY - dims.image.defaultOriginY) * (scale - 1);
            }
            // update dims.scalePrecalc
            dims.scalePrecalc.originOffsetX = originOffsetX;
            dims.scalePrecalc.originOffsetY = originOffsetY;
            
            // IMPORTANT - account for negative deltas between (scaled) boundedImage and container sizes
            //const rangeX = Math.max(0, Math.round(imageScaledWidth) - containerWidth);
            const rangeX = Math.max(0, Math.round(dims.image.scaledWidth) - dims.container.width);
            //const rangeY = Math.max(0, Math.round(imageScaledHeight) - containerHeight);
            const rangeY = Math.max(0, Math.round(dims.image.scaledHeight) - dims.container.height);

            const maxX = Math.round(rangeX / 2);
            const maxY = Math.round(rangeY / 2);
            const minX = (0 - maxX);
            const minY = (0 - maxY);

            // update state.precalculatedDimension
            dims.scalePrecalc.minX = minX;
            dims.scalePrecalc.minY = minY;
            dims.scalePrecalc.maxX = maxX;
            dims.scalePrecalc.maxY = maxY;
        }

        /*
        const precalculatedImageDimension = {
            originOffsetX: originOffsetX,
            originOffsetY: originOffsetY,

            minX: minX,
            minY: minY,

            maxX: maxX,
            maxY: maxY
        }
        */
        
        if (debug) {
            //console.debug("precalculateImageDimension\n", UI.formatJSON(precalculatedImageDimension));
            console.debug("getScalePrecalcs() - dims\n", UI.formatJSON(dims)); // including scalePrecalc sub-dict
            console.debug("getScalePrecalcs() - transformScalePrecalc\n", UI.formatJSON(transformScalePrecalc));
        }

        //return precalculatedImageDimension;
        return { dims, transformScalePrecalc }; // returing everything with extra info
        // for intermediate calcs for dims.image and dims.container (as reference only, not really needed!)
    }

        static precalculateImageDimension(modalImage, modalContainer, scale, debug = false) {
        // Get the container and image dimensions for clamping
        const containerWidth = modalContainer.offsetWidth;
        const containerHeight = modalContainer.offsetHeight;
        const imageWidth = modalImage.offsetWidth;
        const imageHeight = modalImage.offsetHeight;
        // what is contraining (the image or the container?)
        //const bounds = modalContainer.getBoundingClientRect();
        const bounds = modalImage.getBoundingClientRect();

        // get scaled width from bounds (and not calculate it yourself from scale!!!)
        const imageScaledWidth = bounds.width;
        const imageScaledHeight = bounds.height;

        // default assumption is always a 'centered' scale/zoom
        const defaultOriginX = imageWidth / 2; // 'center' aka 50%
        const defaultOriginY = imageHeight / 2; // 'center' aka 50%


        // cache origin for "mousemove" handler, so it not needs to be (re-calculated)
        let hasOriginOffset = false;
        let originX = 0;
        let originY = 0;
        const transformOrigin = window.getComputedStyle(modalImage).transformOrigin;
        UI.stateTransform.transformOrigin = transformOrigin;
        if (transformOrigin === "center center" || transformOrigin === "50% 50%") {
            hasOriginOffset = false;
            UI.stateTransform.hasOriginOffset = false;
        }
        else { // custom originOffset from "pointed" zoom
            hasOriginOffset = true;
            UI.stateTransform.hasOriginOffset = true;
            // get the originX/originY float values (without 'px')
            const originValues = transformOrigin.split(' ').map(parseFloat);
            originX = originValues[0]; // x
            originY = originValues[1]; // y
            UI.stateTransform.originX = originX;
            UI.stateTransform.originY = originY;
        }

        // let it also work with a centered zoom
        let originOffsetX = 0;
        let originOffsetY = 0;
        if (hasOriginOffset) {
            // IMPORTANT - calculate the origin offset
            // of the zoom point from the default center point
            originOffsetX = (originX - defaultOriginX) * (scale - 1);
            originOffsetY = (originY - defaultOriginY) * (scale - 1);
        }

        // IMPORTANT - account for negative deltas between (scaled) boundedImage and container sizes
        const rangeX = Math.max(0, Math.round(imageScaledWidth) - containerWidth);
        const rangeY = Math.max(0, Math.round(imageScaledHeight) - containerHeight);

        const maxX = Math.round(rangeX / 2);
        const maxY = Math.round(rangeY / 2);
        const minX = (0 - maxX);
        const minY = (0 - maxY);

        const precalculatedDimension = {
            originOffsetX: originOffsetX,
            originOffsetY: originOffsetY,

            minX: minX,
            minY: minY,

            maxX: maxX,
            maxY: maxY
        }
        if (debug)
            console.debug("precalculateImageDimension\n", UI.formatJSON(precalculatedDimension));

        return precalculatedDimension;

    }

    // NOT USED (as not needed anymore) - keep for reference
    /* Helper to get initial image dimensions

        A robust function to calculate the initial image size and offset
 
        v2 - adds { x: initialX, y: initialY}
        v3 - adds debugging info
    */
    static getInitialImageDimensions(modalImage, modalContainer, debug = false) {
        const containerRect = modalContainer.getBoundingClientRect();
        const imageNaturalWidth = modalImage.naturalWidth;
        const imageNaturalHeight = modalImage.naturalHeight;

        let initialWidth, initialHeight, initialX, initialY;
        const containerAspect = containerRect.width / containerRect.height;
        const imageAspect = imageNaturalWidth / imageNaturalHeight;

        if (imageAspect > containerAspect) {
            // Image is wider than container, height is constrained
            initialWidth = containerRect.width;
            initialHeight = initialWidth / imageAspect;
        } else {
            // Image is taller than container, width is constrained
            initialHeight = containerRect.height;
            initialWidth = initialHeight * imageAspect;
        }

        initialX = (containerRect.width - initialWidth) / 2;
        initialY = (containerRect.height - initialHeight) / 2;

        /*
        const res_1 = {
            width: initialWidth,
            height: initialHeight,
        };
        const res_2 = {
            width: initialWidth,
            height: initialHeight,
            x: initialX,
            y: initialY
        };
        */

        const res_3 = {
            containerRectWidth: containerRect.width,
            containerRectHeight: containerRect.height,
            containerAspect: containerAspect,
            imageNaturalWidth: imageNaturalWidth,
            imageNaturalHeight: imageNaturalHeight,
            imageAspect: imageAspect,

            width: initialWidth,
            height: initialHeight,
            x: initialX,
            y: initialY
        };

        if (debug)
            console.debug("getInitialImageDimensions_v3:\n", UI.formatJSON(res_3));

        return res_3;
    }

    // Fast Helper to get translate values
    static getTranslateValues_2d(element, debug = false) {
        const version = 2; // get x/y from 2D-DOMMatrix e/f values
        return this.getTranslateValues(element, version, debug);
    }
    static getTranslateValues_3d(element, debug = false) {
        const version = 3; // get x/y from 3D-DOMMatrix m41/m42 values
        return this.getTranslateValues(element, version, debug);
    }

    //RL - NOT USED
    static setTranslateValues(element, x = 0, y = 0) {
        //const element = document.getElementById('my-element');

        // Get the computed style
        const style = window.getComputedStyle(element);
        const transformValue = style.transform;

        if (transformValue && transformValue !== 'none') {
            // Extract the matrix values
            const matrixMatch = transformValue.match(/matrix.*\((.+)\)/);
            if (matrixMatch) {
                const matrixValues = matrixMatch[1].split(', ').map(Number);
                
                // Set the translation values (the last two values for a 2D matrix) to zero
                matrixValues[4] = x; // (re-)set translateX
                matrixValues[5] = y; // (re-)set translateY

                // Construct the new transform string
                element.style.transform = `matrix(${matrixValues.join(', ')})`;
            }
        }
    }

    // A robust function to parse the current translate values from the transform property.
    static getTranslateValues(element, version = 1, debug = false) {
        const transform = window.getComputedStyle(element).transform;

        //const version = 1; // get x/y from "matrix" [4]/[5] values in transform
        //const version = 2; // get x/y from 2D-DOMMatrix e/f values
        //const version = 3; // get x/y from 3D-DOMMatrix m41/m42 values

        // Check if a transform is present
        if (transform === 'none') {
            const res_0 = {
                computedTransform: transform,
                message: "no transform found, returning defaults",
                x: 0,
                y: 0
            };

            if (debug)
                console.debug("getTranslateValues()\n", UI.formatJSON(res_0));

            // no transform
            return res_0;
        }

        switch (version) { // transform: matrix(3, 0, 0, 3, 42, -1);
            case 1: // get x/y from "matrix" [4]/[5] values in transform
                const matrix = transform.match(/matrix.*\((.+)\)/);
                if (matrix) {
                    const matrixValues = matrix[1].split(', ').map(parseFloat);
                    if (debug) {
                        const res_1 = {
                            version: version,
                            computedTransform: transform,
                            transformMatrix: matrix,
                            transformMatrixLength: matrixValues.length,
                            matrixValues: matrixValues,
                        };
                        console.debug("getTranslateValues(v1)\n", UI.formatJSON(res_1));
                    }

                    if (matrixValues.length === 6) { // matrix(a, b, c, d, tx, ty)
                        if (debug) {
                            const res_1_6 = {
                                "x (matrixValues[4])": matrixValues[4] || 0,
                                "y (matrixValues[5])": matrixValues[5] || 0
                            };
                            console.debug("getTranslateValues(v1) - using 2D values:\n", UI.formatJSON(res_1_6));
                        }

                        return { x: matrixValues[4] || 0, y: matrixValues[5] || 0 };

                    } else if (matrixValues.length === 16) { // matrix3d(a, b, c, d, e, f, g, h, tx, ty, tz, ... )
                        if (debug) {
                            const res_1_12 = {
                                "x (matrixValues[12])": matrixValues[12] || 0,
                                "y (matrixValues[13])": matrixValues[13] || 0
                            };
                            console.debug("getTranslateValues(v1) - using 3D values:\n", UI.formatJSON(res_1_6));
                        }

                        return { x: matrixValues[12] || 0, y: matrixValues[13] || 0 };
                    }
                }

                // no matrix found in transform, returning defazlts
                const res_1_0 = {
                    version: version,
                    computedTransform: transform,
                    message: "no matrix found in transform, returning defaults",
                    x: 0,
                    y: 0
                };
                if (debug)
                    console.debug("getTranslateValues(v1)\n", UI.formatJSON(res_1_0));

                return  res_1_0;

            case 2: // get x/y from 2D-DOMMatrix e/f values
                const matrix2 = new DOMMatrix(transform);

                if (debug) {
                    const res_2 = {
                        version: version,
                        computedTransform: transform,
                        DOMMatrix: matrix2,
                        "x (matrix.e)": matrix2.e || 0,
                        "y (matrix.f)": matrix2.f || 0
                    };
                    console.debug("getTranslateValues(v2) 2D-DOMMatrix e/f)\n", UI.formatJSON(res_2));
                }

                return {
                    x: matrix2.e || 0,
                    y: matrix2.f || 0
                };

            case 23: // get x/y from 2D-DOMMatrix e/f values
                const matrix23 = new DOMMatrix(transform);

                const scaleX = matrix23.a;
                const scaleY = matrix23.d;
                const translateX = matrix23.e / scaleX; // Reverse the scaling
                const translateY = matrix23.f / scaleY; // Reverse the scaling
  
                if (debug) {
                    const res_23 = {
                        version: version,
                        computedTransform: transform,
                        DOMMatrix: matrix23,
                        "x (matrix.e)": matrix23.e || 0,
                        "y (matrix.f)": matrix23.f || 0,
                        "x (matrix.e/matrix.a)": translateX || 0,
                        "x (matrix.f/matrix.d)": translateY || 0,
                    };
                    console.debug("getTranslateValues(v23) 2D-DOMMatrix e/a f/d)\n", UI.formatJSON(res_23));
                }

                return {
                    //x: matrix23.e || 0,
                    //y: matrix23.f || 0,
                    x: translateX || 0,
                    y: translateY || 0,
                };

            case 3: // get x/y from 3D-DOMMatrix m41/m42 values
                const matrix3 = new DOMMatrix(transform);

                if(debug) {
                    const res_3 = {
                        version: version,
                        computedTransform: transform,
                        DOMMatrix: matrix3,
                        "x (matrix.m41)": matrix3.m41 || 0,
                        "y (matrix.m42)": matrix3.m42 || 0
                    };
                    console.debug("getTranslateValues(v3) 3D-DOMMatrix m41/m42\n", UI.formatJSON(res_3));
                }

                return {
                    x: matrix3.m41 || 0,
                    y: matrix3.m42 || 0
                };

            default: // unknown version (only 1-3 supported), returning defaults
                const res_x_0 = {
                    version: version,
                    computedTransform: transform,
                    message: "unknown version (only 1-3 supported), returning defaults",
                    x: 0,
                    y: 0
                };

                return res_x_0;
        }        
    }
    
    // *** END Zoomed Image panning

    // const imageUrl = 'https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/9731fe2e-e32b-48f7-8811-25e20bf18ba8/original=true,quality=100/Fox_girl_107.png';
    static async loadImage(imageUrl) {
        // Load a new image into the app from URL

        try {
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

            let sniffMimeType = true;

            if (sniffMimeType) {
                const mimeType = UI.sniffMimeType(arrayBuffer);

                // Fall back to HTTP Content-Type header if sniffing fails
                const headerType = response.headers.get("Content-Type") || "application/octet-stream";
                const finalType = mimeType !== "application/octet-stream" ? mimeType : headerType;

                // Create File with reliable type
                const file = new File([arrayBuffer], fileName, { type: finalType });
                console.log(`Created File ${fileName} (${finalType}) from ${imageUrl}`);

                return file;
            }
            else { // use my manual version

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
                        alert("The file has no valid header");
                        break;
                }

                // Create a File-like object
                const file = new File([arrayBuffer], fileName, { type: type });
                console.log(`created File ${fileName} (${type}) from ${imageUrl}`);

                // *** this runs fine but does not "trigger" the fileInput processing
                // for security reasons we need to work with DataTransfers
                /*
                    when we use the File object and injects it into our
                    hidden <input type="file"> using a DataTransfer.
                    ⚠️ But this assignment only triggers downstream events,
                    if it happens in the same trusted user-gesture event loop
                    (like a direct click/drop).
                    Once we’ve already done window.open,
                    the browser thinks the rest of your code is "after navigation"
                    and blocks the implicit "file drop simulation".
                    So our code runs, but your app doesn’t "see"
                    the dropped file like it does in loadTestImage()

                    So we don’t actually need to assign to
                        <input type="file"> (fileInput.files = dataTransfer.files).
                    That’s hacky and browser-sensitive.
                    We can just pass the File object directly to UI.processFile,
                    same as we already do in loadTestImage().
                    That keeps behavior consistent
                */

                return file; // don’t force into file-input

                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(file);
                //const fileInput = document.querySelector('input[type="file"]');
                const fileInput = document.getElementById('file-input');

                // drop the Test Image for processing
                fileInput.files = dataTransfer.files;

                return file;
            }
        }
        catch(e) {
            console.error("error: ", e.message);
            alert(e.message);
        }
    }

    // Utility: detect MIME from file signature (magic numbers)
    static sniffMimeType(buffer) {
        if (!(buffer instanceof Uint8Array)) {
            buffer = new Uint8Array(buffer);
        }

        // Need at least 12 bytes for WEBP test
        const sig = buffer.subarray(0, 12);

        // PNG
        if (sig[0] === 0x89 && sig[1] === 0x50 && sig[2] === 0x4E && sig[3] === 0x47) {
            return "image/png";
        }

        // JPEG
        if (sig[0] === 0xFF && sig[1] === 0xD8 && sig[2] === 0xFF) {
            return "image/jpeg";
        }

        // GIF87a / GIF89a
        if (sig[0] === 0x47 && sig[1] === 0x49 && sig[2] === 0x46 && sig[3] === 0x38) {
            return "image/gif";
        }

        // WEBP (RIFF....WEBP)
        if (sig[0] === 0x52 && sig[1] === 0x49 && sig[2] === 0x46 && sig[3] === 0x46 &&
            sig[8] === 0x57 && sig[9] === 0x45 && sig[10] === 0x42 && sig[11] === 0x50) {
            return "image/webp";
        }

        // TODO: could expand with BMP, TIFF, ICO if you want

        return "application/octet-stream"; // default fallback
    }
} // END class UI

// Make UI available globally
window.UI = UI;

// Initialize UI when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    UI.initialize();
});

/* GPT-5 BEGIN Settings */
const DEFAULT_SETTINGS = {
    // #gallery dimension settings
    galleryThumbHeight: 120,    // px used for gallery thumb height
    galleryPopoutScale: 2,      // scale for hover pop-out images
    // the galleryThumbUrl media resolution
    // = galleryThumbHeight * galleryPopoutScale

    // #modal image size conversion settings
    modalDefaultImage: false,   // Default Scaled Image, use as served
    modalOriginal: false,       // Original Image, as first uploaded
    modalImageHeight: 0,        // Image Height (only used when 'Original Image' is NOT checked)
    modalImageQuality: 90,      // Image quality for JPEG (in %)
    modalForcePNG: false,       // Force Original as PNG Image

    // #zoom settings
    zoomPanelEnabled: true, // show +/-/reset buttons (zoom-panel)
    zoomStep: 1,            // zoom step-size scale for in/out increments
    minZoomScale: 0.5,      // 50% minimum zoom scale
    maxZoomScale: 10,       // 1000% maximum zoom scale
    autoZoom: true,         // click-to-zoom (zoom-in/zooms-out with 'autoZoomStep')
    autoZoomStep: 2,        // 200% zoom for better viewing
    autoZoomVersion: 1,
    // 1 = 'autoZoom' in only ONCE with 'autoZoomStep' (and then back to normal)
    // 2 = combine with '#zoom-controls' and allow MULTIPLE autoZoomStep(s) up to 'maxZoomScale'


    // #modalMediaInfo overlay setings
    infoFontSize: 12,           // configurable font size (in px)
    showMediaInfo: true,        // start with Info overlay visible?
    persistInfoOverlay: true,   // keep overlay state across navigation?

    // #enterKey processing settings
    openOriginal: false,
    loadIntoApp: true,
    autoDownload: false,

    // #enterKey download image settings
    downloadImageQuality: 100,  // quality for “Enter” download
    downloadFormat: "png",      // or "jpeg" or "original"

    modalChoice: "modal"        // or "modalEx"
}; // end class UI

// Load existing user settings
let userSettings = loadSettings();

// initialize a global state object as DEEP Copy of this.DEFAULT_STATE
let state = null; // structuredClone(this.DEFAULT_STATE); // global shared UI state
let modal = null; // structuredClone(this.DEFAULT_MODAL); // global shared UI modal

UI.initSettingsPanel = function() { // called when DOM is loaded
    // manually clean "leftovers" with F12 Browser Tool Console:
    //  localStorage.removeItem("settingsConfigured");
    //  localStorage.removeItem("appSettings");
    //  localStorage.removeItem("userSettings");

    // Load existing user settings
    //UI.userSettings = loadSettings(); // done already at module var

    // initialize the settings panel
    const settingsBtn = document.getElementById("settings-btn");

    const settingsPanel = document.getElementById("settings-panel");
    const saveBtn = document.getElementById("save-settings-btn");
    const resetBtn = document.getElementById("reset-settings-btn");

    // wire the button "click" handlers
    settingsBtn.addEventListener("click", () => {
        UI.showSettings();
    });

    saveBtn.addEventListener("click", () => {
        UI.saveUserSettings();
    });

    resetBtn.addEventListener("click", () => {
        if (!confirm("Reset settings to defaults?"))
            return;

        // Clear storage
        localStorage.removeItem("userSettings");
        localStorage.removeItem("settingsConfigured");

        // Reset settings to DEFAULT_SETTINGS
        // auto-save immediately
        saveSettings(DEFAULT_SETTINGS);
        loadSettings(); // re-init the settings UI with the new defaults

        alert("Settings were reset to defaults!");
    });

    // Auto-apply while editing (optional but nice)
    // Add input listeners so you don’t need to hit Save
    // just to preview:
    document.getElementById("setting-galleryThumbHeight")
        .addEventListener("input", e => {
            userSettings.galleryThumbHeight
             = parseInt(e.target.value, 10);
            UI.applySettings(); // live CSS preview setting
    });

    // Show the settings panel only on first run
    if (localStorage.getItem("settingsConfigured") !== 'true') {
        settingsPanel.classList.remove("hidden"); // show panel for initial parameter selection
    }
}

// internal method
function loadSettings(syncOnly = false) {
    // 'syncOnly' param controls, if we just want
    // to "sync" the current settings into the settings panel UI
    // if false (or omitted) we load the settings and then sync the UI with it

    let savedSettings = {};

    if (syncOnly) {
        savedSettings = userSettings; // load current settings
    }
    else { // load the persited userSettings
        // Retrieve the user settings from local storage
        const userSettingsString = localStorage.getItem("userSettings");

        // Parse the settings, or use an empty object if they don't exist
        const savedUserSettings = userSettingsString ? JSON.parse(userSettingsString) : {};

        // Merge the objects. The order is important.
        // The user settings are spread *after* the default settings,
        // ensuring they override any default values for keys 'a' and 'b'.
        savedSettings = {
            ...DEFAULT_SETTINGS,
            ...savedUserSettings
        };

        console.log("Merged userSettings:", savedSettings)
    }

    // *** initialize (or sync) the settings-panel UI

    // gallery dimension fields
    document.getElementById("setting-galleryThumbHeight").value = savedSettings.galleryThumbHeight;
    document.getElementById("setting-galleryPopoutScale").value = savedSettings.galleryPopoutScale;


    // modal image size conversion fields
    document.getElementById("setting-modalDefaultImage").value = savedSettings.modalDefaultImage;
    document.getElementById("setting-modalOriginal").value = savedSettings.modalOriginal;
    document.getElementById("setting-modalImageHeight").value = savedSettings.modalImageHeight;
    document.getElementById("setting-modalImageQuality").value = savedSettings.modalImageQuality;
    document.getElementById("setting-modalForcePNG").value = savedSettings.modalForcePNG;


    // zoom fields
    document.getElementById("setting-zoomPanelEnabled").checked = savedSettings.zoomPanelEnabled;
    document.getElementById("setting-zoomStep").value = savedSettings.zoomStep;
    document.getElementById("setting-minZoomScale").value = savedSettings.minZoomScale;
    document.getElementById("setting-maxZoomScale").value = savedSettings.maxZoomScale;
    document.getElementById("setting-autoZoom").checked = savedSettings.autoZoom;
    document.getElementById("setting-autoZoomStep").value = savedSettings.autoZoomStep;
    // zoom autoZoomVersion (Radio buttons)
    if (savedSettings.autoZoomVersion === 1)
        document.getElementById("autoZoomVersion-1").checked = true;
    else // 2
        document.getElementById("autoZoomVersion-2").checked = true;


    // modalMediaInfo overlay fields
    document.getElementById("setting-infoFontSize").value = savedSettings.infoFontSize;
    document.getElementById("setting-showMediaInfo").checked = savedSettings.showMediaInfo;
    document.getElementById("setting-persistInfoOverlay").checked = savedSettings.persistInfoOverlay;


    // enterKey processing fields
    document.getElementById("setting-openOriginal").checked = savedSettings.openOriginal;
    document.getElementById("setting-loadIntoApp").checked = savedSettings.loadIntoApp;
    document.getElementById("setting-autoDownload").checked = savedSettings.autoDownload;

    // enterKey download image fields
    document.getElementById("setting-downloadImageQuality").value = savedSettings.downloadImageQuality;

    // enterKey downloadFormat (Radio buttons)
    if (savedSettings.downloadFormat === "png")
        document.getElementById("downloadFormat-png").checked = true;
    else if (savedSettings.downloadFormat === "jpeg")
        document.getElementById("downloadFormat-jpeg").checked = true;
    else
        document.getElementById("downloadFormat-original").checked = true;


    // modalChoice (Radio buttons)
    // first time the UI is not initialized with a value for modalChoice
    // the following only would work for syncOnly
    //document.querySelector("input[name='modalChoice']:checked").value = savedSettings.modalChoice;
    // this method works work first initialization AND syncOnly
    if (savedSettings.modalChoice === "modal")
        document.getElementById("modalChoice-modal").checked = true;
    else
        document.getElementById("modalChoice-modalEx").checked = true;

    return savedSettings;
}

// internal method
function saveSettings(userSettings) {
    try { // check for valid JSON data
        const jsonUserSettings = JSON.stringify(userSettings);
        if (userSettings && JSON.parse(jsonUserSettings)) {
            localStorage.setItem("userSettings", jsonUserSettings);
            localStorage.setItem("settingsConfigured", 'true');
        }
    }
    catch(e){};
}

UI.showSettings = function() {
    // sync checkboxes with current settings
    const syncOnly = true;
    loadSettings(syncOnly);

    // show the parameters (modal) panel
    const settingsPanel = document.getElementById("settings-panel");
    settingsPanel.classList.remove("hidden"); // show settings panel
};

UI.closeSettings = function() {
    document.getElementById("settings-panel").classList.add("hidden");
};

UI.saveUserSettings = function() {
    const newUserSettings = {
        // gallery dimension fields
        galleryThumbHeight: parseInt(document.getElementById("setting-galleryThumbHeight").value, 10),
        galleryPopoutScale: parseFloat(document.getElementById("setting-galleryPopoutScale").value),


        // modal image size conversion fields
        modalDefaultImage: document.getElementById("setting-modalDefaultImage").value,
        modalOriginal: document.getElementById("setting-modalOriginal").value,
        modalImageHeight: parseInt(document.getElementById("setting-modalImageHeight").value, 10),
        modalImageQuality: parseInt(document.getElementById("setting-modalImageQuality").value, 10),
        modalForcePNG: document.getElementById("setting-modalForcePNG").value,


        // zoom fields
        zoomPanelEnabled: document.getElementById("setting-zoomPanelEnabled").checked,
        zoomStep: parseFloat(document.getElementById("setting-zoomStep").value),
        minZoomScale: parseFloat(document.getElementById("setting-minZoomScale").value),
        maxZoomScale: parseFloat(document.getElementById("setting-maxZoomScale").value),
        autoZoom: document.getElementById("setting-autoZoom").checked,
        autoZoomStep: parseFloat(document.getElementById("setting-autoZoomStep").value),
        // radio buttons
        autoZoomVersion: parseInt(document.querySelector("input[name='autoZoomVersion']:checked").value, 10),

        // modalMediaInfo fields
        infoFontSize: parseInt(document.getElementById("setting-infoFontSize").value, 10),
        showMediaInfo: document.getElementById("setting-showMediaInfo").checked,
        persistInfoOverlay: document.getElementById("setting-persistInfoOverlay").checked,


        // enterKey processing fields
        openOriginal: document.getElementById("setting-openOriginal").checked,
        loadIntoApp: document.getElementById("setting-loadIntoApp").checked,
        autoDownload: document.getElementById("setting-autoDownload").checked,

        // enterKey download fields
        downloadImageQuality: parseInt(document.getElementById("setting-downloadImageQuality").value, 10),
        // radio buttons
        downloadFormat: document.querySelector("input[name='downloadFormat']:checked").value,

        /* DEBUGGING in Chrome DevTools console
        [...document.querySelectorAll("input[name='modalChoice']")].map(r => `${r.value}: ${r.checked}`)
        should return:
        ['modal: true', 'modalEx: false']

        but it does show this instead:
        ['modalEx: true', 'modalEx: false']

        document.getElementById("modalChoice-media").getAttribute("value")
        'modal'

        document.getElementById("modalChoice-modal").outerHTML
        '<input type="radio" name="modalChoice" value="modal" id="modalChoice-modal">'
        */

        // radio buttons
        modalChoice: document.querySelector("input[name='modalChoice']:checked").value
    };

    // update global userSettings
    userSettings = newUserSettings;
 
    saveSettings(newUserSettings); // calls internal saveSettings()

    UI.applySettings(); // update CSS dynamic var settings (and apply to UI)

    UI.closeSettings();
    console.log("Saved settings: ", newUserSettings);
};

UI.applySettings = function() {
    /* better do this only with CSS vars and dynamic updates
    // 1. Update gallery thumbnail size
    //document.querySelectorAll(".gallery-scroll img, .gallery-scroll video")
    document.querySelectorAll(".gallery-item")
        .forEach(el => {
            el.style.height = userSettings.galleryThumbHeight + "px";
        });
    */

    // 2. Update CSS variables
    
    // for gallery-item height (in "px")
    document.documentElement.style.setProperty("--gallery-thumb-height", userSettings.galleryThumbHeight + "px");
    /* consume in CSS as a dynamic var:
    .gallery-item {
        height: var(--gallery-thumb-height, 120px);
    }
    */

    //  for gallery popout scale (as-is FLOAT)
    document.documentElement.style.setProperty("--gallery-popout-scale", userSettings.galleryPopoutScale);
    /* consume in CSS as a dynamic var:
    .gallery-item:hover {
          transform: translate(-25%, -25%) scale(var(--gallery-popout-scale, 2));
    }
    */

    //  for info font size (in "px")
    document.documentElement.style.setProperty("--info-font-size", userSettings.infoFontSize + "px");
    /* consume in CSS as a dynamic var:
    .modal-media-info {
        font-size: var(--info-font-size, 12px);
    }
    */

    // 3. Overlay state
    // update module var
    modal.mediaInfoVisible = userSettings.showMediaInfo;
    UI.renderInfoOverlay();

    // 4. Modal zoom step — no direct DOM update,
    // but code handling zoom should read from userSettings.zoomStep

    modal = this.initModal(); // resets current modal with updated userSettings
    // then can use 'modal.media.data.hasPositivePrompt', or 'modal.media.data.meta.prompt'
};

/* GPT-5 END Settings */


/* GPT-5 BEGIN Extend 2x Media-Modals */
UI.handleMediaClick = function(event, mediaId, galleryId, galleryIndex) {
  // Default from settings
  let useModalEx = (userSettings.modalChoice === "modalEx");

  // Override if Shift is pressed
  if (event.shiftKey) {
    useModalEx = !useModalEx; // invert choice
  }

  if (useModalEx) {
    modal.version = 'modalEx';
    UI.showMediaModalEx(mediaId, galleryId, galleryIndex);
  } else {
    modal.version = 'modal';
    UI.showMediaModal(mediaId, galleryId, galleryIndex);
  }
};
/* GPT-5 END Extend 2x Media-Modals */

UI.showMediaModal = function(mediaId, galleryId, galleryIndex) {
    // * Lookup the full saved media JSON data

    let media = null;

    // mediaId: e.g. "img-123456789@67554754.jpeg"
    if (window.storedArtefacts && window.storedArtefacts[mediaId]) {
        //media = window.storedArtefacts[mediaId];
        // de-serialize the stored image metadata object
        media = JSON.parse(window.storedArtefacts[mediaId]);
        modal.media = media; // pass media to modal dialog
    }

    /*
        media: { // "img-123456789@67554754.jpeg"
            name, isVideo,
            url: { base, gallery, full },
            state: { transform, dims: { image, container, scalePrecalcs }, pan },
            model: { id, name },
            data: {JSON}
        }
    */

    // media.data, e.g.
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

    modal.currentGalleryId = galleryId;  // unique id (only used to query its gallery-item media (img and video)

    // we want/need the whole context of all images for this gallery
    modal.galleryImages = [...document.querySelectorAll(`#${galleryId} .gallery-item img, #${galleryId} .gallery-item video`)];
    const totalMedia = modal.galleryImages.length;

    // galleryIndex: passed as param from scroll/nav event
    // wrap around image gallery (make sure we are not "out-of-bounds")
    galleryIndex = galleryIndex % totalMedia; // 0-based gallery index
    modal.currentGalleryIndex = galleryIndex; // persist for global scroll/nav handlers

    /*
        We also pass some "indirect" parameters as custom "data-xxx" element attributes,
        not passed here to the function, which are VERY relevant for the image/video!
        e.g. we defined custom image/video attributes in the gallery item:

        <video id="${mediaId}"              "video-987654321@67554754.mp4"
            ...
        <img id="${mediaId}"                "img-123456789@67554754.jpeg"
            src="${mediaGalleryUrl}"        "https://image.civitai.com/.../height=240/67554754.jpeg"
            data-medianame="${mediaName}"   "67554754.jpeg"
            data-url="${img.url}"           "https://image.civitai.com/.../height=1536/67554754.jpeg"
            data-fullurl="${mediaFullUrl}"  "https://image.civitai.com/.../original,quality=100/67554754.png"
            data-modelid="${model.id}"      "123"
            data-modelname="${model.name}"  "WAI-Nsfw-Illustrious-13"
            alt="Model Image example"
            class="gallery-model-image"
            ...

        with "img.url" is the default "base" url from the sample image metadata REST API-call
        which is passed here as "data-url" custom attribute (currently not used)

        all "data-xxx" attributes can be accessed by "element.dataset.xxx" from JS
        all "xxx" names passed are all lowercase ("data-modelid" vs. modelId)

        the other "data-..." attributes however are very important:
        -   "data-fullurl" is the image url shown in the modal (zoom-able)
            it is also used here later to "preload" the next/prev neighbors
            for faster (cached) access

        -   "data-medianame" is the relative media name, e.g. "67554754.jpeg"
        -   "data-modelid" (small 'i') is the civitai modelId for reference with the REST api
        -   "data-modelname" is the modelName this sample media belongs too, e.g. "WAI-Nsfw-Illustrious-13"
    */

    const el = modal.galleryImages[galleryIndex];

    // isVideo is passed here already as last param
    //const isVideo = el.tagName.toLowerCase() === "video";
    // also found as prefix in "el.id", e.g. "video-987654321@67554754.mp4"
    // *** also available from media.isVideo
    isVideo = media.isVideo;

    // get the media name (as defined for the sample image from the default url)
    const mediaName = el.dataset.medianame || el.alt; // prefer the media name

    // get the default base Url (as defined for the sample image) [NOT used currently]
    const baseUrl = el.dataset.url || el.src; // prefer the default size Url
    // *** also available from media.url.base;

    // get the full Url (expanded from the base url of the sample image)
    const fullUrl = el.dataset.fullurl || el.src; // prefer the full size Url
    // *** also available from media.url.full;

    // *** Modal setup - prepare data
    const modalDialog = document.getElementById("media-modal");
    modal.dialog = modalDialog;
    const mediaContainer = document.getElementById("media-container");
    modal.container = mediaContainer;
    const modalImage = document.getElementById("modal-image");
    modal.image = modalImage;
    const modalVideo = document.getElementById("modal-video");
    modal.video = modalVideo;
    const modalSpinner = document.getElementById("modal-spinner");
    modal.spinner = modalSpinner;
    const modalMediaInfo = document.getElementById('modal-media-info');
    modal.mediaInfo = modalMediaInfo;

    // *** Modal setup - prepare state

    // ** prepare zoom state

    // * prepare autoZoom (with [Shift]-Click) Zoom-Out support
    /*
    modalImage.onclick = (e) => {
        UI.autoZoom(modalImage, e);
    };
    */

    // ** reset media state (for both possible existing media files from last modal dialog usage)
    // we had some display issues when we used the "hidden" style
    // for all elements of the modal and solved it with a new "media-hidden" style

    modalImage.classList.add("media-hidden"); // no more add("hidden");
    //modalImage.src = ""; // release image ressource (not needed as we set new '.src' below anyway)

    modalVideo.classList.add("media-hidden"); // no more add("hidden");
    // free-up any existing video resources
    /* stop video playback, and reset and release video resource */
    modalVideo.pause(); // stop playing an existing video
    modalVideo.removeAttribute("src"); // release existing video resource
    modalVideo.load(); // clears and release any
    // existing video buffer and stops network activity

    // ** handle metadata Info overlay panel
    // we need to prepare that even it is not currently shown
    // as the user can flip it with 'Space' key to show

    // * use the full saved image metadata JSON data
    let mediaInfoMetaDataHtml = "";
    if (media.data) { // if we have REST data for media
        if (media.data.hasPositivePrompt && media.data.meta) {
            const meta = media.data.meta; // position to meta node
             // support LoRA references like '<lora:mylora:0.8>' and escape for HTML
             // also prettify stupid prompts, e.g. negative prompt: 'ugly,,bad hands, , , ,'
            const prompt = UI.escapeHTML(MetadataExtractor.trimAllWhitespacesAndCommas(meta.prompt));
            mediaInfoMetaDataHtml += `
                <b>Prompt</b>:&nbsp;<code>${prompt}</code><br>`;

            if (meta.negativePrompt && meta.negativePrompt.length > 0) {
                const negativePrompt = UI.escapeHTML(MetadataExtractor.trimAllWhitespacesAndCommas(meta.negativePrompt));
                mediaInfoMetaDataHtml += `
                    <br><b>Negative prompt</b>:&nbsp;${negativePrompt}<br>`;
            }
            // first copy button for only the prompt (not the negative prompt)
            mediaInfoMetaDataHtml += UI.COPY_BUTTON_HTML;
        }
        else { // no media meta data was found
            mediaInfoMetaDataHtml += "<i>No media metadata was found :-(</i>";
        }

        // if the REST data contains generation metadata
        //if (media.data.hasMeta && media.data.meta) {
        mediaInfoMetaDataHtml += `
            <div class=button-anchor"> <!-- anchor for second copy-btn -->
                <div style="display:none"> <!-- hidden data to copy -->
                    <code>${(media.data.hasMeta && media.data.meta)
                     ? UI.formatJSON(media.data.meta) :
                      UI.formatJSON(media.data)}</code>
                </div>
                <!-- second copy button (at the bottom) for all the generation meta data or - if missing - all media data -->
                ${UI.COPY_BUTTON_HTML.replace('class="copy-btn"', 'class="copy-btn bottom json"')}
            </div>
        `;
    }
    else { // no media data was found
        mediaInfoMetaDataHtml += "<i>No media data was found :-(</i>";
    }

    // * format the wanted Info panel (html) text from it
    const mediaInfoHtml = `
        ${media.model.name}&nbsp;-&nbsp;${(media.isVideo) ? 'Video' : 'Image'}&nbsp;${media.name}&nbsp;[&nbsp;${galleryIndex + 1}&nbsp;of&nbsp;${totalMedia}&nbsp;]<br>
        ${mediaInfoMetaDataHtml}
    `;

    // show the metadata info before loading the new image/video
    // so the user can already read something, while waiting for the data
    UI.initInfoOverlay(mediaInfoHtml);

    /*
        generate our preferred media URL
        CHECK - I think 'mediaUrl' (when passed as param) has the modal "closure" problem??
        and for that we introduced the custom 'data-fullurl' element attribute:

            // get the default base Url (as defined for the sample image) [NOT used currently]
            const baseUrl = el.dataset.url || el.src; // prefer the default size Url
            // *** also available from media.url.base;

            // get the full Url (expanded from the base url of the sample image)
            const fullUrl = el.dataset.fullurl || el.src; // prefer the full size Url
            // *** also available from media.url.full;
    */

    const mediaUrl = media.url.full; // already customized url (but not "full" blown)
    /*
        // original size, userSettings.modalImageQuality, userSettings.modalForcePNG
        const mediaFullUrl = this.buildModalMediaUrl(img.url, isVideo, true); // original
    */

    //const mediaUrl = UI.buildModalMediaUrl(media.base.url, isVideo); // uses all userSettings

    /*
        could also use other custom versions:
    
        as-is jpeg with 80% compression
        url = UI.buildModalMediaUrl(mediaUrl, isVideo, false, 80);
    
        "as-is" jpeg with quality=90% and height=1024
        url = UI.buildModalMediaUrl(mediaUrl, isVideo, false, 90, 1024);
    */
    
    // show spinner (as loading big image/video can take some seconds)
    modalSpinner.classList.remove("media-hidden");
        
    /*
        When setting the image/video src
        always set the visible ('.src') element(s)
        AFTER the onload() / onloadeddata() handlers are attached.

        That avoids flicker and ensures sizing is computed correctly!
    */

    /* Attach handlers before setting '.src' media attribute */
    if (isVideo) { // *** VIDEO displaying
        /* for videos, call modalVideo.load()
            before modalVideo.  play() when switching sources */
        modalVideo.onloadeddata = () => { // after data loaded finished
            modalSpinner.classList.add("media-hidden"); // hide spinner
            modalVideo.classList.remove("media-hidden"); // show video
            UI.applyZoomAndPan(modalVideo, mediaContainer); // modalVideo.parentElement
            modalVideo.play(); // 2nd: play()
        };
        modalVideo.onerror = (error) => {
            modalSpinner.classList.add("media-hidden"); // hide spinner
            console.error(`Failed to load video: ${error}`, mediaUrl);
        };

        modalVideo.src = mediaUrl; // set url to load *after* handlers
        modalVideo.load(); // 1st: load()
    } else { // *** IMAGE dsiplaying
        modalImage.onload = () => { // after loaded
            modalSpinner.classList.add("media-hidden"); // hide spinner
            modalImage.classList.remove("media-hidden"); // show image
            UI.applyZoomAndPan(modalImage, mediaContainer); // modalVideo.parentElement
        };
        modalImage.onerror = (error) => {
            modalSpinner.classList.add("media-hidden"); // hide spinner
            console.error(`Failed to load image: ${error}`, mediaUrl);
            };

        modalImage.src = mediaUrl; // set url to load *after* handlers
    }

    // Prevent background scrolling
    document.body.style.overflow = "hidden";

    // Update modal state
    modalDialog.classList.remove("hidden"); // show modal dialog
    modal.isOpen = true;


    // during the user enjoys the image and Info overlay panel
    // we cache ahead his possible next moves ;-)

    // ** Build preferred modal media URLs for the next/prev neighbours
    // next before prev, as this is the natural navigation flow (left-to-right)
    
    // * build the preferred nextMediaUrl
    if (!(totalMedia > 1)) // only one media, so no neighbors
        return;

    const nextgalleryIndex = (galleryIndex + 1 + totalMedia) % totalMedia; // wrap around
    const nextEl = modal.galleryImages[nextgalleryIndex];
    // get the full Url (as defined for the sample image)
    const nextFullUrl = nextEl.dataset.fullurl || nextEl.src; // prefer the full size Url
    // build our preferred Url version based on user settings
    const nextMediaUrl = UI.buildModalMediaUrl(nextFullUrl, isVideo); // uses all userSettings

    // * build the preferred prevMediaUrl
    const prevgalleryIndex = (galleryIndex - 1 + totalMedia) % totalMedia; // wrap around
    const prevEl = modal.galleryImages[prevgalleryIndex];
    // get the full Url (as defined for the sample image)
    const prevFullUrl = prevEl.dataset.fullurl || prevEl.src; // prefer the full size Url
    // build our preferred Url version based on user settings
    const prevMediaUrl = UI.buildModalMediaUrl(prevFullUrl, isVideo); // uses all userSettings

    const mediaUrls = {
        nextUrl: nextMediaUrl,
        prevUrl: prevMediaUrl       
    };
    
    UI.preloadMediaNeighbors(mediaUrls);
};

UI.closeMediaModal = function() {
    modal.isOpen = false;

    const modalDialog = document.getElementById(`media-modal${modal.elIDPostFix}`);

    if (modalDialog.classList.contains("hidden"))
        return; // modal dialog is already closed

    const modalImage = document.getElementById(`modal-image${modal.elIDPostFix}`);
    const modalVideo = document.getElementById(`modal-video${modal.elIDPostFix}`);

    // note here that we use DIFFERENT "media-hidden" CSS style
    // to prevent display issues
    modalImage.classList.add("media-hidden"); // hide image
    modalVideo.classList.add("media-hidden"); // hide video

    /* release resources and stop playback, reset and release resource */
    modalVideo.pause(); // stop playing a video
    modalVideo.removeAttribute("src"); // release video resource
    modalVideo.load(); // clears and release any buffer and stops network activity

    modalImage.src = ""; // release image resource

    // Update modal state
    // only the top-level modal class uses the "hidden" style
    modalDialog.classList.add("hidden"); // // hide (close) modal dialog

    // Restore background scrolling
    document.body.style.overflow = "";
}

// interesting syntax to call UI2.showMediaModal(mediaId, galleryId, ...)
// and UI2.closeMediaModal
/*
UI2 = {
    showMediaModal(mediaId, galleryId, url, modelId, modelName, index, total, isVideo) {

    },

    closeMediaModal() {

    }
};
*/

UI.navInModal = function(indexStep, e = null) { // +1 or -1
    //e.preventDefault(); // prevent the default 'click' which zoom-in

    if (!(modal.galleryImages.length > 1))
        return;

    modal.currentGalleryIndex = (modal.currentGalleryIndex + indexStep + modal.galleryImages.length) % modal.galleryImages.length; // wrap around
    const el = modal.galleryImages[modal.currentGalleryIndex];
    // el.id = mediaId (custom random generated)

    /* - now the mediaModal dialog get this from mediaId
    const isVideo = el.tagName.toLowerCase() === "video";
    const fullUrl = el.dataset.fullurl || el.src;  // prefer full size
    const modelId = el.dataset.modelid || 0; // fall-back to no modelId (0)
    const modelName = el.dataset.modelname || el.alt; // fall-back to alt image tag

    UI.showMediaModal(el.id, modal.currentGalleryId, fullUrl, modelId, modelName, modal.currentGalleryIndex, modal.galleryImages.length, isVideo);
    */
    UI.showMediaModal(el.id, modal.currentGalleryId, modal.currentGalleryIndex, modal.galleryImages.length);
}

UI.modalPrev = function(e = null) {
    UI.navInModal(-1);
};

UI.modalNext = function(e = null) {
    UI.navInModal(+1);
};
/* GPT-5 END Media-Modal */


/* GPT-5 BEGIN Gallery Pop-Out */
// Put these functions inside your UI object or global scope as you prefer
UI._popoutEl = null;
UI._popoutTimeout = null;

// Create/reuse popout element
UI._ensurePopout = function() {
    if (!this._popoutEl) {
        this._popoutEl = document.createElement('div');
        this._popoutEl.className = 'gallery-popout';
        document.body.appendChild(this._popoutEl);

        // hide on scroll/resize to avoid mis-positioned popouts
        window.addEventListener('scroll', () => this._hidePopout(), { passive: true });
        window.addEventListener('resize', () => this._hidePopout());
    }

    return this._popoutEl;
};

// Public attach helper (call once per gallery)
UI.attachGalleryPopouts = function(galleryId) {
    const gallery = document.getElementById(galleryId);
    if (!gallery)
        return;

    // delegation: listen on gallery root
    gallery.addEventListener('mouseover', (ev) => {
        const wrapper = ev.target.closest('.gallery-item');
        if (!wrapper || !gallery.contains(wrapper))
            return;

        const media = wrapper.querySelector('img,video');
        if (!media)
            return;

        // short delay avoids flicker when moving quickly across thumbnails
        this._popoutTimeout = setTimeout(() => this._showPopout(media), 80);
    });

    /* the following still jumps the Popout
        🔹 Why is 'mousemove' Event handler there?
        That 'mousemove' → positionPopout() handler is only useful,
        if we want the popout to follow the cursor dynamically (like a magnifying glass).
        If we just want a fixed enlargement next to the gallery, then mouseover + mouseleave is enough.
        If we want a "live magnifier", then 'mousemove' makes sense.
        Since our popout looks fine as a fixed enlargement, we can safely remove 'mousemove'. 👍
    */
   /* disabled 'mousemove'
    gallery.addEventListener('mousemove', (ev) => {
        // optional: reposition popout while moving inside same wrapper
        const pop = this._popoutEl;
        if (!pop || !pop.classList.contains('visible'))
            return;

        // keep popout from jumping; we can re-run positioning using bounding rect of the original element
        const orig = gallery.querySelector('.gallery-item:hover img, .gallery-item:hover video') 
            || document.elementFromPoint(ev.clientX, ev.clientY);

        if (orig && (orig.tagName === 'IMG' || orig.tagName === 'VIDEO')) {
            this._positionPopout(orig);
        }
    });
    */

    gallery.addEventListener('mouseout', (ev) => {
        // if leaving wrapper or gallery, clear timers and hide
        clearTimeout(this._popoutTimeout);
        // if relatedTarget is inside same gallery, do nothing
        const related = ev.relatedTarget;

        if (related && gallery.contains(related))
            return;

        this._hidePopout();
    });
};

// Show overlay popout for a given <img> or <video> element
UI._showPopout = function(mediaEl) {
    if (!mediaEl)
        return;

    const pop = this._ensurePopout();
    pop.innerHTML = ''; // clear

    // clone appropriate element (img or video)
    let clone;

    if (mediaEl.tagName.toLowerCase() === 'video') {
        clone = document.createElement('video');
        // use same source if available, do not autoplay
        clone.src = mediaEl.currentSrc || mediaEl.src;
        clone.muted = true;
        clone.playsInline = true;
        clone.preload = 'metadata';
        clone.controls = false;
    } else {
        clone = document.createElement('img');
        clone.src = mediaEl.currentSrc || mediaEl.src;
        clone.alt = mediaEl.alt || '';
    }

    pop.appendChild(clone);

    // compute position/size and show
    this._positionPopout(mediaEl);
    pop.classList.add('visible');
};

// Compute and set overlay position so scaled image fits and doesn't go offscreen
UI._positionPopout = function(mediaEl) {
    const pop = this._ensurePopout();
    const rect = mediaEl.getBoundingClientRect();

    // desired scale
    const scale = 2; // same as your CSS idea
    let w = Math.round(rect.width * scale);
    let h = Math.round(rect.height * scale);

    // cap maximum size to viewport with padding
    const pad = 8;
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    
    if (w > vw - 2*pad) {
        const ratio = (vw - 2*pad) / w;
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
    }

    if (h > vh - 2*pad) {
        const ratio = (vh - 2*pad) / h;
        h = Math.round(h * ratio);
        w = Math.round(w * ratio);
    }

    // compute ideal left/top (center over original)
    let left = Math.round(rect.left + window.scrollX - (w - rect.width) / 2);
    let top  = Math.round(rect.top  + window.scrollY - (h - rect.height) / 2);

    // clamp to viewport
    left = Math.max(window.scrollX + pad, Math.min(left, window.scrollX + vw - w - pad));
    top  = Math.max(window.scrollY + pad, Math.min(top, window.scrollY + vh - h - pad));

    pop.style.left = left + 'px';
    pop.style.top  = top  + 'px';
    pop.style.width  = w + 'px';
    pop.style.height = h + 'px';
};

// Hide overlay
UI._hidePopout = function() {
    clearTimeout(this._popoutTimeout);

    if (!this._popoutEl)
        return;

    this._popoutEl.classList.remove('visible');
};
/* GPT-5 END Gallery Pop-Out */