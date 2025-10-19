class main {
    /* Configurable runtime cache size (in MB)

        ✅ What this gives us:
        - Offline simulation → easy testing (Google DevTools)
        - Runtime cache limit → e.g. 20MB max, oldest items get purged first.
        - Works like a sliding window cache.
    */
    static MAX_RUNTIME_CACHE_MB = 20; // e.g. 20 MB

    async enforceRuntimeCacheLimit() {
        const cache = await caches.open(RUNTIME_CACHE);
        const requests = await cache.keys();

        let totalSize = 0;
        const entries = [];

        for (const request of requests) {
            const response = await cache.match(request);
            if (response) {
            const blob = await response.clone().blob();
            const size = blob.size;
            totalSize += size;
            entries.push({ request, size });
            }
        }

        // If over limit, evict oldest entries until under
        while (totalSize > main.MAX_RUNTIME_CACHE_MB * 1024 * 1024 && entries.length > 0) {
            const entry = entries.shift(); // FIFO → oldest
            await cache.delete(entry.request);
            totalSize -= entry.size;
            console.log(`🗑️ Removed ${entry.request.url} from runtime cache`);
        }
    }

    // needs a local WebServer to work
    static useServiceWorker = false;

}; // END class main

// Make main available globally
window.main = main;

// Initialize main when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    /*
        Register the service worker in index.html

        ✅ What we get:
            - Our app will be installable on Chrome/Edge/Firefox/Android/iOS.
            - If someone adds it to the homescreen, it behaves like a standalone app.
            - Works offline (at least with cached files).
    */

    if (main.useServiceWorker && ("serviceWorker" in navigator)) {
            navigator.serviceWorker.register("js/service-worker.js")
                .then(() => console.log("✅ Service Worker registered"))
                .catch(err => console.error("❌ SW registration failed:", err));
    }
    else { // hide the 'clear-cache-btn'
        const clearCacheBtn = document.getElementById('clear-cache-btn');
        clearCacheBtn.classList.add("hidden");
    }

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

    // TEST/SHOW CASE
    //const file = loadTestImage();  // add a fixed Testcase Image (PNG with ComfyUI workflow)
    
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
        UI.processFile(file);
    }

    function loadTestImage() {
        // add a fixed Testcase Image (PNG with ComfyUI workflow)
        const testImageUrl = 'https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/9731fe2e-e32b-48f7-8811-25e20bf18ba8/original=true,quality=100/Fox_girl_107.png';

        /* for any reason the IIFE version of this code does not work
        // Using an Async IIFE (Immediately Invoked Function Expression)
        (async () => {
            const file = await UI.loadImage(testImageUrl);
            processFile(file); // process it

            return file;
        })();
        */

        UI.loadImage(testImageUrl)
            .then(file => {
            UI.processFile(file); // process it
        })
        .catch(error => {
            console.error("An error occurred:", error);
        });
    }
});