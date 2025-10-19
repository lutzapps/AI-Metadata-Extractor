class MetadataExtractor {
    static InitializeMetadata() {
        // initialize data structures (and clear for this image drop)
        const metadataNew = {
            parameters: {}, // e.g. "prompt", "negative prompt", "CFG scale", etc. (comes from raw.parameters)
            comfyuiWorkflow: null, // validated full JSON WF (comes from raw.workflow)
            comfyuiPromptInputsWorkflow: null, // "reduced JSON WF with 'Inputs" nodes (comes from raw.prompt)
            resolvedModels: null, // enriched models after CivitAI lookups from the extracted Hashes
            raw: {} // extracted EXIF/XMP "parameters", "prompt", "workflow", and other like "Hashes", and the dumps from EXIF/XMP detections
        };
        
        window.storedParameters = {}; // AI parameters (for SAVE)
        window.storedArtefacts = {}; // workflow (for SAVE), hashes (for SAVE), found "galleryIds" array
        window.storedPrompts = {}; // stored prompts (not used right now)
        // do NOT set this empty, as when we downloadIntoApp, we loos the filename
        //window.storedFileName = null; // dropped image filename (with extension)

        return metadataNew;
    }

    static extractMetadata(file) {
        // This function will be implemented in metadata-extractor.js
        // For now, we'll just show a loading message
        const parametersDataDiv = document.getElementById('parameters-data');
        const resourcesDataDiv = document.getElementById('resources-data');
        const modelHashesDataDiv = document.getElementById('model-hashes-data');
        const comfyuiDataDiv = document.getElementById('comfyui-data');
        const rawDataDiv = document.getElementById('raw-data');

        parametersDataDiv.innerHTML = '<p>Extracting AI generation parameters...</p>';
        resourcesDataDiv.innerHTML = '<p>Extracting and resolving used AI models...</p>';
        modelHashesDataDiv.innerHTML = '<p>Generating dictionary of extracted Model Hashes...</p>';
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
            });/*
            .catch(error => {
                UI.showError(`Error extracting metadata: ${error.message}`);
            });*/
    }

    static async extract(file) {
        // initialize data structures (and clear for this image drop)
        const metadata = this.InitializeMetadata();

        const useNewVersion = true;

        try {
            if (useNewVersion) {
                return this.extractMediaMetadata(file, metadata);
            }
            else { //old working code

                if (file.type.startsWith('image/')) {
                    if (file.type === 'image/png') {
                        return await this.extractPNGMetadata_Old(file, metadata);
                    } else if (file.type === 'image/jpeg') {
                        return await this.extractJPEGMetadata_Old(file, metadata);
                    } else if (file.type === 'image/webp') {
                        return await this.extractWEBPMetadata_Old(file, metadata);
                    }
                } else if (file.type.startsWith('video/')) {
                    if (file.type === 'video/webm') {
                        return await this.extractWEBMMetadata_Old(file, metadata);
                    }
                    return await this.extractVideoMetadata_Old(file, metadata);
                }
                
                // If we don't recognize the file type, try to extract what we can
                await this.fallbackTextSearch(file, metadata);

                return metadata;
            }
            
        } catch (error) {
            console.error('Error extracting metadata:', error);
            throw new Error(`Failed to extract metadata: ${error.message}`);
        }
    }

    //NEW Begin
    static async extractGenericMetadata(file, metadata) {
        // Extract basic file information
        metadata.raw.fileName = file.name;
        metadata.raw.fileType = file.type;
        metadata.raw.fileSize = file.size;
        metadata.raw.lastModified = new Date(file.lastModified).toISOString();

        return metadata;
    }


    // *** Unified Metadata Extractor
    // normalize all media formats,
    // so we can always check metadata.raw.parameters for SD prompts or workflows,
    // regardless of whether it’s PNG, JPEG, WEBP, GIF, or video.
    // JPEG, PNG, WEBP all flow through one unified dispatcher.
    // We can drop in improvements (e.g. multi-block XMP) without touching the main app.
    // metadata.raw always has the same fields across formats:
    // For all three formats:
    // metadata.raw.EXIF_fields → structured EXIF fields (objects, all tags), when EXIF exists
    // metadata.raw.EXIF_text → human-readable fallback, string dump of EXIF fields
    // metadata.raw.XMP → merged and concatenated XML XMP blocks/strings
    // metadata.raw.parameters → SD/Comfy params, from whichever chunk contained this info
    static async extractMediaMetadata(file, metadata) {
        const buffer = await file.arrayBuffer();
        const data = buffer; // DataView-friendly

        await this.extractGenericMetadata(file, metadata); // "fileName", "fileType", "fileSize", etc.

        if (file.type.startsWith("image/")) { // *** Image processing ***
            switch (file.type) {
                case "image/png":
                    //await this.parsePNGMetadata(data, metadata); // OLD but worked
                    await MetadataParsers.parsePNGMetadata(data, metadata); // OLD worked, now with new Chunk processing
                    break;

                case "image/jpeg":
                    //await this.extractJPEGMetadata_Old(file, metadata); //REMOVE
                    //await this.parseJPEGAPP1(data, metadata); // OLD but worked
                    await MetadataParsers.extractJPEGMetadata(data, metadata); //NEW
                    break;

                case "image/webp": // 3. WEBP parser (also unified)
                    //await this.parseWebpExifXmp_Old(data, metadata); //REMOVE
                    //await this.parseWebpExifXmp(data, metadata); // OLD but worked
                    await MetadataParsers.parseWEBPMetadata(data, metadata); // NEW

                    break;

                case "image/gif":
                    await MetadataParsers.parseGIFMetadata(data, metadata); // NEW

                    break;

                default:
                    await MetadataParsers.fallbackTextSearch(file, metadata);
            }
        } else if (file.type.startsWith("video/")) { // Video processing ***
            if (file.type === "video/webm") { //TODO - ATM we use file param here and not data
                await MetadataParsers.parseWEBMMetadata (file, metadata);
            }
            else if (file.type === "video/mp4") {
                await MetadataParsers.parseMP4Metadata (file, metadata);
            }
            else { // generic video file (mp4, mpeg, avi, mov, etc.)
                await MetadataParsers.parseVideoMetadata(file, metadata);
            }
        } else { //CHECK If we don't recognize the file type, try to extract what we can
            await MetadataParsers.fallbackTextSearch(file, metadata);
        }

        return metadata;
    }

    static async parseTIFF_Old(buf, offset = 0) {
        const view = new DataView(buf, offset);
        const byteOrderMark = view.getUint16(0, false);
        const littleEndian = byteOrderMark === 0x4949;
        const magic = view.getUint16(2, littleEndian);

        if (magic !== 42)
            throw new Error("Invalid TIFF header");

        const firstIFD = view.getUint32(4, littleEndian);
        const fields = {};

        function readAscii(view, offset, len) {
            return new TextDecoder("latin1").decode(new Uint8Array(view.buffer, offset, len)).replace(/\0+$/, "");
        }

        function readUTF16(view, offset, len) {
            return new TextDecoder("utf-16le").decode(new Uint8Array(view.buffer, offset, len)).replace(/\0+$/, "");
        }

        function readIFD(ifdOffset) {
            const numEntries = view.getUint16(ifdOffset, littleEndian);

            for (let i = 0; i < numEntries; i++) {
                const entryOffset = ifdOffset + 2 + i * 12;
                const tag = view.getUint16(entryOffset, littleEndian);
                const type = view.getUint16(entryOffset + 2, littleEndian);
                const count = view.getUint32(entryOffset + 4, littleEndian);

                let valueOffset = entryOffset + 8;

                if (count * (type === 2 || type === 1 ? 1 : 4) > 4) {
                    valueOffset = view.getUint32(entryOffset + 8, littleEndian) + offset;
                }

                let value;
                if (type === 2) { // ASCII
                    //value = new TextDecoder("latin1").decode(new Uint8Array(view.buffer, valueOffset, count)).replace(/\0+$/, "");
                    value = readAscii(view, valueOffset, count);
                } else if (type === 1) { // BYTE
                    value = new Uint8Array(view.buffer, valueOffset, count);
                } else if (type === 3) { // SHORT
                    value = view.getUint16(valueOffset, littleEndian);
                } else if (type === 4) { // LONG
                    value = view.getUint32(valueOffset, littleEndian);
                } else if (type === 7 && tag === 0x9286) { // UserComment, often UTF-16
                    //value = new TextDecoder("utf-16le").decode(new Uint8Array(view.buffer, valueOffset, count)).replace(/\0+$/, "");
                    value = readUTF16(view, valueOffset, count);
                }

                //TODO - merge this EXIF_TAGS
                if (MetadataExtractor.EXIF_TAGS[tag]) {
                    fields[MetadataExtractor.EXIF_TAGS[tag]] = value;
                } else {
                    fields["Tag_" + tag.toString(16)] = value;
                }
            }
        }

        readIFD(firstIFD);

        return { fields };
    }
    // END GPT-5 BUGGY helpers
    
    // BEGIN GPT-5 NEW helpers (Sept 4th)
    // =========================
    // EXIF/TIFF core utilities
    // =========================

    // BEGIN HELPER functions for EXIF/XMP

    //TODO - merge this with the formatExifData() - commonTags array
    static EXIF_TAGS = {
    // IFD0
    0x010E: "ImageDescription",
    0x010F: "Make",
    0x0110: "CameraModel",
    0x0112: "Orientation",
    0x0131: "Software",
    0x0132: "DateTime",
    0x013B: "Artist",
    0x0213: "YCbCrPositioning",
    0x8769: "ExifIFDPointer",
    0x8825: "GPSInfoIFDPointer",

    // Exif IFD
    0x829A: "ExposureTime",
    0x829D: "FNumber",
    0x8822: "ExposureProgram",
    0x8827: "ISOSpeedRatings",
    0x9000: "ExifVersion",
    0x9003: "DateTimeOriginal",
    0x9004: "DateTimeDigitized",
    0x9101: "ComponentsConfiguration",
    0x9102: "CompressedBitsPerPixel",
    0x9201: "ShutterSpeedValue",
    0x9202: "ApertureValue",
    0x9204: "ExposureBiasValue",
    0x9205: "MaxApertureValue",
    0x9207: "MeteringMode",
    0x9208: "LightSource",
    0x9209: "Flash",
    0x920A: "FocalLength",
    0x927C: "MakerNote",
    0x9286: "UserComment",
    0xA000: "FlashpixVersion",
    0xA001: "ColorSpace",
    0xA002: "PixelXDimension",
    0xA003: "PixelYDimension",
    0xA004: "RelatedSoundFile",
    0xA005: "InteropIFDPointer",
    0xA20E: "FocalPlaneXResolution",
    0xA20F: "FocalPlaneYResolution",
    0xA210: "FocalPlaneResolutionUnit",
    0xA215: "ExposureIndex",
    0xA217: "SensingMethod",
    0xA300: "FileSource",
    0xA301: "SceneType",
    0xA302: "CFAPattern",
    0xA401: "CustomRendered",
    0xA402: "ExposureMode",
    0xA403: "WhiteBalance",
    0xA404: "DigitalZoomRatio",
    0xA405: "FocalLengthIn35mmFilm",
    0xA406: "SceneCaptureType",
    0xA407: "GainControl",
    0xA408: "Contrast",
    0xA409: "Saturation",
    0xA40A: "Sharpness",
    0xA40C: "SubjectDistanceRange",
    0xA432: "LensSpecification",
    0xA433: "LensMake",
    0xA434: "LensModel",
    0xA435: "LensSerial",

    // Windows XP* stored as UCS-2 in BYTE array
    0x9C9B: "XPTitle",
    0x9C9C: "XPComment",
    0x9C9D: "XPAuthor",
    0x9C9E: "XPKeywords",
    0x9C9F: "XPSubject",

    // GPS IFD
    0x0000: "GPSVersionID",
    0x0001: "GPSLatitudeRef",
    0x0002: "GPSLatitude",
    0x0003: "GPSLongitudeRef",
    0x0004: "GPSLongitude",
    0x0005: "GPSAltitudeRef",
    0x0006: "GPSAltitude",
    0x0007: "GPSTimeStamp",
    0x0011: "GPSImgDirection",
    0x0012: "GPSMapDatum",
    0x001D: "GPSDateStamp",
    };

    static decodeASCII(buf) {
        // ASCII with possible trailing NUL
        const u8 = new Uint8Array(buf);
        let end = u8.length;

        while (end > 0 && u8[end - 1] === 0) end--;

        return new TextDecoder("latin1").decode(u8.subarray(0, end));
    }

    /*
    static decodeUTF16LEFromBytes(u8) {
        // strip trailing 0x0000 pair(s)
        let len = u8.length;

        while (len >= 2 && u8[len - 1] === 0x00 && u8[len - 2] === 0x00) len -= 2;

        return new TextDecoder("utf-16le").decode(u8.subarray(0, len));
    }
    */

    /*
    static decodeUserComment(u8) {
        // EXIF UserComment: 8-byte code + data
        // "ASCII\0\0\0", "UNICODE\0", "JIS\0\0\0\0\0"
        if (u8.length < 8)
            return decodeASCII(u8.buffer);
        
        const code = new TextDecoder("latin1").decode(u8.subarray(0, 8)).replace(/\0+$/, "");
        const body = u8.subarray(8);

        switch (code) {
            case "ASCII":
                return this.decodeASCII(body.buffer);

            case "UNICODE":
                return this.decodeUTF16LEFromBytes(body);

            case "JIS":
                // no native JIS decoder in the browser; fall back to latin1
                return this.decodeASCII(body.buffer);

            default:
                // Heuristic: if half the bytes are 0x00 → likely UTF-16LE text
                const zeros = body.filter((b) => b === 0).length;

                if (zeros >= body.length / 4)
                    return this.decodeUTF16LEFromBytes(body);

                return this.decodeASCII(body.buffer);
        }
    }
    */
   // New drop-in for decodeUserComment() Sept 4th 18:00

    // BEGIN new GPT-5 code but not working from Spet 4th

    static rationalToNumber(num, den) {
        if (den === 0)
            return NaN;
            
        return num / den;
    }

    static async parseTIFF2(buffer, tiffStart) {
        const view = new DataView(buffer);
        const order = view.getUint16(tiffStart, false);
        const little = order === 0x4949; // 'II'
        const mark = view.getUint16(tiffStart + 2, little);

        if (mark !== 0x002A)
            throw new Error("Bad TIFF magic");

        const u16 = (off) => view.getUint16(off, little);
        const i16 = (off) => view.getInt16(off, little);
        const u32 = (off) => view.getUint32(off, little);
        const i32 = (off) => view.getInt32(off, little);

        const typeSize = {
            1: 1, // BYTE
            2: 1, // ASCII
            3: 2, // SHORT
            4: 4, // LONG
            5: 8, // RATIONAL (2*LONG)
            7: 1, // UNDEFINED
            9: 4, // SLONG
            10: 8, // SRATIONAL (2*SLONG)
        };

        // BEGIN parseTIFF helper functions
        function readValue(absPtr, type, count) {
            const total = (typeSize[type] || 1) * count;
            // If value fits in the 4-byte field, absPtr points to that inline area.
            // Otherwise, absPtr contains an offset to the data (relative to TIFF start).
            let dataAbs;

            if (total <= 4) {
                dataAbs = absPtr;
            } else {
                const rel = u32(absPtr);
                dataAbs = tiffStart + rel;
            }

            switch (type) {
                case 1: // BYTE
                    if (count === 1)
                        return view.getUint8(dataAbs);

                    return new Uint8Array(buffer, dataAbs, count);

                case 2: // ASCII
                    const u8 = new Uint8Array(buffer, dataAbs, count);

                    return MetadataExtractor.decodeASCII(u8.buffer);
                
                case 3: { // SHORT
                    if (count === 1)
                        return u16(dataAbs);

                    const out = [];

                    for (let i = 0; i < count; i++) out.push(u16(dataAbs + 2 * i));

                    return out;
                }
                case 4: { // LONG
                    if (count === 1)
                        return u32(dataAbs);

                    const out = [];

                    for (let i = 0; i < count; i++) out.push(u32(dataAbs + 4 * i));

                    return out;
                }
                case 5: // RATIONAL
                    const out = [];

                    for (let i = 0; i < count; i++) {
                        const num = u32(dataAbs + 8 * i);
                        const den = u32(dataAbs + 8 * i + 4);
                        out.push([num, den, MetadataExtractor.rationalToNumber(num, den)]);
                    }

                    return count === 1 ? out[0] : out;
                
                case 7: // UNDEFINED
                    return new Uint8Array(buffer, dataAbs, count);
                
                case 9: { // SLONG
                    if (count === 1)
                        return i32(dataAbs);

                    const out = [];

                    for (let i = 0; i < count; i++) out.push(i32(dataAbs + 4 * i));

                    return out;
                }
                case 10: { // SRATIONAL
                    const out = [];

                    for (let i = 0; i < count; i++) {
                        const num = i32(dataAbs + 8 * i);
                        const den = i32(dataAbs + 8 * i + 4);
                        out.push([num, den, MetadataExtractor.rationalToNumber(num, den)]);
                    }

                    return count === 1 ? out[0] : out;
                }
                default:
                    return new Uint8Array(buffer, dataAbs, total);
            }
        }

        function decodeXPString(val) {
            // XP* tags are type BYTE but actually UTF-16LE, NUL-terminated (array)
            if (val instanceof Uint8Array)
                return MetadataExtractor.decodeUTF16LEFromBytes(val);

            if (Array.isArray(val))
                return MetadataExtractor.decodeUTF16LEFromBytes(Uint8Array.from(val));

            return String(val);
        }

        function readIFD(relOffset, fields) {
            const ifdAbs = tiffStart + relOffset;
            const count = u16(ifdAbs);
            const BASE = ifdAbs + 2;

            let nextIFDRel = 0;

            for (let i = 0; i < count; i++) {
                const entry = BASE + i * 12;
                const tag = u16(entry);
                const type = u16(entry + 2);
                const cnt = u32(entry + 4);
                const valPtr = entry + 8;

                const name = MetadataExtractor.EXIF_TAGS[tag] || `Tag_${tag.toString(16)}`;

                let value = readValue(valPtr, type, cnt);

                // Special-cases
                if (tag === 0x9286) {
                    // UserComment
                    const u8 = value instanceof Uint8Array ? value : Uint8Array.from(value);
                    value = MetadataExtractor.decodeUserComment(u8);
                }

                if (tag >= 0x9C9B && tag <= 0x9C9F) {
                    value = decodeXPString(value);
                }

                // RATIONAL cleanup: collapse [num, den, num/den] to numeric (keep tuples? You decide)
                if (Array.isArray(value) && Array.isArray(value[0]) && value[0].length === 3) {
                    // Prefer numeric form if it looks safe
                    const numeric = value.map((x) => x[2]);
                    fields[name] = numeric.length === 1 ? numeric[0] : numeric;
                } else {
                    fields[name] = value;
                }
            }

            nextIFDRel = u32(BASE + count * 12);

            return nextIFDRel;
        }
        // END parseTIFF helper functions

        // BEGIN parseTIFF logic
        const fields = {};
        const firstIFDRel = u32(tiffStart + 4);

        // IFD0
        let nextIFD = readIFD(firstIFDRel, fields);

        // Follow pointers out of IFD0
        if (typeof fields.ExifIFDPointer === "number") {
            try {
                readIFD(fields.ExifIFDPointer, fields);
            } catch (_) {}
        }
        if (typeof fields.GPSInfoIFDPointer === "number") {
            try {
                readIFD(fields.GPSInfoIFDPointer, fields);
            } catch (_) {}
        }
        if (typeof fields.InteropIFDPointer === "number") {
            try {
                readIFD(fields.InteropIFDPointer, fields);
            } catch (_) {}
        }

        // (Optionally) follow IFD1 (thumbnail) — typically not needed
        // if (nextIFD) readIFD(nextIFD, fields);

        return { fields };
        // END parseTIFF logic
    }

    // END HELPER functions for EXIF/XMP


    // =========================
    // JPEG: parse APP1 (EXIF/XMP)
    // =========================

    /*
        The new parseTIFF() reads IFD0 and then deterministically walks ExifIFD / GPSIFD / InteropIFD and
        merges all tags into metadata.raw.EXIF_fields.

        Expanded EXIF_TAGS to cover the common set you mentioned (Artist, Lens*, Model, PixelX/Y, DateTimeOriginal, XP*…),
        and added clean decoding for:
        - UserComment (ASCII/UNICODE/JIS header handling),
        - XP* tags (UTF-16LE “BYTE” array),
        - ASCII strings (NUL-trimmed),
        - RATIONAL/SRATIONAL (exposed as numbers; you can flip to tuples easily).

        JPEG APP1 alignment → the segment length handling is now precise:
        for each marker with payload we read "len = u16(offset)"",
        then "payload = [offset+2, offset+2+len)".

        - For EXIF we "skip the 6-byte Exif\0\0" and pass "tiffStart" into parseTIFF()
        - For XMP we handle:
            - Standard XMP (preamble http://ns.adobe.com/xap/1.0/\0 + XML),
            - “Raw” XMP (just XML),
            - Extended XMP: we assemble chunks by GUID and offset (common >64KB case).

        WebP EXIF → some writers embed "Exif\0\0" in the EXIF chunk, others put the TIFF header directly.
        We check both and adjust "tiffStart" accordingly.
        RIFF alignment (odd sizes) is handled.

        metadata.raw.EXIF_fields → all parsed tags (unified across IFDs).
        metadata.raw.EXIF_text → best-effort human text (UserComment/ImageDescription/XPComment).
        metadata.raw.parameters → set from EXIF text if present, or later from XMP by your existing parseXMPParameters.
    */
    static async parseJPEGAPP1_2(arrayBuffer, metadata) {
        console.debug("parseJPEGAPP1() processing ...");

        //CHECK //TODO simple TEST
        // const utf8TextDecoder = new TextDecoder('utf-8', { fatal: false });
        // let utf8DataString = utf8TextDecoder.decode(arrayBuffer);
        // console.debug("parseJPEGAPP1() - JPEG 'raw' utf8DataString", utf8DataString)
        // metadata.raw['EXIF_raw'] = utf8DataString.substring(0, 2000) + " ...";
        // END of simple TEST

        const useExifReader = false; //disabled 'ExifReader' as we now have better local code for that
        if (useExifReader) {
            // First, try to use ExifReader with the full file for comprehensive EXIF parsing
            try { 
                if (typeof ExifReader !== 'undefined') { // we have a 'ExifReader' object loaded from a CDN
                    // pass the entire file buffer/data for ExifReader (it handles large files efficiently)
                    const exifData = ExifReader.load(arrayBuffer);

                    metadata.raw['EXIF_data'] = exifData;
                    //metadata.raw['EXIF_formatted'] = await this.formatExifData(exifData, metadata);
                    // Prefer UserComment; fall back to ImageDescription / XPComment
                    const sdText =
                        exifStrings.UserComment || // <- almost all times the sdText stays here
                        exifStrings.ImageDescription ||
                        exifStrings.XPComment ||
                        "";

                    metadata.raw["EXIF_text"] = sdText;
                    metadata.raw["parameters"] = sdText;

                    this.extractParsedMetadata("parameters", sdText, metadata);

                }
            } catch (error) {
                console.error('Error parsing EXIF with ExifReader:', error);
                metadata.raw['EXIF'] = `[EXIF parsing failed: ${error.message}]`;
                metadata.raw['EXIF_text'] = "";
            }

            return;
        }

        // BEGIN GPT-5 code
        const view = new DataView(arrayBuffer);
        let offset = 0;

        // SOI
        if (view.getUint16(offset, false) !== 0xFFD8)
            return; // not a JPEG
        
        offset += 2; // skip SOI marker

        const xmpStd = [];
        // Minimal “extended XMP” assembler (same GUID concatenation)
        const xmpExtMap = new Map(); // guid -> { total, chunks: [ {offset, bytes} ] }

        while (offset + 4 <= view.byteLength) {
            if (view.getUint8(offset) !== 0xFF)
                break;

            let marker = view.getUint8(offset + 1);
            offset += 2;

            // Standalone markers (no length)
            if (marker === 0xD8 || marker === 0xD9)
                continue; // SOI/EOI

            if (marker === 0xDA)
                break; // SOS – image data follows

            const segLen = view.getUint16(offset, false);
            const segStart = offset + 2;
            const segEnd = segStart + segLen - 2; // length excludes the 2 length bytes

            if (segEnd > view.byteLength)
                break;

            if (marker === 0xE1 && segLen >= 2) {
                // APP1
                const bytes = new Uint8Array(arrayBuffer, segStart, segLen - 2);

                // EXIF header found ???
                // JPEG APP1 structure = [0xFFE1][length][Exif\0\0][TIFF header …]
                // APP1 segment starts with "Exif\0\0" [0x45 = Asc(69) = 'E', 0x78 = Asc(120) = 'x', 0x69 = Asc(105) = 'i', 0x66 = Asc(102) = 'f']

                if (bytes.length >= 6 &&
                    bytes[0] === 0x45 && bytes[1] === 0x78 && bytes[2] === 0x69 && bytes[3] === 0x66 && bytes[4] === 0x00 && bytes[5] === 0x00) {
                    try {
                        const tiffStart = segStart + 6; // TIFF header


                        // *** parseTIFF is still buggy
                        //const { exifFields } = await this.parseTIFF2(arrayBuffer, tiffStart);

                        // *** try "old" version with parseExifStrings(tiffData)                     
                        const data = arrayBuffer;

                        // So skip the 6-byte "Exif\0\0" marker, then parseExifStrings() works the same as with WEBP.

                        // Skip the Exif header (6 bytes)
                        const tiffData = data.slice(6);

                        // Now reuse the same parser as WEBP
                        const exifFields = this.parseExifStrings(tiffData);




                        await this.processExifFields(exifFields, metadata); // shared between JPEG and WEBP

                    } catch (error) {
                        console.error("JPEG EXIF parse error: ", error);
                        metadata.raw['EXIF'] = `[JPEG EXIF parsing failed: ${error.message}]`;
                    }
                } else {
                    // XMP? (standard preamble or raw XML)
                    const latin = new TextDecoder("latin1").decode(bytes);

                    if (latin.startsWith("http://ns.adobe.com/xap/1.0/")) {
                        // Standard XMP: preamble + NUL + XML
                        const nul = latin.indexOf("\u0000");
                        const xmlStart = nul >= 0 ? nul + 1 : 0;
                        const xml = new TextDecoder("utf-8").decode(bytes.subarray(xmlStart));

                        xmpStd.push(xml);
                    } else if (latin.startsWith("http://ns.adobe.com/xmp/extension/")) {
                        // Extended XMP (XMP Part 3). Layout:
                        // preamble (latin1) + NUL + 32-byte GUID (ascii hex) + 4-byte full length (BE) + 4-byte chunk offset (BE) + chunk bytes
                        let p = latin.indexOf("\u0000");

                        if (p < 0) p = 0; else p += 1;

                        // GUID is 32 ASCII chars
                        const guid = new TextDecoder("latin1").decode(bytes.subarray(p, p + 32));
                        const fullLen = view.getUint32(segStart + (p + 32), false);
                        const chunkOffset = view.getUint32(segStart + (p + 36), false);
                        const chunkDataStart = segStart + (p + 40);
                        const chunkBytes = new Uint8Array(arrayBuffer, chunkDataStart, segEnd - chunkDataStart + 1);

                        if (!xmpExtMap.has(guid)) {
                            xmpExtMap.set(guid, { total: fullLen, chunks: [] });
                        }

                        xmpExtMap.get(guid).chunks.push({ offset: chunkOffset, bytes: chunkBytes });
                    } else {
                        // Sometimes producers put raw XML directly
                        const asUtf8 = new TextDecoder("utf-8", { fatal: false }).decode(bytes);

                        if (asUtf8.includes("<x:xmpmeta"))
                            xmpStd.push(asUtf8);
                    }
                }
            }

            offset = segEnd + 1;
        }

        // Reassemble extended XMP (if any)
        for (const { total, chunks } of xmpExtMap.values()) {
            // sort by offset, concatenate
            chunks.sort((a, b) => a.offset - b.offset);

            let acc = new Uint8Array(total);
            let written = 0;

            for (const c of chunks) {
                acc.set(c.bytes, c.offset);
                written += c.bytes.length;
            }

            // decode to text
            const xml = new TextDecoder("utf-8", { fatal: false }).decode(acc);
            xmpStd.push(xml);
        }

        if (xmpStd.length) {
            const xmpData = xmpStd.join("");
            
            // If we didn’t already set parameters from EXIF, try XMP
            //if (!metadata.raw.parameters)
            //    await this.parseXMPParameters?.(xmpData, metadata);

            // Handle found XMP
            const xmpMetaValue = await this.parseXMPParameters(xmpData, metadata);
            // this has generated raw "XMP_data" and "XML_meta" metadata
            if (xmpMetaValue.len > 0)
                await this.extractParsedMetadata("XMP_meta", xmpMetaValue, metadata);
        }

        return;
    }

    // helper function for Exif (used for JPEG and WEBP)
    static async processExifFields(exifFields, metadata) {
        metadata.raw = metadata.raw || {};
        metadata.raw.EXIF_fields = { ...(metadata.raw.EXIF_fields || {}), ...exifFields };

        //if (Object.keys(exifFields).length > 0) {
            // only store as DEBUG info
            //metadata.raw['EXIF_formatted'] = await this.formatExifData(exifFields, metadata);
            metadata.raw["EXIF_text"] = Object.entries(exifFields).map(([k, v]) => `${k}: ${v}`).join(", ");

            // Harvest SD-ish text
            // Prefer UserComment; fall back to ImageDescription / XPComment
            const sdText = 
                exifFields.UserComment || // <- almost all times the sdText stays here
                exifFields.ImageDescription || 
                exifFields.XPComment || 
                ""; // only map "SD text" from one of the above 3 exifFields

            if (sdText) { // only process if found something
                console.log("EXIF SD text:", sdText);
                metadata.raw["parameters"] ??= sdText;  // only assign if (metadata.raw.parameters === null || metadata.raw.parameters === undefined) 

                await this.extractParsedMetadata("parameters", sdText, metadata);
            }
        //}

        /* original GPT-5 (not show exifFields when no exifText(aka sdText)

        // Harvest SD-ish text
        // Prefer UserComment; fall back to ImageDescription / XPComment
        const exifText =
            exifFields.UserComment || // <- almost all times the exifText stays here
            exifFields.ImageDescription ||
            exifFields.XPComment ||
            "";

        if (exifText) {
            metadata.raw.EXIF_text = exifText;
            metadata.raw.parameters ??= exifText; // only assign if (metadata.raw.parameters === null || metadata.raw.parameters === undefined) 
        }
        
        */

        return;
    }


    // =========================
    // WebP: parse EXIF/XMP chunks
    // =========================

    // metadata.raw.EXIF_fields → all parsed tags (unified across IFDs).
    // metadata.raw.EXIF_text → best-effort human text (UserComment/ImageDescription/XPComment).
    // metadata.raw.parameters → set from EXIF text if present, or later from XMP by your existing parseXMPParameters.
    static async parseWebpExifXmp(arrayBuffer, metadata) {
        const view = new DataView(arrayBuffer);

        console.debug("parseWebpExifXmp() processing ...");

        if (view.byteLength < 12)
            return;

        const riff = view.getUint32(0, false) === 0x52494646; // 'RIFF'
        const webp = view.getUint32(8, false) === 0x57454250; // 'WEBP'
        
        if (!riff || !webp)
            return;

        let offset = 12;

        const len = view.byteLength;
        const xmpParts = [];

        while (offset + 8 <= len) {
            const fourcc =
            String.fromCharCode(
                view.getUint8(offset),
                view.getUint8(offset + 1),
                view.getUint8(offset + 2),
                view.getUint8(offset + 3)
            );

            const size = view.getUint32(offset + 4, true); // RIFF chunk size = LE
            const dataStart = offset + 8;
            const dataEnd = dataStart + size;

            if (dataEnd > len)
                break;

            if (fourcc === "EXIF") {
                // Payload may be "Exif\0\0" + TIFF or directly TIFF header.
                const head0 = view.getUint32(dataStart, false);

                if (head0 === 0x45786966 /* 'Exif' */) {
                    const tiffStart = dataStart + 6; //skip 'Exif0x000x00' header

                    try {
                        const { exifFields } = await this.parseTIFF(arrayBuffer, tiffStart);

                        await this.processExifFields(exifFields, metadata); // shared between JPEG and WEBP

                    } catch (error) {
                        console.error("WEBP EXIF parse error:", error);
                        metadata.raw['EXIF'] = `[WEBP EXIF parse error: ${error.message}]`;
                    }
                } else {
                    // Assume direct TIFF header at dataStart
                    try {
                        const { fields } = parseTIFF(arrayBuffer, dataStart);
                        
                        await this.processExifFields(exifFields, metadata); // shared between JPEG and WEBP

                    } catch (error) {
                        console.error("WEBP EXIF parse error:", error);
                        metadata.raw['EXIF'] = `[WEBP EXIF parse error: ${error.message}]`;
                    }
                }
            } else if (fourcc === "XMP ") {
                try {
                    const xml = new TextDecoder("utf-8", { fatal: false }).decode(
                        new Uint8Array(arrayBuffer, dataStart, size)
                    );

                    xmpParts.push(xml);

                } catch (error) {
                    console.warn("WEBP XMP decode error:", error);
                    metadata.raw['WEBP'] = `[WEBP EXIF decode error: ${error.message}]`;
                }
            }

            // 2-byte alignment padding for RIFF
            offset = dataEnd + (size % 2 === 1 ? 1 : 0);
        }

        if (xmpParts.length) {
            const xmpData = xmpParts.join("");

            // If we didn’t already set parameters from EXIF, try XMP
            //if (!metadata.raw.parameters)
            //    await this.parseXMPParameters?.(xmpData, metadata);

            // Handle found XMP
            const xmpMetaValue = await this.parseXMPParameters(xmpData, metadata);
            // this has generated raw "XMP_data" and "XML_meta" metadata
            if (xmpMetaValue.len > 0)
                await this.extractParsedMetadata("XMP_meta", xmpMetaValue, metadata);
        }
    }
    // END GPT-5 NEW helper (Sept 4th)
    // END new GPT-5 code but not working from Spet 4th


    // --- WEBP Parser (EXIF/XMP chunks) ---
    static async parseWebpExifXmp_Old(data, metadata) {
        const view = new DataView(data);

        console.debug("parseWebpExifXmp_Old() processing ...");

        if (new TextDecoder("ascii").decode(new Uint8Array(data, 0, 4)) !== "RIFF")
            return;

        let offset = 12;
        let exifFields = {};
        let xmpBlocks = [];

        while (offset + 8 <= view.byteLength) {
            const chunkId = new TextDecoder("ascii").decode(new Uint8Array(data, offset, 4));
            const chunkLen = view.getUint32(offset + 4, true);
            const start = offset + 8;
            const end = start + chunkLen;

            if (chunkId === "EXIF") {
                console.debug("'EXIF' chunk found");

                try {
                    const parsed = await this.parseTIFF_Old(data, start);
                    exifFields = { ...exifFields, ...parsed.fields };

                    metadata.raw['EXIF_tiff'] = data; //DEBUG

                    if (Object.keys(exifFields).length > 0) {
                        metadata.raw['EXIF'] = '[EXIF data found in WEBP file - stored in metadata.raw.EXIF_fields]';
                        metadata.raw["EXIF_fields"] = exifFields;
                        //metadata.raw['EXIF_formatted'] = await this.formatExifData(data, metadata);
                        metadata.raw["EXIF_text"] = Object.entries(exifFields).map(([k, v]) => `${k}: ${v}`).join(", ");

                        // Prefer UserComment; fall back to ImageDescription / XPComment
                        const sdText = 
                            exifFields.UserComment || // <- almost all times the sdText stays here
                            exifFields.ImageDescription || 
                            exifFields.XPComment || 
                            metadata.raw.EXIF_text;

                        console.log("WEBP EXIF SD text:", sdText);
                        metadata.raw["parameters"] = sdText;
        
                        await this.extractParsedMetadata("parameters", sdText, metadata);
                    }
                } catch (error) {
                    console.error("WEBP EXIF parse error:", error);
                    metadata.raw['EXIF'] = `[WEBP EXIF parse error: ${error.message}]`;
                }
            } else if (chunkId === "XMP") { // "XMP " ??
                console.debug("'XMP' chunk found");

                xmpBlocks.push(new TextDecoder("utf-8").decode(new Uint8Array(data.slice(start, end))));
            }

            offset = end + (chunkLen % 2);
        }

        if (Object.keys(exifFields).length > 0) {
            metadata.raw.EXIF_fields = exifFields;
            metadata.raw.EXIF_text = Object.entries(exifFields).map(([k, v]) => `${k}: ${v}`).join(", ");
            metadata.raw.parameters =
            exifFields.UserComment || exifFields.ImageDescription || exifFields.XPComment || metadata.raw.EXIF_text;
        }

        // Handle found XMP
        const xmpMetaValue = await this.parseXMPParameters(xmpBlocks.join(""), metadata);
        // this has generated raw "XMP_data" and "XML_meta" metadata
        if (xmpMetaValue.len > 0)
            await this.extractParsedMetadata("XMP_meta", xmpMetaValue, metadata);

        return;
    }

    /*
    So the correct approach is:
        1. Keep the main loop "parsePNGMetadata()") simple
        2. For every text-like chunk, delegate to "parsePNGTextChunk()"
        3. parsePNGTextChunk() returns a { keyword, value } tuple, with decompression support
        4. this { keyword, value } tuples are then processed by "extractParsedMetadata()"

        Supports zTXt and compressed iTXt — native browser support, with fallback to a small zlib inflate (like pako)
        We don’t need to pull in a whole external library like pako if we’re targeting modern browsers.
        Modern JS runtimes already expose a built-in DecompressionStream("deflate") which is exactly what PNG zTXt and iTXt compressed text use (zlib/deflate). So we can stay completely local like with our EXIF parser.

        🔧 What’s new
        - Calls parsePNGTextChunk() for each tEXt, zTXt, iTXt block
        - Correctly separates keyword and value
        - Aggregates parameters/prompt into metadata.raw.parameters and metadata.raw.EXIF_text
        - Collects all text chunks into metadata.raw.PNG_text (so we can debug or inspect everything)
        - Handles XMP chunks properly (joins if split)
        - Still auto-detects and parses workflow JSON if present

        - Stores both original + normalized keyword in metadata.raw.PNG_text → so we never lose the original field
        - Safer workflow handling:
            - If keyword is workflow, it tries to parse JSON immediately
            - Still falls back to scanning parameters text for inline workflow JSON

        So in PNG (and also JPEG/WEBP), we distinguish between:
            "parameters" → full Stable Diffusion generation string (classic A1111 format)

            "prompt" → ComfyUI node inputs JSON (should not be collapsed into parameters).
            "workflow" → full ComfyUI workflow JSON.

        🔑 Improvements
        - Keyword alias mapping:
            - "parameters" (with aliases for "description", "comment", ...) → stored as parameters
            - "prompt" → treated as "reduced" workflow with Inputs Prompts
            - "workflow" (with alias "comfyui") → treated as workflow JSON

            parameters → metadata.raw.parameters and goes thru extractAIGenerationParameters() pipeline
            prompt → metadata.raw.ComfyUI_prompt (array), ready for ComfyUI Inputs/Prompt node parsing
            workflow → validated JSON and stored as workflow JSON via storeComfyUIWorkflow()

            Stable Diffusion “parameters” always land in metadata.raw.parameters
            ComfyUI reduced Node Inputs ("prompt") always land in metadata.raw.ComfyUI_prompt[]
            ComfyUI workflow (workflow) validated and stored in metadata.raw.ComfyUI_workflow

    */
    // --- Shared helpers ---
    static METADATA_KEYWORD_ALIASES = {
        "parameters": "parameters",   // A1111-style prompt & metadata
        "description": "parameters",  // some tools misuse this field
        "comment": "parameters",      // some tools dump prompt here
        "usercomment": "parameters",  // EXIF tag
        "xpcomment": "parameters",    // Windows tag

        "prompt": "prompt",           // ComfyUI reduced Node Inputs JSON

        "workflow": "workflow",       // ComfyUI workflow JSON
        "comfyui": "workflow",        // alias
        "comfyui_json": "workflow"    // alias
    };



    //INT - patch existing extractWEBMMetadata / extractVideoMetadata to also scan for text
    static async extractWEBMMetadataOld(buffer, metadata) {
        //TODO: parse EBML for actual metadata (title, tags, etc.)

        // For AI prompts, fallback to text search in first MB
        await MetadataParsers.fallbackTextSearchFromBuffer(buffer, metadata);
    }

    //INT - patch existing extractWEBMMetadata / extractVideoMetadata to also scan for text
    static async extractVideoMetadataOld(buffer, metadata) {
        // Generic: scan first 1 MB for text
        await MetadataParsers.fallbackTextSearchFromBuffer(buffer, metadata);
    }


    //NEW End

    
    static async extractParsedMetadata(keyword, value, metadata) {
        console.debug(`'${keyword}' keyword found in TextChunk`);
        console.log(`Metadata stored into metadata.raw['${keyword}']`);

        //CHECK if we do this here or in the caller (parser)
        //metadata.raw[keyword] = value; // save the original found data
        
        // Check for specific keywords that contain AI generation parameters
        switch (keyword) {
            case 'parameters': // PNG from PNG image (native here with keywords, value)
            case 'EXIF_text': // JPEG/WEBP
            case 'WEBM_text': // WEBM - from WEBM Video files
            case 'GIF_Comments': // GIF
            case 'Video_text': // Video from Video files (MP4, MOV, AVI, etc.)
            case 'DEFAULT_text': // ALL
            
                // reusable function for PNG/JPEG/WEBP
                value = this.trimAllWhitespacesAndCommas(value);

                this.extractAIGenerationParameters(value, metadata);

                // optional: try workflow JSON if present
                const match = value.match(/workflow["']?\s*:\s*["']?({.*?})/s);
                if (match) {
                    const comfyuiWorkflow = m[1];
                    if (!this.storeComfyUIWorkflow(metadata, comfyuiWorkflow)) {
                        console.warn("Workflow is not valid JSON");
                    }
                }

                break;


            case 'prompt': // PNG from PNG image (native here with keywords, value)
                // typically this is a REDUCED JSON from the "inputs" of the ComfyUI workflow (if a ComfyUI workflow exists)
                // it starts with e.g. "{"114":{"inputs":{???},"class_type":"<NodeClassName>",...,"223":{"inputs":{???},"class_type":...}"
                //
                // see more in extractWFInputsPrompts() function
                //
                // The *whole* ComfyUI workflow is attached with the keyword = "workflow" and not here with the keyword = "prompt"

                // Check if this is actually such a (reduced) "inputs" JSON workflow disguised as a prompt
                let jsonData = value;
                jsonData = this.fixBrokenWFPromptInputs(jsonData); // fixes "NaN" error in "is_changed" workflow property
                const checkedComfyWF = this.getStatusValidComfyUIWorkflowArtefacts(value);

                if (checkedComfyWF.isFullWF) {
                    console.debug("Found FULL ComfyUI workflow in 'prompt' PNGTextChunk");
                    metadata.comfyUIWorkflow = value;

                    return; 
                }

                if (checkedComfyWF.hasValidWFArtefacts) {
                    console.debug("Found reduced JSON workflow 'inputs' data in 'prompt' field, saving it as 'wfInputsPrompts' in the raw metadata");
                    metadata.wfInputsPrompts = jsonData; // "inputs" JSON fragment "{"114":{"inputs":{???},..." as "prompt"
                    metadata.wfInputsPromptsExtracted = this.extractWFInputsPrompts(jsonData, metadata.parameters);
                            
                    return;

                } else if (checkedComfyWF.hasValidJson) {
                    // JSON but not workflow data, store as prompt
                    // metadata.parameters['Prompt'] = value;
                    metadata.parameters['ValidJsonPrompt'] = jsonData; //BUG??
                } else {
                    metadata.parameters['NonValidJsonPrompt'] = jsonData; //BUG??
                }

                break;


            case 'workflow':
            case 'comfyui_json':
                console.debug(`Found ComfyUI '${keyword}' keyword with value:\n`, value);

                // Look for embedded workflow JSON
                const m = value.match(/workflow["']?\s*:\s*["']?({.*?})/s);
                if (m) {
                    const comfyuiWorkflow = m[1];
                    if (!this.storeComfyUIWorkflow(metadata, comfyuiWorkflow)) {
                        console.warn("Workflow JSON invalid in PNG text chunk (parameters)");
                    }
                }

                // Try workflow JSON
                const matchWF = value.match(/^{.*}$/s); // check for "{...}" format
                if (matchWF) {
                    try {
                        if (!this.storeComfyUIWorkflow(metadata, value)) {
                            console.warn("Workflow JSON invalid in PNG text chunk");
                        }
                    } catch (error) {
                        console.warn("Workflow parse failed:", error);
                    }                            
                }
                else
                    console.warn("Workflow is not valid JSON");

                break;


            case 'XMP_meta': // PNG/JPEG/WEBP Image
                // can also look for parent "XMP_data" (we do here further down)

                // Look for common AI generation parameters in XMP data
                // This is a simplified implementation
                const parametersRegex = /<parameters>(.*?)<\/parameters>/s;
                const matchParams = xmpMeta.match(parametersRegex);
                
                if (matchParams) {
                    const parameters = matchParams[1];
                    console.debug("XMP parser found '<parameters/>' section", parameters);

                    this.extractAIGenerationParameters(parameters, metadata);
                }

                // Check for workflow data in XMP - variant 1
                if (xmpData.includes('workflow')) {
                    // Try to extract and parse workflow JSON
                    const workflowRegex = /workflow["']?\s*:\s*["']?({.*?})/s;
                    const workflowMatch = text.match(workflowRegex);
                    if (workflowMatch) {
                        const comfyuiWorkflow = workflowMatch[1];
                        if (!this.storeComfyUIWorkflow(metadata, comfyuiWorkflow))
                            alert("Workflow is not valid JSON");
                    }
                }

                // Look for workflow data in XMP - variant 2
                const workflowRegex = /<workflow>(.*?)<\/workflow>/s;
                const workflowMatch = xmpData.match(workflowRegex);
                if (workflowMatch) {
                    const comfyuiWorkflow = workflowMatch[1];
                    if (!this.storeComfyUIWorkflow(metadata, comfyuiWorkflow))
                        alert("Workflow is not valid JSON");
                }

                //TODO //TEST
                //XMP data from JPEG image ***
                const dataString = metadata.raw["XMP_data"];
                if (dataString) {
                    if (dataString.includes('parameters') || dataString.includes('prompt')) {

                        console.log(`Image metadata processing for '${keyword}' ...`);
                        console.debug(keyword);

                        if(dataString.includes(':NaN')) {
                            const fixedWorkflowText = this.fixBrokenWFPromptInputs(dataString); // fixes "NaN" error in "is_changed" workflow property
                            this.extractAIGenerationParameters(fixedWorkflowText, metadata);
                        }
                        else {
                            console.log("JPEG metadata processing for 'parameters'", dataString);

                            this.extractAIGenerationParameters(dataString, metadata);
                        }
                    }
                }

                break;

                
            default:
                console.warn(`Unexpected data with keyword '${keyword}'\n`, value);
                metadata.raw[keyword] = value; // capture data anyway
        }
    }

    // *** Helper functions
    static trimAllWhitespacesAndCommas(str) {
        // The regular expression /^[\s,]+|[\s,]+$/g explained:
        // ^          - Matches the beginning of the string
        // [\s,]+     - Matches one or more (+) whitespace (\s) or comma (,) characters
        // |          - Acts as an OR operator
        // [\s,]+     - Matches one or more (+) whitespace (\s) or comma (,) characters
        // $          - Matches the end of the string
        // /g         - The global flag, ensuring both the beginning and end are matched

        return str.replace(/^[\s,]+|[\s,]+$/g, '');
    }

    static getStatusValidComfyUIWorkflowArtefacts(jsonString) {
        /**
         * Checks if an object has an 'id' property that is a valid GUID string.
         * @param {object} obj - The object to check.
         * @returns {boolean} - True if the object has a valid GUID 'id', otherwise false.
         */
        function hasValidGuidId(obj) {
            // A regex pattern to validate the standard GUID format (8-4-4-4-12 hex characters)
            // ^ and $: Anchors the expression to the beginning and end of the string to ensure
            // the entire string is a GUID, not just a part of it.
            // [0-9a-f] and /i: Matches hexadecimal characters (0-9 and a-f) case-insensitively.
            // {8}, {4}, {12}: Specifies the number of hexadecimal characters in each group.
            // -: Matches the literal hyphen separators.
            const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

            // 1. Check if the 'id' property exists directly on the object.
            // Object.prototype.hasOwnProperty.call(obj, 'id'):
            // This is a robust way to check if the id property exists directly on the object itself,
            // without checking its prototype chain. This prevents false positives from inherited properties.
            if (obj && Object.prototype.hasOwnProperty.call(obj, 'id')) {
                // 2. Check if the 'id' value is a string and matches the GUID pattern.
                // typeof obj.id === 'string': This check ensures that the value of id is a string.
                // If it were a number, for example, the regex test would be skipped.
                // guidRegex.test(obj.id): The regular expression tests the id string for a valid GUID format.
                // 

                return typeof obj.id === 'string' && guidRegex.test(obj.id);
            }
        }

        let checkedComfyWF = {
            hasValidJson: false,
            hasValidWFArtefacts: false,
            isFullWF: false
        }

        if (!(jsonString && jsonString.length > 100 && (jsonString.startsWith('{') || jsonString.startsWith('['))))
            return checkedComfyWF;

        try {
            const comfyUIWF = JSON.parse(jsonString); // turn JSON string into JS object
            checkedComfyWF.hasValidJson = true;

            // If it parses as JSON and looks like workflow data, treat it as workflow
            if (comfyUIWF && (comfyUIWF.nodes || comfyUIWF.links || Array.isArray(comfyUIWF) ||
                (typeof comfyUIWF === 'object' && Object.keys(comfyUIWF).some(key =>
                    typeof comfyUIWF[key] === 'object' && comfyUIWF[key].class_type)))) {

                    checkedComfyWF.hasValidWFArtefacts = true;
                    // check for FULL ComfyUI workflow - starts with '{"id":'
                    checkedComfyWF.isFullWF = hasValidGuidId(comfyUIWF);
            }
        }
        catch(e) {
            console.error("Failed parsing ComfyUIWorkflowArtefacts", e.message);
        }

        return checkedComfyWF;
    }

    static isValidComfyUIWorkflow(jsonString) {
        const checkedComfyWF = this.getStatusValidComfyUIWorkflowArtefacts(jsonString);

        return checkedComfyWF.isFullWF;
    }

    static hasValidWFArtefacts(jsonString) {
        const checkedComfyWF = this.getStatusValidComfyUIWorkflowArtefacts(jsonString);

        return checkedComfyWF.hasValidWFArtefacts;
    }

    static storeComfyUIWorkflow(metadata, comfyuiWorkflowText) {
        try {
            const fixedWorkflowText = this.fixBrokenWFPromptInputs(comfyuiWorkflowText); // fixes "NaN" error in "is_changed" workflow property

            metadata.comfyuiWorkflow = JSON.parse(fixedWorkflowText);
            console.log("Parsed workflow as JSON:", metadata.comfyuiWorkflow);
            // Extract node types from the workflow
            metadata.comfyuiWorkflowIsValid = true;
            metadata.comfyuiNodeTypes = this.extractComfyUINodeTypes(metadata.comfyuiWorkflow);
            metadata.comfyuiNodesDetailed = this.extractComfyUINodesDetailed(metadata.comfyuiWorkflow);
        } catch (e) {
            console.log("Failed to parse workflow as JSON, storing as raw text:", e);
            // If it's not valid JSON, store as text
            metadata.comfyuiWorkflowIsValid = false;
            metadata.comfyuiWorkflow = fixedWorkflowText;
        }

        return metadata.comfyuiWorkflowIsValid;
    }

    static fixBrokenWFPromptInputs(workflowText) {
        // here we need to check for ":NaN" values and "fix" them with ":false"
        // RL - fix "broken workflows (parts) which cannot be parsed with JSON",
        // e.g. for image "97031318.png"
        // Error extracting metadata: Unexpected token 'N', ..."_changed":NaN},"224""... is not valid JSON

         // "is_changed" is not a boolean, but a ComfyUI signature of a function
        const fixedWorkflowText = workflowText.replaceAll('"is_changed":NaN', '"is_changed":[""]');
        
        return fixedWorkflowText;
    }


    // "parameters" (from EXIF, XMP, tEXt) → parsed as A1111 metadata.
    // "prompt" (ComfyUI reduced Node Inputs) → safely skipped here, handled by your dedicated ComfyUI parser.
    // "workflow" (ComfyUI workflow JSON) → handled by storeComfyUIWorkflow().
    static extractAIGenerationParameters(text, metadata) {
        /* TEST data from file "./Test Images/93890153.jpeg"
        JPEG EXIF SD text:
    lazypos,(1girl, ayase momo, brown_hair, dandadan, loose socks, loose bowtie, pendant earring,
    crossed bangs, pink sweater, coffee shop background, warm sunlight, masterpiece, ultra-detailed ,
    Negative prompt: lazyhands, lazyneg, (painting, sketch, drawing), (blur), (low detail), (deformed),
    loli, child, artist logo, logo, patreon logo, weibo logo, chinese text, shiny skin, bad anatomy, shiny clothes,
    Steps: 30, Sampler: DPM++ 2M SDE Karras, CFG scale: 4.5, Seed: 639466906728691, Size: 1216x832,
    Clip skip: 2, Model hash: BB2C170125, Model: JAN4realish, Version: ComfyUI,
    Civitai resources: [{"modelName":"\u2728 Lazy Embeddings for ALL illustrious NoobAI Pony SDXL models LazyPositive LazyNegative (Positive and Negative plus more!)",
    "versionName":"lazypos v2","weight":1.0,"air":"urn:air:sdxl:embedding:civitai:1302719@1833157"}]
        */

        /* TEST data from file "./Test Images/70432019.png.webp"
        WEBP EXIF SD text:
    <lora:illustriousXL_stabilizer_v1.3:0.8><lora:touching_grass_v0.2:1>
    1girl,fox ears,red hair,white hair,red eyes,multicolored hair,
    lying on grass field,upper body,on side,looking at viewer,shirt,
    long sleeves,smirk,red butterfly,depth of field,flower, 
    Steps: 24, Sampler: Euler a, Schedule type: Automatic, CFG scale: 3.5, 
    Seed: 1, Size: 832x1216, Model hash: a810e710a2, Model: waiNSFWIllustrious_v130, RNG: CPU, 
    Lora hashes: "illustriousXL_stabilizer_v1.3: 499ac92037ea, touching_grass_v0.2: 75cf389d6c6b", 
    Version: f2.0.1v1.10.1-previous-650-ged0dc79a                                    
        */

        // *** BEGIN GPT-5 improvements
        if (!text)
            return;

        // --- NEW: Skip if the text looks like ComfyUI prompt JSON ---
        // ComfyUI "prompt" is JSON (starts with '{' or '[', often has "inputs" or "class_type")
        const trimmed = text.trim();
        if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
            try {
                const obj = JSON.parse(trimmed);
                // Heuristic: detect if it's a ComfyUI prompt JSON
                if (obj && (obj.inputs || obj.class_type || obj["1"])) {
                    console.debug("Skipping extractAIGenerationParameters: looks like ComfyUI prompt JSON");

                    return; // do NOT parse here
                }
            } catch (e) {
                // Not valid JSON → fall through
            }
        }

        // --- continue with normal A1111 parameter parsing ---
        const paramLines = text.split(/\r?\n/);
        let found = false;

        for (const line of paramLines) {
            // look for typical parameter hints
            if (line.includes("Steps:") || line.includes("Sampler:") || line.includes("CFG scale:")) {
                found = true;

                break;
            }
        }

        if (found) {
            metadata.raw["A1111_parameters"] = text;
            // parse into structured fields if you want:
            // Steps, Sampler, Seed, CFG scale, Model hash, etc.
        }
        // *** END GPT-5 improvements

        console.log("=== extractAIGenerationParameters DEBUG ===");
        console.log("Input text length:", text.length);
        console.log("Input text first 200 chars:", text.substring(0, 200));

        //TODO - consolidate this cleaners
        text = this.trimAllWhitespacesAndCommas(text); // trim all leading and trailing blanks and commas
        // RL - // trims leading and trailing commas
        text = this.trimEnclosingCommas(text); //CHECK - mode handling of Commas with blanks between them

        // RL - Clean up extra whitespace from the metadata (and therefore also from all prompts)
        text = text.toString().replace(/\s+/g, ' ').trim();
        // RL - trailing commas and newlines from the metadata
        /* BUG: that changes, e.g.
            "LORA:pony/kenva": "189804f733", "LORA:pony/san_pony_v4": "66512e48ec" to
            "LORA:pony/kenva": "189804f733""LORA:pony/san_pony_v4": "66512e48ec"
        */
        //text = text.replaceAll(', "', '"').replaceAll('\\n', ''); //CHECK
        text = text.replaceAll('\\n', ''); //CHECK
        console.log("extractAIGenerationParameters-Cleaned\n", text); //CHECK

        // Try to parse as JSON first (some tools store "parameters" as JSON)
        try {
            const json = JSON.parse(text);
            //BUG //CHECK metadata.parameters = { ...metadata.parameters, ...json };
            console.log("Text was parsed as JSON successfully");

            //TODO - check for duplicate processing
            if (text.includes('parameters') || text.includes('workflow') || text.includes('prompt')) {
                // Try to parse as JSON for workflow data
                
                // Check for workflow data in text
                if (text.includes('workflow')) {
                    // Try to extract and parse workflow JSON
                    const workflowRegex = /workflow["']?\s*:\s*["']?({.*?})/s;
                    const workflowMatch = text.match(workflowRegex);
                    if (workflowMatch) {
                        const comfyuiWorkflow = workflowMatch[1];
                        if (!this.storeComfyUIWorkflow(metadata, comfyuiWorkflow))
                            alert("Workflow is not valid JSON");
                    }
                }
            }

            return;

        } catch (e) {
            console.log("Not JSON, continuing with text parsing");
        }
        
        // Handle the specific format where we have:
        // "prompt text","negative prompt text","metadata"
        // This appears to be a comma-separated format with quoted sections
        
        // First, detect if this is actually a quoted format by checking for proper quote patterns
        // A proper quoted format should start with a quote and have balanced quotes
        const startsWithQuote = text.trim().startsWith('"');
        const quoteCount = (text.match(/"/g) || []).length;
        const hasBalancedQuotes = quoteCount >= 4 && quoteCount % 2 === 0; // At least 2 quoted sections
        const hasCommasBetweenQuotes = /"\s*,\s*"/.test(text); // Pattern like "text","text"
        
        console.log("Quote format detection:");
        console.log("- Starts with quote:", startsWithQuote);
        console.log("- Quote count:", quoteCount);
        console.log("- Has balanced quotes:", hasBalancedQuotes);
        console.log("- Has commas between quotes:", hasCommasBetweenQuotes);
        
        // Only try quoted parsing if it looks like a proper quoted format
        if (startsWithQuote && hasBalancedQuotes && hasCommasBetweenQuotes) {
            console.log("Detected quoted format, attempting quoted parsing");
            
            const quotedSections = [];
            let currentSection = '';
            let inQuotes = false;
            let escapeNext = false;
            
            for (let i = 0; i < text.length; i++) {
                const char = text[i];
                
                if (escapeNext) {
                    currentSection += char;
                    escapeNext = false;
                    continue;
                }
                
                if (char === '\\') {
                    escapeNext = true;
                    currentSection += char;
                    continue;
                }
                
                if (char === '"') {
                    if (inQuotes) {
                        // End of quoted section
                        quotedSections.push(currentSection);
                        currentSection = '';
                        inQuotes = false;
                    } else {
                        // Start of quoted section
                        inQuotes = true;
                    }
                } else if (char === ',' && !inQuotes) {
                    // Comma outside quotes - section separator (ignore)
                    continue;
                } else if (inQuotes) {
                    currentSection += char;
                }
            }
            
            console.log("Quoted sections found:", quotedSections.length);
            console.log("Quoted sections:", quotedSections.slice(0, 3)); // Show first 3 for debugging
            
            // If we have valid quoted sections, process them
            if (quotedSections.length >= 2) {
                console.log("Using quoted sections parsing");
                // First section is the main prompt
                const mainPrompt = quotedSections[0].trim();
                if (mainPrompt) {
                    //alert("mainPrompt:\n" + mainPrompt); //FIX
                    metadata.parameters['Prompt'] = mainPrompt;
                }
                
                // Second section is the negative prompt
                const negativePrompt = quotedSections[1].trim();
                if (negativePrompt) {
                    //alert("negativePrompt:\n" + negativePrompt); //FIX
                    metadata.parameters['Negative prompt'] = negativePrompt;
                }
                
                // Third section and beyond contain metadata
                if (quotedSections.length > 2) {
                    const metadataText = quotedSections.slice(2).join(', ');
                    this.parseMetadataSection(metadataText, metadata);
                }
            } else {
                // Quoted parsing failed, fall back to traditional
                console.log("Quoted parsing failed, using traditional format parsing");
                this.parseTraditionalFormat(text, metadata);
            }
        } else {
            // Not a quoted format, use traditional parsing
            console.log("Not a quoted format, using traditional format parsing");
            this.parseTraditionalFormat(text, metadata);
        }
        
        //NEW "rocket-sience" version 300 lines of code
        const out = this.extractPromptsRobustPatched(text, { multiWordKeys: ['model hash','adetailer model'], debug:true });
        console.log(out.prompt, out.negativePrompt, out.remainder, out.debug);

        //BALANCED (180+ lines)
        //text = text.replace("(1girl", "1girl"); // remove un-even bracket
        const out2 = this.extractPromptsMinimalButRobust_v3(text);
        console.log(out2.prompt, out2.negativePrompt, out2.remainder);
        // test unbalanced without negative prompt
        const text2 = text.replace("Negative prompt:", "").replace(out2.negativePrompt, "");
        const out2a = this.extractPromptsMinimalButRobust_v3(text2);
        console.log(out2a.prompt, out2a.negativePrompt, out2a.remainder);
        // test quoted text
        const text3 = "the man holds a sign with the text \"FLUX\" over his head. " + text;
        const out2b = this.extractPromptsMinimalButRobust_v3(text3);
        console.log(out2b.prompt, out2b.negativePrompt, out2b.remainder);

        //MINIMAL (97+ lines, uses same inline findMainNegativePromptIndex() function)
        const out3 = this.extractPromptsHardStop(text);
        console.log(out3.prompt, out3.negativePrompt, out3.remainder);


        // Extract model hashes for later resolution (updates metadata.raw.hashes)
        const hashes = this.extractModelHashes(text, metadata);
        console.log('Hashes:', UI.formatJSON(hashes));

        //TODO - test with "./Test Images/94306873.png"
        // parseADetailerMetadata() uses hashes for cross-referencing
        const AD_arr = this.parseADetailerMetadata(text, metadata.raw.hashes);
        console.log('ADetailer Metadata:', AD_arr);
        
        // runs thru Remainder for all parameters
        const out5_v1 = this.extractTextPromptsAndParameters(text);
        console.log(out5_v1);
        const out5_params_v1 = out5_v1.parameters;
        console.log('Parameters v1:', out5_params_v1);
        const out5_v2 = this.extractTextPromptsAndParameters_v2(text);
        console.log(out5_v2);
        const out5_params_v2 = out5_v2.parameters;
        console.log('Parameters v2:', out5_params_v2);

        // Now run prompt extraction and adetailer parsing (adetailer parser will attach hashes from styleHashes)
        // uses above prompts from extractPromptsMinimalButRobust_v3()
        // calls parseADetailerMetadata() to generate all ADetailer prompts
        const { prompts, negativePrompts, adetailers } = this.extractAllPrompts(text, metadata.raw.hashes);
        console.log('--- Prompts (collated) ---');
        console.log('Main prompt:', prompts.main);
        console.log('ClipTextEncode prompt:', prompts.ClipTextEncode);
        console.log('easypositive prompt:', prompts.easypositive);
        console.log('ADetailer prompts:', adetailers.map(a => ({ index: a.index, model: a.model, prompt: a.prompt, hash: a.hash })));
        console.log('\n--- Negative prompts (collated) ---');
        console.log('Main negative:', negativePrompts.main);
        console.log('ClipTextEncode negative:', negativePrompts.ClipTextEncode);
        console.log('easynegative prompt:', negativePrompts.easynegative);
        //console.log('\n--- Reference Data ---');
        //console.log(reference);
    }
    
    static extractAIGenerationParametersForNegativePrompt(text, metadata) {
        // This function is specifically for extracting negative prompt and other metadata
        // when we already have a prompt from workflow extraction
        // It should NOT override the existing prompt
        
        console.log("=== extractAIGenerationParametersForNegativePrompt DEBUG ===");
        console.log("Input text length:", text.length);
        console.log("Input text first 500 chars:", text.substring(0, 500));
        
        // Store the current prompt to avoid overriding it
        const existingPrompt = metadata.parameters['Prompt'];
        
        // Try to parse as JSON first (some tools store parameters as JSON)
        try {
            const json = JSON.parse(text);
            // Only extract non-prompt parameters
            const filteredJson = { ...json };
            delete filteredJson['Prompt']; // Don't override workflow prompt
            //BUG //CHECK metadata.parameters = { ...metadata.parameters, ...filteredJson };
            console.log("Parsed as JSON successfully, kept existing prompt");

            return;
        } catch (e) {
            console.log("Not JSON, continuing with text parsing");
        }
        
        // The issue is that this PNG doesn't use the quoted format
        // It uses the traditional format with "Negative prompt:" marker
        // So let's skip the quoted parsing and go directly to traditional parsing
        console.log("Skipping quoted format parsing, using traditional format");
        this.parseTraditionalFormatForNegativePrompt(text, metadata);
        
        // Restore the existing prompt (don't let it be overridden)
        if (existingPrompt) {
            metadata.parameters['Prompt'] = existingPrompt;
        }
        
        // Extract model hashes for later resolution
        this.extractModelHashes(text, metadata);
    }

    // used by parseTraditionalFormatForNegativePrompt()
    // and parseTraditionalFormat()
    static METADATA_MARKERS = [
        // RL - we already trimmed out any newline "\" characters
        //'\nSteps:', '\nCFG scale:', '\nSeed:', '\nSize:', '\nModel hash:', '\nModel:',
        //'\nClip skip:', '\nENSD:', '\nSampler:', '\nSchedule type:', '\nADetailer', '\nLora hashes:',
        //'\nTI hashes:', '\nEmphasis:', '\nVersion:', '\nDenoising strength:'

        'Steps:', 'CFG scale:', 'Distilled CFG Scale:', 'Seed:', 'Size:', 'Model hash:', 'Model:',
        'Clip skip:', 'ENSD:', 'Sampler:', 'Schedule type:', 'ADetailer', 'Lora hashes:',
        'TI hashes:', 'Emphasis:', 'Version:', 'Denoising strength:', 'Hashes:', 'Civitai resources:',
        'Version', 'Module 1:', 'Module 2:', 'Module 3:' // Forge Modules
    ];
    
    static parseTraditionalFormatForNegativePrompt(text, metadata) {
        // This function extracts negative prompt and metadata from traditional format
        // without overriding the existing workflow-extracted prompt

        //alert("Negative Prompt:\n" + text); //FIX
        
        console.log("=== parseTraditionalFormatForNegativePrompt DEBUG ===");
        console.log("Input text length:", text.length);
        console.log("Input text first 500 chars:", text.substring(0, 500));
        console.log("Input text last 500 chars:", text.substring(Math.max(0, text.length - 500)));
        
        // Store the current prompt to avoid overriding it
        const existingPrompt = metadata.parameters['Prompt'];
                
        // Find the first occurrence of any metadata marker
        let firstMetadataIndex = -1;
        let foundMarker = '';
        for (const marker of this.METADATA_MARKERS) {
            const index = text.indexOf(marker);
            if (index !== -1 && (firstMetadataIndex === -1 || index < firstMetadataIndex)) {
                firstMetadataIndex = index;
                foundMarker = marker;
            }
        }
        
        console.log("First metadata marker found at index:", firstMetadataIndex, "marker:", foundMarker);
        
        // Split text into prompt section and metadata section
        let promptSection = '';
        let metadataSection = '';
        
        if (firstMetadataIndex !== -1) {
            promptSection = text.substring(0, firstMetadataIndex).trim();
            metadataSection = text.substring(firstMetadataIndex).trim();
        } else {
            // No metadata markers found, treat entire text as prompt
            promptSection = text.trim();
        }
        
        console.log("Prompt section length:", promptSection.length);
        console.log("Prompt section first 500 chars:", promptSection.substring(0, 500));
        console.log("Prompt section last 200 chars:", promptSection.substring(Math.max(0, promptSection.length - 200)));
        
        // Extract negative prompt from prompt section (but don't extract main prompt)
        let negativePrompt = '';
        
        // Look for "Negative prompt:" in the prompt section
        const negativePromptIndex = promptSection.lastIndexOf('Negative prompt:');
        console.log("Negative prompt index:", negativePromptIndex);
        
        if (negativePromptIndex !== -1) {
            negativePrompt = promptSection.substring(negativePromptIndex + 'Negative prompt:'.length).trim();
            console.log("Raw extracted negative prompt length:", negativePrompt.length);
            console.log("Raw extracted negative prompt:", negativePrompt);
            
            // Check if there are any line breaks or other separators that might be cutting off the negative prompt
            const lines = negativePrompt.split('\n');
            console.log("Negative prompt split into", lines.length, "lines");
            for (let i = 0; i < lines.length; i++) {
                console.log(`Line ${i}:`, lines[i]);
            }
        } else {
            console.log("No 'Negative prompt:' found in prompt section");
            // Let's also check if it's in the full text
            const fullNegativePromptIndex = text.lastIndexOf('Negative prompt:');
            console.log("Negative prompt index in full text:", fullNegativePromptIndex);
            if (fullNegativePromptIndex !== -1) {
                const fullNegativePrompt = text.substring(fullNegativePromptIndex + 'Negative prompt:'.length);
                console.log("Full negative prompt from full text:", fullNegativePrompt.substring(0, 200));
            }
        }
        
        // Set negative prompt (but keep existing main prompt)
        if (negativePrompt) {
            metadata.parameters['Negative prompt'] = negativePrompt;
        }
        
        // Parse metadata section
        if (metadataSection) {
            this.parseMetadataSection(metadataSection, metadata);
        }
        
        // Restore the existing prompt (don't let it be overridden)
        if (existingPrompt) {
            metadata.parameters['Prompt'] = existingPrompt;
        }
    }
    
    static parseTraditionalFormat(text, metadata) {
        console.log("=== parseTraditionalFormat DEBUG ===");
        console.log("Input text length:", text.length);
        console.log("Input text first 500 chars:", text.substring(0, 500));
        console.log("Input text contains 'Negative prompt:':", text.includes('Negative prompt:'));
        console.log("BEFORE PARSING - Current metadata.parameters:", UI.formatJSON(metadata.parameters));
        
        // Handle newline-separated format: prompt\nNegative prompt: negative\nSteps: 25, ...

        // Find "Negative prompt:" marker
        const negativePromptMarker = 'Negative prompt:';
        const negativePromptIndex = text.indexOf(negativePromptMarker);
        console.log("Negative prompt index:", negativePromptIndex);
        
        // Find where metadata starts (that marks the end of the prompt or negative prompt and other metadata follows)

        let mainPrompt = '';
        let negativePrompt = '';
        let metadataSection = '';

        //alert("parseTraditionalFormat"); //FIX
        if (negativePromptIndex !== -1) {
            // Extract main prompt (everything before "Negative prompt:")
            mainPrompt = text.substring(0, negativePromptIndex).trim();
            console.log("RAW main prompt extracted:", mainPrompt.substring(0, 200));
            
            // Extract the rest after "Negative prompt:"
            const afterNegativePrompt = text.substring(negativePromptIndex + negativePromptMarker.length);
            console.log("Text after 'Negative prompt:' marker:", afterNegativePrompt.substring(0, 200));
            
            // Find where metadata starts (look for newline followed by metadata markers)
            let firstMetadataIndex = -1;
            let foundMarker = '';
            for (const marker of this.METADATA_MARKERS) {
                const index = afterNegativePrompt.indexOf(marker);
                if (index !== -1 && (firstMetadataIndex === -1 || index < firstMetadataIndex)) {
                    firstMetadataIndex = index;
                    foundMarker = marker;
                }
            }
            
            console.log("First metadata marker found at index:", firstMetadataIndex, "marker:", foundMarker);
            
            if (firstMetadataIndex !== -1) {
                // Split negative prompt and metadata
                negativePrompt = afterNegativePrompt.substring(0, firstMetadataIndex).trim();
                metadataSection = afterNegativePrompt.substring(firstMetadataIndex).trim();
                console.log("RAW negative prompt extracted:", negativePrompt.substring(0, 200));
                console.log("RAW metadata section extracted:", metadataSection.substring(0, 200));
            } else {
                // No metadata found, everything after "Negative prompt:" is the negative prompt
                negativePrompt = afterNegativePrompt.trim();
                console.log("RAW negative prompt extracted (no metadata):", negativePrompt.substring(0, 200));
            }
        } else {
            console.log("No 'Negative prompt:' marker found, looking for metadata markers in full text");
            // No "Negative prompt:" found, look for metadata markers in the full text
            let firstMetadataIndex = -1;
            for (const marker of this.METADATA_MARKERS) {
                const index = text.indexOf(marker);
                if (index !== -1 && (firstMetadataIndex === -1 || index < firstMetadataIndex)) {
                    firstMetadataIndex = index;
                }
            }
            
            if (firstMetadataIndex !== -1) {
                mainPrompt = text.substring(0, firstMetadataIndex).trim();
                metadataSection = text.substring(firstMetadataIndex).trim();
                console.log("RAW main prompt extracted (no negative):", mainPrompt.substring(0, 200));
                console.log("RAW metadata section extracted (no negative):", metadataSection.substring(0, 200));
            } else {
                // No metadata markers found, treat entire text as prompt
                mainPrompt = text.trim();
                console.log("RAW main prompt extracted (entire text):", mainPrompt.substring(0, 200));
            }
        }
                
        console.log("EXTRACTED - Final main prompt length:", mainPrompt.length);
        console.log("EXTRACTED - Final main prompt first 200 chars:", mainPrompt.substring(0, 200));
        console.log("EXTRACTED - Final negative prompt length:", negativePrompt.length);
        console.log("EXTRACTED - Final negative prompt first 100 chars:", negativePrompt.substring(0, 100));
        console.log("EXTRACTED - Metadata section length:", metadataSection.length);
        
        // *** Set prompts
        if (mainPrompt) {
            // Clean up main prompt
            mainPrompt = this.CleanUpPrompt(mainPrompt);

            console.log("SETTING main prompt:", mainPrompt.substring(0, 100));
            metadata.parameters['Prompt'] = mainPrompt;
        }

        if (negativePrompt) {
            // Clean up negative prompt
            negativePrompt = this.CleanUpPrompt(negativePrompt);

            console.log("SETTING negative prompt:", negativePrompt.substring(0, 100));
            metadata.parameters['Negative prompt'] = negativePrompt;
        }
        
        console.log("AFTER SETTING - metadata.parameters:", UI.formatJSON(metadata.parameters));
        
        // Parse metadata section
        if (metadataSection) {
            this.parseMetadataSection(metadataSection, metadata);
        }
        
        console.log("FINAL - metadata.parameters:", UI.formatJSON(metadata.parameters));
    }
    
    static parseMetadataSection(metadataText, metadata) {
        // Parse key-value pairs from metadata section
        const patterns = {
            'Steps': /Steps:\s*(\d+)/i,
            //'Sampler': /Sampler:\s*([^,]+)/i,
            'Sampler': /Sampler:\s*(.*?)(?:,|$)/i,
            'Schedule type': /Schedule type:\s*(.*?)(?:,|$)/i,
            'CFG scale': /CFG scale:\s*([\d.]+)/i,
            'Distilled CFG Scale': /Distilled CFG Scale:\s*([\d.]+)/i,
            'Seed': /Seed:\s*(\d+)/i,
            'Model': /Model:\s*(.*?)(?:,|$)/i,
            'Model hash': /Model hash:\s*([a-fA-F0-9]+)/i,
            'Denoising strength': /Denoising strength:\s*([\d.]+)/i,
            'Clip skip': /Clip skip:\s*(\d+)/i,
            'Size': /Size:\s*(\d+x\d+)/i,
            'Version': /Version:\s*(.*?)(?:,|$)/i
        };
        
        for (const [key, regex] of Object.entries(patterns)) {
            const match = metadataText.match(regex);
            if (match) {
                if (key === 'Size') {
                    const sizeParts = match[1].split('x');
                    metadata.parameters['Width'] = parseInt(sizeParts[0]);
                    metadata.parameters['Height'] = parseInt(sizeParts[1]);
                } else {
                    metadata.parameters[key] = this.parseValue(match[1].trim());
                }
            }
        }
        
        // Look for ADetailer
        // prompt
        const adetailerPromptMatch = metadataText.match(/ADetailer prompt:\s*"([^"]*)"/i);
        if (adetailerPromptMatch) {
            metadata.parameters['ADetailer prompt'] = this.CleanUpPrompt(adetailerPromptMatch[1].trim());
        }
        // model
        const adetailerModelMatch = metadataText.match(/ADetailer model:\s*([^,]+)/i);
        if (adetailerModelMatch) {
            metadata.parameters['ADetailer model'] = adetailerModelMatch[1].trim();
        }
    }

    // RL - clean up Prompt Trails
    static CleanUpPrompt(promptText) {
        // Clean up text prompt
        if (promptText.endsWith(',')) {
            promptText = promptText.slice(0, -1).trim();
        }
        return promptText;
    }

    static parseModelAndLoraHashes(text) {
        const result = {};
        const loras = {}; // by index -> { name?, hash? }

        const cleanName = s => {
            if (!s) return null;

            s = String(s).trim().replace(/^["']|["']$/g, '');
            s = s.replace(/^.*[\\/]/, ''); // drop path prefix
            s = s.replace(/\.(safetensors|ckpt)$/i, ''); // drop extension

            return s.trim();
        };

        // ---------- STRICT main model parsing ----------
        // Require that "Model:" / "Model hash:" is either at start OR immediately follows a comma or '('
        // This prevents matching substrings like "Strength model: 0.6"
        const mainNameRx = /(?:^|,|\()\s*Model\s*:\s*([^,]+)/i;
        const mainHashRx = /(?:^|,|\()\s*Model\s*hash\s*:\s*([A-Fa-f0-9]+)/i;

        const mn = mainNameRx.exec(text);
        const mh = mainHashRx.exec(text);

        let mainName = mn ? cleanName(mn[1]) : null;
        let mainHash = mh ? mh[1].trim() : null;

        // if we didn't find both, attempt the swapped-order capture within a short window around each match
        // (not strictly necessary for most cases, but keeps robustness)
        if (!mainName && !mainHash) {
            // try looser paired capture (but still require comma before the 'Model' to reduce false matches)
            const paired =
                /(?:^|,|\()\s*Model\s*:\s*([^,]+)[\s\S]{0,200}?Model\s*hash\s*:\s*([A-Fa-f0-9]+)/i.exec(text) ||
                /(?:^|,|\()\s*Model\s*hash\s*:\s*([A-Fa-f0-9]+)[\s\S]{0,200}?Model\s*:\s*([^,]+)/i.exec(text);

            if (paired) {
                // groups order may vary — detect which group is hash vs name
                const g1 = paired[1], g2 = paired[2];
                if (/^[A-Fa-f0-9]+$/.test(g1) && !/^[A-Fa-f0-9]+$/.test(g2)) {
                    mainHash = g1;
                    mainName = cleanName(g2);
                } else if (/^[A-Fa-f0-9]+$/.test(g2) && !/^[A-Fa-f0-9]+$/.test(g1)) {
                    mainHash = g2;
                    mainName = cleanName(g1);
                } else {
                    // ambiguous: keep what we can
                    if (/^[A-Fa-f0-9]+$/.test(g1)) mainHash = g1;
                    if (!/^[A-Fa-f0-9]+$/.test(g2)) mainName = cleanName(g2);
                }
            }
        }

        // Store main model result with preferred key style:
        if (mainHash) {
            if (mainName) result[`model:${mainName}`] = mainHash;
            else result['model'] = mainHash;
        } else if (mainName) {
            result[`model:${mainName}`] = '';
        }

        // ---------- LORA parsing (dedicated loop only for Lora tokens) ----------
        // Only match Lora names and Lora hashes. Do NOT include main model alternatives here.
        const loraTokenRe = /Lora_(\d+)\s+Model\s+name\s*:\s*([^,]+)|Lora_(\d+)\s+Model\s*hash\s*:\s*([A-Fa-f0-9]+)/gi;
        let r;
        while ((r = loraTokenRe.exec(text)) !== null) {
            if (r[1] && r[2]) {
                const idx = parseInt(r[1], 10);
                loras[idx] = loras[idx] || {};
                loras[idx].name = cleanName(r[2]);
            } else if (r[3] && r[4]) {
                const idx = parseInt(r[3], 10);
                loras[idx] = loras[idx] || {};
                loras[idx].hash = r[4].trim();
            }
        }

        // final assembly: prefer name keys, fallback to index keys
        const idxs = Object.keys(loras).map(x => parseInt(x, 10)).sort((a, b) => a - b);
        for (const i of idxs) {
            const o = loras[i];
            if (!o || !o.hash) continue;

            if (o.name) result[`lora:${o.name}`] = o.hash;
            else result[`lora:${i}`] = o.hash;
        }

        return result;
    }

    /**
     * Merge two hash maps and prioritise richer keys for model/embed.
     * Order result: model (plain then named), lora (sorted, numeric-first where possible),
     * embed (plain then named), then other keys (sorted).
     *
     * @param {Object} existingHashes   - e.g. parsed from "Hashes: {...}"
     * @param {Object} parsedHashes     - output from parseModelAndLoraHashes(text) or similar
     * @returns {Object} merged + ordered object
     */
    static mergeAndPrioritizeHashes(existingHashes = {}, parsedHashes = {}) {
        // parsedHashes should override existingHashes (parsed wins)
        const merged = { ...existingHashes, ...parsedHashes };

        // If richer "model:NAME" keys exist, drop plain "model"
        const hasRicherModel = Object.keys(merged).some(k => /^model:/i.test(k));
        if (hasRicherModel && merged.hasOwnProperty('model')) {
            delete merged['model'];
        }

        // If richer "embed:NAME" keys exist, drop plain "embed"
        const hasRicherEmbed = Object.keys(merged).some(k => /^embed:/i.test(k));
        if (hasRicherEmbed && merged.hasOwnProperty('embed')) {
            delete merged['embed'];
        }

        // Build the ordered output
        const out = {};
        const push = keys => keys.forEach(k => { out[k] = merged[k]; });

        // 1) model group: plain 'model' first, then 'model:...' sorted
        if (merged.hasOwnProperty('model')) {
            out['model'] = merged['model'];
        }
        const modelNamedKeys = Object.keys(merged)
            .filter(k => /^model:/i.test(k))
            .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
        push(modelNamedKeys);

        // 2) lora group: try to order numerically when keys are 'lora:<num>'
        const loraKeys = Object.keys(merged)
            .filter(k => /^lora:/i.test(k))
            .sort((a, b) => {
            const ai = a.match(/^lora:(\d+)$/i);
            const bi = b.match(/^lora:(\d+)$/i);
            if (ai && bi) return Number(ai[1]) - Number(bi[1]);
            // otherwise fallback to case-insensitive text order
            return a.toLowerCase().localeCompare(b.toLowerCase());
            });
        push(loraKeys);

        // 3) embed group: plain 'embed' first, then 'embed:...' sorted
        if (merged.hasOwnProperty('embed')) {
            out['embed'] = merged['embed'];
        }
        const embedNamedKeys = Object.keys(merged)
            .filter(k => /^embed:/i.test(k))
            .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
        push(embedNamedKeys);

        // 4) other leftover keys (sorted)
        const otherKeys = Object.keys(merged)
            .filter(k => !/^model/i.test(k) && !/^lora:/i.test(k) && !/^embed:/i.test(k))
            .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
        push(otherKeys);

        return out;
    }

    /*
    * Parse ADetailer metadata spread through text and attach hashes when present.
    *
    * @param {string} text  - full prompt/metadata text that may contain "ADetailer ..." tokens
    * @param {Object} hashes - existing hashes object (may include keys like "adetailer:face_yolov9c.pt": "d02...")
    * @returns {Array<Object>} array of adetailer entries:
    *   [
    *     {
    *       index: 1,
    *       model: "face_yolov9c.pt",
    *       prompt: "extremely detailed eyes, ...",
    *       negative_prompt: "lazyneg, ...",
    *       confidence: 0.7,
    *       dilate_erode: 4,
    *       mask_blur: 4,
    *       denoising_strength: 0.4,
    *       inpaint_only_masked: true,
    *       inpaint_padding: 32,
    *       version: "25.3.0",
    *       hash: "d02fe493c3" // if found in hashes param
    *     },
    *     ...
    *   ]
    * 
    *  ---------------- Example usage ----------------

    const text = `
    ADetailer model: face_yolov9c.pt, ADetailer prompt: "extremely detailed eyes, extremely detailed face, <lora:hololive_kaela_kovalskia_redebut:0.75> kaela20, red eyes, smile", ADetailer negative prompt: "lazyneg, (sweat:1.5), poorly drawn eyes", ADetailer confidence: 0.7, ADetailer dilate erode: 4, ADetailer mask blur: 4, ADetailer denoising strength: 0.4, ADetailer inpaint only masked: True, ADetailer inpaint padding: 32, ADetailer model 2nd: hand_yolov9c.pt, ADetailer prompt 2nd: "finely drawn hand", ADetailer model 3rd: foot_yolov8x_v2.pt, ADetailer prompt 3rd: "finely drawn foot"
    `;

    const hashes = {
    "adetailer:face_yolov9c.pt": "d02fe493c3",
    "adetailer:hand_yolov9c.pt": "6f116f686e",
    "adetailer:foot_yolov8x_v2.pt": "9f39f32ab8"
    };

    console.log(this.parseADetailerMetadata(text, hashes));

    /* Expected output (approx):
    [
        {
            index: 1,
            model: "face_yolov9c.pt",
            prompt: "extremely detailed eyes, extremely detailed face, <lora:hololive_kaela_kovalskia_redebut:0.75> kaela20, red eyes, smile",
            negative_prompt: "lazyneg, (sweat:1.5), poorly drawn eyes",
            confidence: 0.7,
            dilate_erode: 4,
            mask_blur: 4,
            denoising_strength: 0.4,
            inpaint_only_masked: true,
            inpaint_padding: 32,
            hash: "d02fe493c3"
        },
        {
            index: 2,
            model: "hand_yolov9c.pt",
            prompt: "finely drawn hand",
            hash: "6f116f686e"
        },
        {
            index: 3,
            model: "foot_yolov8x_v2.pt",
            prompt: "finely drawn foot",
            hash: "9f39f32ab8"
        }
    ]
    */
    // ----------------- ADetailer parser (adapted) -----------------
    static parseADetailerMetadata(text, hashes = {}) {
        // token regex: captures field name, optional ordinal (e.g. "2nd"), and a value (quoted or up to next comma)
        // We include all expected fields, case-insensitive.
        const tokenRegEx = /ADetailer\s*(model|prompt|negative prompt|confidence|dilate erode|mask blur|denoising strength|inpaint only masked|inpaint padding|version)\s*(\d*(?:st|nd|rd|th)?)\s*:\s*(".*?"|[^,]+)/gi;

        // storage keyed by numeric index
        const entries = {}; // { [idx]: { index: idx, model?, prompt?, ... } }
        let nextAutoIdx = 1;
        let lastSeenIdx = 1;

        const normalizeField = (raw) => {
            const f = raw.toLowerCase().trim();
            switch (f) {
                case 'negative prompt': return 'negative_prompt';
                case 'dilate erode': return 'dilate_erode';
                case 'mask blur': return 'mask_blur';
                case 'denoising strength': return 'denoising_strength';
                case 'inpaint only masked': return 'inpaint_only_masked';
                case 'inpaint padding': return 'inpaint_padding';

                default: return f.replace(/\s+/g, '_'); // model -> model, prompt -> prompt, version -> version, confidence -> confidence
            }
        };

        const cleanValue = (raw) => {
            if (raw == null) return raw;

            let v = String(raw).trim();
            // strip surrounding quotes if present
            if ((v.startsWith('"') && v.endsWith('"')) ||
                (v.startsWith("'") && v.endsWith("'"))) {

                v = v.slice(1, -1);
            }

            return v.trim();
        };

        let match;
        while ((match = tokenRegEx.exec(text)) !== null) {
            const rawField = match[1];  // e.g. "model" or "prompt" or "confidence"
            const ord = match[2];       // e.g. "2nd" or "" (maybe empty)
            const rawVal = match[3];    // quoted or up-to-next-comma

            // determine index:
            let idx;
            const ordDigits =
                ord && (ord.match(/\d+/)
                    ? ord.match(/\d+/)[0]
                    : null);

            if (ordDigits) {
                idx = parseInt(ordDigits, 10);
                lastSeenIdx = idx;
                // ensure nextAutoIdx moves past explicit indices
                if (idx >= nextAutoIdx) nextAutoIdx = idx + 1;
            } else if (/^model$/i.test(rawField)) {
                // a model without index: assign next automatic index and advance
                idx = nextAutoIdx++;
                lastSeenIdx = idx;
            } else {
                // other fields without explicit index: attach them to the most recently seen index (lastSeenIdx)
                idx = lastSeenIdx;
            }

            // ensure entry exists
            entries[idx] = entries[idx] || { index: idx };

            const field = normalizeField(rawField);
            let val = cleanValue(rawVal);

            // coerce certain types
            if (/^(?:confidence|dilate_erode|mask_blur|denoising_strength|inpaint_padding)$/i.test(field)) {
                // numeric
                const n = Number(val);
                val = Number.isFinite(n) ? n : val;
            } else if (/^inpaint_only_masked$/i.test(field)) {
                // boolean (accept True/False, true/false)
                if (/^(true|false)$/i.test(val)) val = /^true$/i.test(val);
                // sometimes may be "True," with trailing punctuation — cleanValue removed quotes but not trailing commas, token regex avoids comma
            } else {
                // string: trim
                val = String(val);
            }

            // store
            entries[idx][field] = val;
        }

        // Convert entries to sorted array (by index ascending)
        const arr = Object.keys(entries)
            .map(k => entries[k])
            .sort((a, b) => a.index - b.index)
            .map(e => {
                // Post-process: normalize model names (strip path if present)
                if (e.model) {
                    e.model = String(e.model).trim().replace(/^.*[\\/]/, '').trim(); // drop path

                    // Attach hash if found in hashes param under key "adetailer:<model>"
                    const lookupKey = `adetailer:${e.model}`;
                    if (hashes && hashes.hasOwnProperty(lookupKey)) {
                        e.hash = hashes[lookupKey];
                    } else if (hashes && hashes.hasOwnProperty(e.model)) {
                        // also tolerate plain model filename key (just in case)
                        e.hash = hashes[e.model];
                    }
                }

                return e;
            });

        return arr;
    }

    // ----------------- Utilities -----------------
    static escapeRegex(s) {
        return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    static stripQuotes(s) {
        if (s == null) return s;

        s = String(s).trim();
        if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
            return s.slice(1, -1);
        }

        return s;
    };

//TODO33
/*
2) Improved extractTextPromptsAndParameters_v2 (drop-in)
This keeps the front part where you call extractTextPromptsAndRemainder() (you said that is fine already), then removes the high

MERGE WITH BELOW
*/
static parseTypedValue(valStr) {
  // trim and unquote
  let v = String(valStr).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
    // keep as string
    return v;
  }

  // try number (int or float)
  if (/^[+-]?\d+(\.\d+)?$/.test(v)) {
    return v.includes('.') ? parseFloat(v) : parseInt(v, 10);
  }

  // booleans (common in some metadata)
  if (/^(true|false)$/i.test(v)) return v.toLowerCase() === 'true';

  // as fallback, return trimmed string
  return v;
}

static extractTextPromptsAndParameters_v2(text) {
  const result = {
    prompt: '',
    negativePrompt: '',
    parameters: {}
  };

  // 1) split prompt/negative/remainder using your existing function
  let { prompt, negativePrompt, remainder } = this.extractPromptsMinimalButRobust_v3(text);

  result.prompt = this.trimAllWhitespacesAndCommas(prompt);
  result.negativePrompt = this.trimAllWhitespacesAndCommas(negativePrompt);

  // 2) remove the higher-level structured params (you already do this)
  for (const [keyStyle, valuePatternRe] of Object.entries(this.modelReferencePatterns)) {
    // remove all occurrences, not only the first one; use global if not provided
    // patterns you provided are mixed with/without 'g' - normalize:
    const re = new RegExp(valuePatternRe.source, valuePatternRe.flags.includes('g') ? valuePatternRe.flags : (valuePatternRe.flags + 'g'));
    remainder = remainder.replace(re, '');
  }

  // 3) parse simple key:value pairs from remainder
  // This regex:
  // - captures key (non-greedy up to colon)
  // - supports values either: "quoted possibly with commas" OR unquoted until next comma
  // - uses lookahead to ensure we stop at the comma that separates top-level params or end-of-string
  const paramRe = /([A-Za-z0-9 _\-]+?)\s*:\s*(?:(["'])([\s\S]*?)\2|([^,]+?))(?=\s*(?:,|$))/g;

  // skipParam patterns - treat as starts (prefixes) to skip
  const skipParamPrefixes = ['Lora_', 'ADetailer'];

  let m;
  while ((m = paramRe.exec(remainder)) !== null) {
    const rawKey = m[1].trim();
    // value either in group 3 (quoted) or group 4 (unquoted)
    const rawValue = (m[3] !== undefined && m[3] !== null) ? m[3] : (m[4] !== undefined ? m[4] : '');
    const key = rawKey;
    const valParsed = this.parseTypedValue(rawValue.trim());

    // skip certain prefixes (case-insensitive)
    if (!skipParamPrefixes.some(pref => new RegExp('^' + pref, 'i').test(key))) {
      result.parameters[key] = valParsed;
    } else {
      // optionally log skip
      // console.debug('skip param', key);
    }
  }

  return result;
}

    /**
     * Robust prompt + parameter extractor:
     *  - preserves prompt / negative prompt extraction (assumed already working)
     *  - parses Hashes: {...} JSON first (strong source of truth)
     *  - parses "Lora hashes" and "TI hashes" compact lists
     *  - extracts metadata keys only from a curated list and only when they are top-level
     *  - avoids false positives from "(goggles:1.5)" and similar by skipping matches
     *    whose preceding char is '(' or '<'
     */
    static extractTextPromptsAndParameters(text) {
        const result = {
            prompt: '',
            negativePrompt: '',
            parameters: {}
        };

        let { prompt, negativePrompt, remainder } = this.extractPromptsMinimalButRobust_v3(text);

        result.prompt = this.trimAllWhitespacesAndCommas(prompt);
        result.negativePrompt = this.trimAllWhitespacesAndCommas(negativePrompt);


        // ASSUMING: prompt and negative prompt are already removed from text (and all Style0 references)
        // remove higher-level structured params, parsed separatly by parseStyle0() - parseStyle5()

        for (const [keyStyle, valuePatternRe] of Object.entries(this.modelReferencePatterns)) {
            console.debug(`processing ${keyStyle}: ${valuePatternRe}`);

            const match = remainder.match(valuePatternRe);
            if (match) { // remove the whole high-level structured param from text
                console.debug(`removing param ${match[0]}`)
                remainder = remainder.replace(match[0], '');
            }
        };

        // --- 3️⃣ Extract parameters (e.g. "Steps: 45, Sampler: Euler a, CFG scale: 7") ---
        // Matches all key:value pairs until end or until nested dicts (like Hashes: {...})
        const skipParam = ['Lora_','ADetailer']; // explicit Style2 'Lora_*' params parsed separatly by parseStyle2()
        // and 'ADetailer *' params parsed separatly by parseADetailerMetadata()
        const paramRe = /([A-Za-z0-9 _]+?):\s*("[^"]*"|[^,{}]+)(?=,|$)/g;
        let match;
        while ((match = paramRe.exec(remainder)) !== null) {
            const key = match[1].trim();
            const value = match[2].trim().replace(/^"|"$/g, '');
            // "`^${param}$`"   matches exact keyname
            // "`^${param}`"    matched keyname start with
            if (!skipParam.some(param => new RegExp(`^${param}`, 'i').test(key))) {
                // skip: already parsed params, e.g. "ADetailer ..." etc.
                result.parameters[key] = value;
            }
            else {
                console.debug(`removing param ${key}`);
            }
        }

        return result;
    }

    /*
    * Extract positive prompt and negative prompt robustly:
    * - If "Negative prompt:" exists, positive = everything before it (preserves <lora:...>).
    * - Negative = text after Negative prompt up to first top-level Key:
    *   - Key detected only if colon is top-level (not inside quotes/parens/braces/brackets/angle brackets)
    *   - If there is a top-level comma before the key, end negative before that comma (so parameters don't sit inside)
    *
    * If Negative prompt: exists → positive = text from prompt start (or start-of-text) up to the Negative prompt: marker. (Simple and reliable.)
    * Negative content starts after Negative prompt: and stops at the first top-level Key:.
    * A Key: is accepted as a boundary only if the colon is top-level (not inside quotes, parentheses, brackets, braces, or angle brackets),
    * and not part of emphasis/inline (goggles:1.5) or <lora:...>.
    * If there is a comma before that Key: (e.g. ..., human, Steps:) we end the negative prompt before the comma (so the parameter is definitely outside the prompt).
    * If there is no such comma (e.g. ..., head out of window frame Steps:) we end at the Key: (so head out... stays in the negative).
    *
    * Extract prompt and negative prompt with a conservative, deterministic rule for cutting
    * negative before the first top-level parameter. 
    *
    * New deterministic rule:
    *  - Find first top-level parameter candidate after negative start.
    *  - Let keyStart be its index.
    *  - Look at the immediate preceding non-space char before keyStart:
    *      - if it's a comma and that comma is top-level -> end before that comma
    *      - otherwise -> end at keyStart
    *
    * Returns { prompt, promptSpan: [start,end], negativePrompt, negativeSpan: [start,end] }
    */

    /**
     * Deterministic prompt / negative extractor (final attempt).
     * - top-level aware (quotes, (), {}, [], <>)
     * - single-token keys by default (no spaces)
     * - limited known multi-word keys allowed (Model hash, Lora hashes, TI hashes, ADetailer*)
     * - negative ends BEFORE the keyStart (or before preceding comma if immediate)
     *
     * Returns: { prompt, negativePrompt, remainder }
     */
    /**
     * Robust prompt extractor (single, merged implementation).
     *
     * Returns { prompt, negativePrompt, remainder }.
     * - prompt: positive prompt (string), respects optional "Prompt:" marker.
     * - negativePrompt: negative prompt (string) or '' if none.
     * - remainder: original text with prompt and negative prompt (and their markers) removed,
     *   starting with the first parameter key (e.g. "Steps: 30, Sampler: ...").
     *
     * Behavior:
     * - Top-level aware: ignores colons inside quotes, parentheses, braces, brackets, angle brackets.
     * - Keys are dynamically detected by finding top-level ':' and scanning backward for a contiguous token.
     * - Optional multiWordKeys set can be used to treat specific multi-word keys as a single key.
     */
    /**
     * Unified top-level-state parser + prompt extractor (no duplicated depth logic).
     *
     * - Precomputes topLevel[] (true if char at i is at top-level).
     * - Provides findNextTopLevelColon(start) and isTopLevelBetween(a,b) using that state.
     * - Extracts prompt, negativePrompt and returns remainder with prompt+negative removed.
     *
     * Usage:
     *   const res = extractPromptsAndRemainder_unified(text, { multiWordKeys: [...] });
     */
    /**
     * Deterministic prompt/negative extractor that REMOVE the prompt and negative (and markers)
     * and returns a clean remainder.
     *
     * Usage:
     *   const { prompt, negativePrompt, remainder } = extractPromptsAndRemainder_fixed(text, { multiWordKeys: [...] });
     */
    // Replace your previous function with this one (unified scanner + improved param heuristic)
    /**
     * Final extractor: returns { prompt, negativePrompt, remainder }
     * - top-level aware
     * - conservative isLikelyParam() heuristic (avoids chopping "features: long...")
     * - removes Prompt: and Negative prompt: markers + their content from remainder
     *
     * opts.multiWordKeys = optional array of multi-word keys (lowercased strings)
     */
    /**
     * Unified prompt/negative extractor with forced numeric-param acceptance.
     * Returns { prompt, negativePrompt, remainder }.
     *
     * opts.multiWordKeys = optional array of multi-word keys (lowercased strings)
     */
    /*
    1️⃣ Top-level parameter detection rules:
    Must be top-level, i.e., not inside any parentheses (), brackets [], braces {}, or angle brackets <>.
    (We already compute a topLevel[] map for that.)
    Key must start with a capital letter (like Steps, Sampler, CFG scale, Version) — multi-word keys like Model hash, Civitai resources, ADetailer dilate erode, etc., are allowed.
    Colon : immediately after the key.
    Value must be one of these:
    Integer or float number, e.g., Steps: 30, CFG scale: 4.5
    Quoted string, e.g., Model: "JANKUV4NSFWTrainedNoobaiEPS_v40"
    Array [...] or object {...}, e.g., Civitai resources: [], Hashes: {…}
    Anything else is NOT a top-level parameter, e.g.:
    (sweat:1.5) → inside parentheses → part of prompt → ignored
    <lora:best:0.55> → inside angle brackets → prompt → ignored
    features: nice; big; bold; → text, not a parameter → ignored
    2️⃣ Negative prompt extraction rules:
    Negative prompt starts at "Negative prompt:" (case-insensitive).
    Ends at the first top-level parameter that matches the rules above, or at the end of the text.
    Everything before that is considered negative prompt content, even if it contains colons inside parentheses/angles or lower-case keys.
    3️⃣ Positive prompt extraction rules:
    Starts at "Prompt:" (optional).
    Ends at either "Negative prompt:" (case-insensitive) or a top-level parameter, whichever comes first.
    4️⃣ Remainder:
    After positive and negative prompt are removed, remainder is everything starting from the first top-level parameter or whatever is left.
    It contains only true parameters.
    ✅ This approach is completely deterministic and does not require a list of all possible keys, because the detection of a top-level parameter is based on capitalization and value type, as you instructed.
    I can now rewrite your function with these rules exactly, using your topLevel[] map. It will correctly:
    Detect Steps: 30, CFG scale: 4.5, Version: classic as parameters.
    Treat (sweat:1.5), <lora:best:0.55>, features: ... as prompt content.
    Correctly split prompt / negative prompt / remainder.

    Rules for detecting top-level parameters inside the text:
    Must be at top-level (not inside quotes "...", parentheses (…), brackets […], braces {…}, or angle brackets <…>).
    Must have a key followed by a colon (:).
    Key rules:
    Can be single or multi-word (like Steps, Sampler, Civitai resources, ADetailer mask blur)
    Capitalization matters for generic keys, but specific overrides allowed (ADetailer)
    Value rules (after the colon):
    Top-level number (integer or float), OR
    Quoted string ("..." or '...'), OR
    JSON object {…} or array […]
    Otherwise, do not consider it a parameter.
    Anything not matching these rules (like features: big, long or (sweat:1.5) or <lora:best:0.4>) is part of the prompt/negative prompt, even if it looks like key: value.
    How this works for your sample:
    features: long, big → not a param → stays in negative prompt text
    (sweat:1.5) → not a param → stays in negative prompt text
    <lora:best:0.5> → not a param → stays in negative prompt text
    Steps: 30 → is a param → negative prompt ends just before Steps: 30, remainder starts from there

    Rules:
    Scan the text for positive/negative prompts (negative optional).
    After a negative prompt, the remainder starts when we detect a top-level colon that is not inside any brackets/quotes/etc.
    To qualify as a top-level param trigger:
    There is a top-level :
    The value after the colon (ignoring spaces) is either:
    a number (int/float)
    a quoted string ("..." or '...')
    a JSON-style object {...} or list [...]
    Everything before this colon (excluding the parameter name itself) belongs to the negative prompt.
    Everything from the colon and the parameter name before it onwards goes into the remainder.
    To detect the start of the parameter name for multi-word keys (like Model hash, ADetailer mask blur), we:
    Scan backwards from the colon
    Look at capitalization hints of each word’s first letter
    Include optional multi-word keys list (like ADetailer or Model hash)
    ✅ This allows us to capture Steps: 30 correctly whether it’s preceded by a comma, space, or nothing, and without confusing (sweat:1.5) or <lora:best:0.5> as parameters, because those are not top-level.

    You do not remove in-prompt <lora:...> or (sweat:1.5) — those belong to prompts.
    You do remove high-level {...} and [...] beforehand (you already do that).
    The parser is robust to unbalanced ( by using a soft-paren handling (short spans auto-closed) plus a conservative consecutive-param detection (default: require 2 nearby top-level params to mark the start of remainder). This avoids false splits when people type stray (.
    A top-level colon (not inside quotes/{}/[]/<>) triggers candidate only if the first non-space char after it is a digit, quote, { or [ — i.e. number/quoted string/object/array.
    The actual split point is the start of the parameter name (back-scanned up to maxParamWords, with optional multiWordKeys hints). Everything from that param name onward goes to remainder; everything before (except the prompt/negative markers) goes into prompt/negative.
    */
    /**
     * Robust prompt/negative/remainder extractor.
     *
     * - Keeps <lora:...> and (emphasis:1.5) inside prompts.
     * - Treats {}, [] and quoted strings strictly (non-top-level).
     * - Softly treats parentheses: short parenthesized spans hide colons; very long/unclosed parens are autoclosed.
     * - Uses consecutive-param heuristic to find the start of remainder (default: 2 params within window).
     *
     * opts:
     *   multiWordKeys: array of multi-word param names (e.g. ["model hash","adetailer mask blur"])
     *   maxParenSpan: number of chars before an unmatched '(' is auto-closed (default 200)
     *   minConsecutiveParams: how many candidate params in window to accept (default 2)
     *   paramWindow: char window between consecutive params (default 200)
     *   maxParamWords: back-scan words for the param name (default 3)
     *   allowSingleParamFallback: accept single strong trigger (object/quoted) when no cluster (default true)
     * 
     * Quick usage notes & tuning
    Defaults: minConsecutiveParams = 2, paramWindow = 200, maxParenSpan = 200. That is conservative and works well in practice.
    If you see too few splits (remainder not detected), lower minConsecutiveParams to 1 (but expect more false starts).
    If you have very long parentheses legitimately inside prompts, increase maxParenSpan.
    Keep multiWordKeys populated with things like ["model hash","lora hashes","civitai resources","adetailer model"] so the back-scan picks friendly boundaries.

    Why this fixes your example
    For "…head out of window frame Steps: 30..." the collected words before : are ["head","out","of","window","frame","Steps"] (up to maxWords). The function looks for multi-word hints or capitalization from the leftmost token of each candidate suffix. Only Steps starts with an uppercase S. So it returns the start of the single rightmost token (Steps) — remainder will start at Steps: 30... and the negative prompt will include "head out of window frame" as you expect.
    Notes & tuning
    maxWords default 3 is reasonable; bump to 5 if you often have long param names like ADetailer model 2nd (but we use the multiWordKeys list so you can capture arbitrary multi-words regardless).
    This preserves multi-word keys when you supply multiWordKeys (lowercased strings) like "model hash", "lora hashes", "adetailer prompt".
    It keeps punctuation as a hard boundary (so "...something, Steps: 30" still splits at Steps).
    It will still treat (sweat:1.5) and <lora:...> as non-top-level because those are excluded earlier via topLevel[].

    Why this guarantees "no overlap"
Any ( opened at index < negIndex that would have remained unmatched will be autoclosed when the scanner reaches negIndex. After that index topLevel reflects that autoclose and the negative prompt scanning runs with parentheses effectively closed. So no parenthesis opened in the positive prompt can hide colons inside the negative prompt.
Tuning & notes
maxParenSpan still protects you from extremely long parentheses that should be auto-closed earlier; autocloseAt forces autoclose at the boundary regardless of span.
If you have multiple boundaries (e.g., you later want to ensure negative prompt autoclosed before "ADetailer model 2nd:"), you can pass multiple indices in autocloseAt.
Use debugAutoclose: true during development to see the debugInfo.autocloseEvents and tune maxParenSpan or your precleaning if needed.

    */
// ---------- computeTopLevelWithSoftParens ----------
static computeTopLevelWithSoftParens(s, opts = {}) {
  const N = s.length;
  const maxParenSpan = Number.isFinite(opts.maxParenSpan) ? opts.maxParenSpan : 200;
  const autocloseAt = Array.isArray(opts.autocloseAt) ? opts.autocloseAt.slice().filter(x => Number.isFinite(x) && x >= 0 && x <= N).sort((a,b)=>a-b) : [];
  const debug = !!opts.debugAutoclose;

  const topLevel = new Array(N).fill(true);
  let dq = false, sq = false;
  let brace = 0, bracket = 0, angle = 0;
  const parenStack = [];
  const autocloseEvents = [];

  function autocloseParensOpenedBefore(thresholdIndex, atIndex) {
    while (parenStack.length > 0 && parenStack[parenStack.length - 1].pos < thresholdIndex) {
      const ev = parenStack.pop();
      autocloseEvents.push({ openedAt: ev.pos, autocloseAt: atIndex });
    }
  }

  let nextAutoclosePosIndex = 0;
  const nextAutocloseBoundary = () => (nextAutoclosePosIndex < autocloseAt.length ? autocloseAt[nextAutoclosePosIndex] : null);

  for (let i = 0; i < N; i++) {
    const nxt = nextAutocloseBoundary();
    if (nxt !== null && i >= nxt) {
      autocloseParensOpenedBefore(nxt, i);
      nextAutoclosePosIndex++;
    }

    const ch = s[i];

    if ((dq || sq) && ch === '\\') { topLevel[i] = false; i++; if (i < N) topLevel[i] = false; continue; }
    if (!sq && ch === '"' && !dq) { dq = true; topLevel[i] = false; continue; }
    if (dq && ch === '"' && s[i - 1] !== '\\') { dq = false; topLevel[i] = false; continue; }
    if (!dq && ch === "'" && !sq) { sq = true; topLevel[i] = false; continue; }
    if (sq && ch === "'" && s[i - 1] !== '\\') { sq = false; topLevel[i] = false; continue; }
    if (dq || sq) { topLevel[i] = false; continue; }

    if (ch === '{') { brace++; topLevel[i] = false; continue; }
    if (ch === '}' && brace > 0) { brace--; topLevel[i] = false; continue; }
    if (ch === '[') { bracket++; topLevel[i] = false; continue; }
    if (ch === ']' && bracket > 0) { bracket--; topLevel[i] = false; continue; }
    if (ch === '<') { angle++; topLevel[i] = false; continue; }
    if (ch === '>' && angle > 0) { angle--; topLevel[i] = false; continue; }

    if (ch === '(') { parenStack.push({ pos: i }); topLevel[i] = false; continue; }
    if (ch === ')' && parenStack.length > 0) { parenStack.pop(); topLevel[i] = false; continue; }

    if (brace > 0 || bracket > 0 || angle > 0) { topLevel[i] = false; continue; }

    if (parenStack.length > 0) {
      topLevel[i] = false;
      const lastOpenPos = parenStack[parenStack.length - 1].pos;
      if (i - lastOpenPos > maxParenSpan) {
        const ev = parenStack.pop();
        autocloseEvents.push({ openedAt: ev.pos, autocloseAt: i });
      }
      continue;
    }

    topLevel[i] = true;
  }

  while (parenStack.length > 0) {
    const ev = parenStack.pop();
    autocloseEvents.push({ openedAt: ev.pos, autocloseAt: N });
  }

  const result = { topLevel };
  if (debug) result.debugInfo = { autocloseEvents, maxParenSpan, autocloseAt };
  return result;
}

// ---------- helper: core extractor that uses a provided topLevel[] ----------
static extractPromptsWithTopLevel(s, topLevel, opts = {}) {
  const N = s.length;
  const multiWordKeys = new Set((opts.multiWordKeys || []).map(k => k.toLowerCase()));
  const minConsecutiveParams = Number.isFinite(opts.minConsecutiveParams) ? opts.minConsecutiveParams : 2;
  const paramWindow = Number.isFinite(opts.paramWindow) ? opts.paramWindow : 200;
  const maxParamWords = Number.isFinite(opts.maxParamWords) ? opts.maxParamWords : 3;
  const allowSingleParamFallback = ('allowSingleParamFallback' in opts) ? !!opts.allowSingleParamFallback : true;

  const isTopLevel = idx => idx >= 0 && idx < N && !!topLevel[idx];

  function findNextTopLevelColon(from) {
    for (let i = Math.max(0, from); i < N; i++) if (s[i] === ':' && isTopLevel(i)) return i;
    return -1;
  }
  function firstNonSpaceAfter(idx) { let j = idx + 1; while (j < N && /\s/.test(s[j])) j++; return j; }
  function isCandidateTrigger(colonIdx) {
    if (colonIdx < 0 || colonIdx >= N) return false;
    if (!isTopLevel(colonIdx)) return false;
    const j = firstNonSpaceAfter(colonIdx);
    if (j >= N) return false;
    const ch = s[j];
    if (/[0-9]/.test(ch)) return true;
    if (ch === '"' || ch === "'") return true;
    if (ch === '{' || ch === '[') return true;
    return false;
  }

  const candidates = [];
  let pos = 0;
  while (true) {
    const colon = findNextTopLevelColon(pos);
    if (colon === -1) break;
    if (isCandidateTrigger(colon)) candidates.push(colon);
    pos = colon + 1;
  }

  function findCluster(cands, minCount, window) {
    for (let i = 0; i < cands.length; i++) {
      let count = 1, last = cands[i];
      for (let j = i + 1; j < cands.length && count < minCount; j++) {
        if (cands[j] - last <= window) { count++; last = cands[j]; } else break;
      }
      if (count >= minCount) return { startIdx: i, endIdx: i + count - 1 };
    }
    return null;
  }

  const cluster = findCluster(candidates, minConsecutiveParams, paramWindow);

  let chosenTriggerColon = null;
  if (cluster) chosenTriggerColon = candidates[cluster.startIdx];
  else if (allowSingleParamFallback && candidates.length > 0) {
    const strong = candidates.find(c => {
      const j = firstNonSpaceAfter(c); const ch = (j < N) ? s[j] : '';
      return ch === '{' || ch === '[' || ch === '"' || ch === "'";
    });
    chosenTriggerColon = strong || candidates[0];
  }

  function backScanParamNameStart(colonIndex, maxWords = maxParamWords) {
    let p = colonIndex - 1;
    while (p >= 0 && /\s/.test(s[p])) p--;
    if (p < 0) return 0;
    const words = [];
    let end = p;
    while (words.length < maxWords && end >= 0) {
      let start = end;
      while (start >= 0 && /[A-Za-z0-9_\-]/.test(s[start])) start--;
      start++;
      if (start > end) break;
      const token = s.slice(start, end + 1);
      words.unshift({ start, end: end + 1, token });
      let q = start - 1;
      while (q >= 0 && /\s/.test(s[q])) q--;
      if (q >= 0 && /[,\.;:(){}\[\]<>]/.test(s[q])) break;
      end = q;
    }
    if (words.length === 0) {
      let st = colonIndex - 1; while (st >= 0 && /\s/.test(s[st])) st--;
      while (st >= 0 && /[^\s,;:(){}\[\]<>]/.test(s[st])) st--;
      return Math.max(0, st + 1);
    }
    if (words.length === 1) return words[0].start;
    for (let take = words.length; take >= 2; take--) {
      const startIdx = words.length - take;
      const startPos = words[startIdx].start;
      const combo = words.slice(startIdx).map(w => w.token).join(' ').toLowerCase();
      if (multiWordKeys.has(combo) || /^adetailer\b/i.test(combo)) return startPos;
      const leftmostToken = words[startIdx].token;
      if (/^[A-Z]/.test(leftmostToken)) return startPos;
    }
    return words[words.length - 1].start;
  }

  const pm = /^\s*Prompt\s*:/i.exec(s);
  const promptStart = pm ? pm.index + pm[0].length : 0;
  const negMarkerLower = 'negative prompt:';
  const negMarkerIndex = s.toLowerCase().indexOf(negMarkerLower, promptStart);

  let promptEnd = N;
  if (negMarkerIndex !== -1 && negMarkerIndex > promptStart) {
    promptEnd = negMarkerIndex;
  } else if (chosenTriggerColon !== null && chosenTriggerColon > promptStart) {
    const keyStart = backScanParamNameStart(chosenTriggerColon, maxParamWords);
    promptEnd = keyStart;
  } else {
    promptEnd = N;
  }

  const prompt = s.slice(promptStart, promptEnd).trim().replace(/^[,;\s]+|[,;\s]+$/g, '');

  let negative = '';
  let remainder = '';
  if (negMarkerIndex !== -1 && negMarkerIndex >= promptStart) {
    const negStart = negMarkerIndex + negMarkerLower.length;
    const candidatesAfter = candidates.filter(c => c >= negStart);
    let chosenAfterNeg = null;
    if (candidatesAfter.length > 0) {
      const cl = findCluster(candidatesAfter, minConsecutiveParams, paramWindow);
      if (cl) chosenAfterNeg = candidatesAfter[cl.startIdx];
      else if (allowSingleParamFallback) {
        const strong = candidatesAfter.find(c => {
          const j = firstNonSpaceAfter(c); const ch = (j < N) ? s[j] : '';
          return ch === '{' || ch === '[' || ch === '"' || ch === "'";
        });
        chosenAfterNeg = strong || candidatesAfter[0];
      }
    }

    if (!chosenAfterNeg) {
      negative = s.slice(negStart).trim().replace(/^[,;\s]+|[,;\s]+$/g, '');
      remainder = '';
    } else {
      const keyStart = backScanParamNameStart(chosenAfterNeg, maxParamWords);
      negative = s.slice(negStart, keyStart).trim().replace(/^[,;\s]+|[,;\s]+$/g, '');
      remainder = s.slice(keyStart).trim();
    }
  } else {
    if (chosenTriggerColon !== null && chosenTriggerColon > promptEnd) {
      const keyStart = backScanParamNameStart(chosenTriggerColon, maxParamWords);
      remainder = s.slice(keyStart).trim();
      negative = '';
    } else {
      remainder = s.slice(promptEnd).trim();
      negative = '';
    }
  }

  return {
    prompt,
    negativePrompt: negative,
    remainder,
    debug: { candidates, chosenTriggerColon, cluster, negMarkerIndex }
  };
}

// ---------- top-level patched extractor with fallback ----------
static extractPromptsRobustPatched(text, opts = {}) {
  const s = String(text || '');
  const debug = !!opts.debug;
  const negIndex = s.toLowerCase().indexOf('negative prompt:');

  // 1) try a normal pass (no forced autoclose)
  const topLevelNormal = this.computeTopLevelWithSoftParens(s, { maxParenSpan: opts.maxParenSpan ?? 200, autocloseAt: [], debugAutoclose: false });
  let result = this.extractPromptsWithTopLevel(s, topLevelNormal.topLevel, opts);

  // if we found a remainder (non-empty) or no negative marker, return early
  const hasRemainder = result.remainder && result.remainder.trim().length > 0;
  if (hasRemainder || negIndex === -1 || !opts.fallbackAutoclose) {
    if (debug) result.debugInfo = { pass: 'normal', negIndex, topLevelNormalDebug: null };
    return result;
  }

  // 2) fallback: forced autoclose at negIndex (ensures parens opened in positive are closed at boundary)
  const topLevelForced = this.computeTopLevelWithSoftParens(s, { maxParenSpan: opts.maxParenSpan ?? 200, autocloseAt: [negIndex], debugAutoclose: false });
  const resultForced = this.extractPromptsWithTopLevel(s, topLevelForced.topLevel, opts);
  if (debug) {
    resultForced.debugInfo = { pass: 'forced-autoclose', negIndex, topLevelForcedDebug: null };
  }
  // prefer the forced pass only if it produced a non-empty remainder (indicating it found params)
  if (resultForced.remainder && resultForced.remainder.trim().length > 0) return resultForced;
  return result;
}
// ---------- Example usage ----------
// const out = extractPromptsRobustPatched(bigText, { multiWordKeys: ['model hash','adetailer model'], debug:true });
// console.log(out.prompt, out.negativePrompt, out.remainder, out.debug);

//HARDCODED
/**
 * Minimal extractor using a hard-coded stop-params list.
 * - Defaults: ['Steps:', 'Sampler:', 'CFG scale:', 'Seed:', 'Size:']
 * - You can pass stopParams array to override/extend.
 * - Returns: { prompt, negativePrompt, remainder }
 */
static extractPromptsHardStop(text, stopParams) {
  const s = String(text || '');
  const N = s.length;

  // ---------- helper: find main Negative prompt index using the two hints ----------
  function findMainNegativePromptIndex(s, negMarker, startPos = 0) {
    // search case-insensitive for "negative prompt:"
    // but handle the prompt case-SENSITIVE (deactivated for now)
    //const re = /negative prompt:/gi;
    const re = new RegExp(`${negMarker.toLowerCase()}`, 'gi'); // /negative prompt:/gi
    re.lastIndex = startPos;
    let m;
    while ((m = re.exec(s)) !== null) {
      const idx = m.index;
      // 1) require the original text at idx to have uppercase 'N'
      // *** disabled for now, who knows if we woudn't see a 'negative prompt:' instead of 'Negative prompt:' one day
      //if (s[idx] !== 'N') continue; // 'N'egative prompt (in 'main') vs. 'n'egative prompt (in 'ADetailer negative prompt')

      // 2) require preceding char is not letter/digit/underscore (so it's standalone)
      // *** disabled for now to support '\nNegative prompt: bla' where it is NOT found 'standalone' in the text
      //if (idx > 0 && /[A-Za-z0-9_]/.test(s[idx - 1])) continue; // normally this is a blank whitespace ' '
      
      // 3) require the value after the colon is NOT a quoted string (main negative is usually unquoted)
      // find first non-space after the ':' (which is at idx + length("negative prompt:"))
      const afterPos = idx + negMarker.length;
      let j = afterPos;
      while (j < N && /\s/.test(s[j])) j++;
      if (j < N && (s[j] === '"' || s[j] === "'")) {
        // quoted value => likely a structured field (ADetailer etc.) -> skip
        continue;
      }
      // passes all tests -> candidate is main Negative prompt
      return idx;
    }

    return -1;
  }

  // default list (can be overridden)
  const defaults = ['Steps:', 'Sampler:', 'CFG scale:', 'Seed:', 'Size:'];
  const stops = Array.isArray(stopParams) && stopParams.length ? stopParams : defaults;

  // build one regex that matches any of these tokens (case-insensitive)
  const esc = t => t.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  const pattern = stops.map(esc).join('|'); // tokens include the colon already
  const reStops = new RegExp(pattern, 'i');

  // helper: first match of reStops at or after pos
  function findStopFrom(pos) {
    const substr = s.slice(pos);
    const m = reStops.exec(substr);
    if (!m) return -1;
    return pos + m.index;
  }

  // find main Negative prompt index using careful function
  const negMarker = 'negative prompt:';
  const negIndex = findMainNegativePromptIndex(s, negMarker, 0);

  // Prompt marker handling (optional "Prompt:")
  const pm = /^\s*Prompt\s*:/i.exec(s);
  const promptStart = pm ? pm.index + pm[0].length : 0;

  // compute promptEnd
  // 1) find promptEnd: either negative marker or first stop after promptStart (if no negative)
  let promptEnd;
  if (negIndex !== -1 && negIndex > promptStart) {
    promptEnd = negIndex;
  } else {
    const stopPos = findStopFrom(promptStart);
    promptEnd = stopPos !== -1 ? stopPos : N;
  }

  const prompt = s.slice(promptStart, promptEnd).trim().replace(/^[,;\s]+|[,;\s]+$/g, '');

  // 2) negative + remainder
  let negative = '';
  let remainder = '';
  if (negIndex !== -1 && negIndex >= promptStart) {
    const negStart = negIndex + negMarker.length;
    const stopAfterNeg = findStopFrom(negStart);
    if (stopAfterNeg === -1) {
      negative = s.slice(negStart).trim().replace(/^[,;\s]+|[,;\s]+$/g, '');
      remainder = '';
    } else {
      negative = s.slice(negStart, stopAfterNeg).trim().replace(/^[,;\s]+|[,;\s]+$/g, '');
      remainder = s.slice(stopAfterNeg).trim();
    }
  } else {
    // no negative marker: if we found a stop after promptEnd, remainder starts there
    const stopAfterPrompt = findStopFrom(promptEnd);
    if (stopAfterPrompt !== -1) {
      negative = '';
      remainder = s.slice(stopAfterPrompt).trim();
    } else {
      negative = '';
      remainder = s.slice(promptEnd).trim();
    }
  }

  return { prompt, negativePrompt: negative, remainder };
}


//BALANCED
/*
Sometimes people also do “((best view))” without any weight to the emphasis, and that also easily can be misspelled as “((best view)” which would also “leave” us with an uneven open bracket count.
We need to aggressively auto-close asap as we can. Even if the “prompt” then not reflect a correct emphasis. Better this than loosing all parameters for a “stupid” forgotten round bracket “)”.
Only accept short emphasis like “(sweat:1.5)” or “(hair ribbon:1.5)” which can span over 1-3 words, with or without any weight to it.
Maybe make the logic so, that IF any round brackets are found in the text at all, they MOST close evenly BEFORE reaching the next colon “:” in the text.
That would catch a “(1girl” or “((best view)” forgotten closing bracket at a later found emphasis “(sweat:1.5)” or latest at a “real” param candidate like “Steps: 30”.

Nice call — that exact behavior you described is the right compromise: aggressively autoclose only when the parentheses truly look unclosed, but allow short, legitimate parenthetical emphasis (like (sweat:1.5)) which do close soon after the colon.
I implemented a small, focused change to the minimal-but-correct extractor: before treating a top-level colon as a candidate, when an unmatched ( exists we look ahead a short distance (configurable small window) to see whether a matching ) appears soon. If it does, we assume this colon belongs to a short, legitimate parenthetical and we ignore it as a top-level colon. If no ) appears within that window, we aggressively autoclose any unmatched ( (so the colon can be treated as top-level). This fixes the (1girl case and also handles accidental ((best view).
Important design choices (kept tiny):
We keep parenthesis handling simple but now look ahead up to peekCloseWindow = 80 characters from the colon. That’s enough to cover short emphasis like (sweat:1.5) or (hair ribbon:1.5) but not huge unclosed user errors.
If there is a ) within that window after the colon, we treat the colon as inside parentheses (do not autoclose). If not, we autoclose immediately (pop paren stack) — better to lose a bit of emphasis than to lose all parameters.
All other behavior from your minimal-but-correct extractor is preserved (top-level detection, capitalization hint, 2-param cluster detection).

Why this fixes the (1girl and ((best view) problems
At a colon, if there was an unmatched ( before it, we peek ahead up to ~80 chars to see whether that ( will be closed soon. If it will be closed, the colon is within a short parenthetical and we skip it as a top-level colon. If it will not be closed within that window, we aggressively autoclose (i.e., we treat the colon as top-level) so that the prompt/negative split is allowed and remainder is not lost.
This keeps short emphasis like (sweat:1.5) protected, while preventing long-unclosed ( from blocking parameter detection.
If you want any micro-tuning:
Increase peekCloseWindow if you have legitimate parentheticals longer than ~80 chars.
Or add an extra check to only autoclose when the unmatched '(' count is small (e.g., 1 or 2) — but current aggressive behavior matches your "close asap" request.
If you paste the exact failing sample(s) you saw, I’ll quickly sanity-check them against this function. Otherwise — nice win: we now aggressively protect against unclosed parentheses while still allowing legitimate short parenthetical emphasis.
*/
static extractPromptsMinimalButRobust_v3(text) {
  const s = String(text || '');
  const N = s.length;

  // ---------- helper: find main Negative prompt index using the two hints ----------
  function findMainNegativePromptIndex(s, negMarker, startPos = 0) {
    // search case-insensitive for "negative prompt:"
    // but handle the prompt case-SENSITIVE (deactivated for now)
    //const re = /negative prompt:/gi;
    const re = new RegExp(`${negMarker.toLowerCase()}`, 'gi'); // /negative prompt:/gi
    re.lastIndex = startPos;
    let m;
    while ((m = re.exec(s)) !== null) {
      const idx = m.index;
      // 1) require the original text at idx to have uppercase 'N'
      // *** disabled for now, who knows if we woudn't see a 'negative prompt:' instead of 'Negative prompt:' one day
      //if (s[idx] !== 'N') continue; // 'N'egative prompt (in 'main') vs. 'n'egative prompt (in 'ADetailer negative prompt')

      // 2) require preceding char is not letter/digit/underscore (so it's standalone)
      // *** disabled for now to support '\nNegative prompt: bla' where it is NOT found 'standalone' in the text
      //if (idx > 0 && /[A-Za-z0-9_]/.test(s[idx - 1])) continue; // normally this is a blank whitespace ' '

      // 3) require the value after the colon is NOT a quoted string (main negative is usually unquoted)
      // find first non-space after the ':' (which is at idx + length("negative prompt:"))
      const afterPos = idx + negMarker.length;
      let j = afterPos;
      while (j < N && /\s/.test(s[j])) j++;
      if (j < N && (s[j] === '"' || s[j] === "'")) {
        // quoted value => likely a structured field (ADetailer etc.) -> skip
        continue;
      }
      // passes all tests -> candidate is main Negative prompt
      return idx;
    }

    return -1;
  }

  // ---------- tiny top-level map: quotes, {}, [], <>, () (no autoclose here) ----------
  const topLevel = new Array(N).fill(true);
  let dq = false, sq = false, brace = 0, bracket = 0, angle = 0, paren = 0;
  for (let i = 0; i < N; i++) {
    const ch = s[i];
    if ((dq || sq) && ch === '\\') { topLevel[i] = false; i++; if (i < N) topLevel[i] = false; continue; }
    if (!sq && ch === '"' && !dq) { dq = true; topLevel[i] = false; continue; }
    if (dq && ch === '"' && s[i - 1] !== '\\') { dq = false; topLevel[i] = false; continue; }
    if (!dq && ch === "'" && !sq) { sq = true; topLevel[i] = false; continue; }
    if (sq && ch === "'" && s[i - 1] !== '\\') { sq = false; topLevel[i] = false; continue; }
    if (dq || sq) { topLevel[i] = false; continue; }

    if (ch === '{') { brace++; topLevel[i] = false; continue; }
    if (ch === '}' && brace > 0) { brace--; topLevel[i] = false; continue; }
    if (ch === '[') { bracket++; topLevel[i] = false; continue; }
    if (ch === ']' && bracket > 0) { bracket--; topLevel[i] = false; continue; }
    if (ch === '<') { angle++; topLevel[i] = false; continue; }
    if (ch === '>' && angle > 0) { angle--; topLevel[i] = false; continue; }

    if (ch === '(') { paren++; topLevel[i] = false; continue; }
    if (ch === ')' && paren > 0) { paren--; topLevel[i] = false; continue; }

    topLevel[i] = (brace === 0 && bracket === 0 && angle === 0 && paren === 0 && !dq && !sq);
  }

  const isTopLevel = idx => idx >= 0 && idx < N && topLevel[idx];

  // small helpers
  const firstNonSpaceAfter = i => { let j = i + 1; while (j < N && /\s/.test(s[j])) j++; return j; };
  const firstNonSpaceBefore = i => { let j = i - 1; while (j >= 0 && /\s/.test(s[j])) j--; return j; };

  // collect candidate colons that are top-level and value starts with number/quote/{/[
  const candidates = [];
  for (let pos = 0;;) {
    const i = s.indexOf(':', pos);
    if (i === -1) break;

    // Before deciding, detect if there is likely an unmatched '(' before i that we should peek/auto-close
    // (This snippet is intentionally compact and re-scans the prefix; it's cheap for prompt-sized strings.)
    const before = s.slice(0, i);
    const openCount = (before.match(/\(/g) || []).length;
    const closeCount = (before.match(/\)/g) || []).length;
    const unmatchedBefore = openCount - closeCount;

    if (unmatchedBefore > 0) {
      // Peek ahead a short window to see if there's a close soon; if not, we treat colon as top-level (autoclose)
      const peekCloseWindow = 80;
      const lookEnd = Math.min(N, i + peekCloseWindow);
      const ahead = s.slice(i + 1, lookEnd);
      const hasCloseSoon = ahead.indexOf(')') !== -1;
      if (hasCloseSoon) {
        // colon is still inside a soon-closing parenthetical -> skip it
        pos = i + 1;
        continue;
      }
      // otherwise we aggressively treat it as top-level (autoclose semantics)
    }

    if (isTopLevel(i) || unmatchedBefore > 0 /* we decided to autoclose */) {
      const j = firstNonSpaceAfter(i);
      if (j < N) {
        const ch = s[j];
        if (/[0-9"'\{\[]/.test(ch)) candidates.push(i);
      }
    }
    pos = i + 1;
  }

  // require 2 consecutive candidates within 200 chars
  let triggerColon = null;
  for (let k = 0; k + 1 < candidates.length; k++) {
    if (candidates[k + 1] - candidates[k] <= 200) { triggerColon = candidates[k]; break; }
  }

  // improved param name backscan: rightmost token before colon must start uppercase to qualify
  const paramNameStart = (colonIdx) => {
    let p = firstNonSpaceBefore(colonIdx);
    if (p < 0) return 0;
    let start = p;
    while (start >= 0 && /[A-Za-z0-9_\-]/.test(s[start])) start--;
    start++;
    const ch = s[start];
    if (ch && /[A-Z]/.test(ch)) return start;
    return null;
  };

  // find main Negative prompt index using careful function
  const negMarker = 'negative prompt:';
  const negIndex = findMainNegativePromptIndex(s, negMarker, 0);

  // Prompt marker handling (optional "Prompt:")
  const pm = /^\s*Prompt\s*:/i.exec(s);
  const promptStart = pm ? pm.index + pm[0].length : 0;

  // compute promptEnd
  // 1) find promptEnd: either negative marker or first stop after promptStart (if no negative)
  let promptEnd;
  if (negIndex !== -1 && negIndex > promptStart) {
    promptEnd = negIndex;
  } else if (triggerColon !== null && triggerColon > promptStart) {
    const ks = paramNameStart(triggerColon);
    promptEnd = ks !== null ? ks : N;
  } else {
    promptEnd = N;
  }

  const prompt = s.slice(promptStart, promptEnd).trim().replace(/^[,;\s]+|[,;\s]+$/g, '');

  // 2) negative + remainder
  // negative and remainder extraction
  let negative = '', remainder = '';
  if (negIndex !== -1 && negIndex >= promptStart) {
    const negStart = negIndex + negMarker.length;
    // find pair after negStart
    let triggerAfter = null;
    for (let k = 0; k + 1 < candidates.length; k++) {
      if (candidates[k] >= negStart && candidates[k + 1] - candidates[k] <= 200) { triggerAfter = candidates[k]; break; }
    }
    if (!triggerAfter) {
      negative = s.slice(negStart).trim().replace(/^[,;\s]+|[,;\s]+$/g, '');
      remainder = '';
    } else {
      const ks = paramNameStart(triggerAfter);
      if (ks === null) {
        negative = s.slice(negStart).trim().replace(/^[,;\s]+|[,;\s]+$/g, '');
        remainder = '';
      } else {
        negative = s.slice(negStart, ks).trim().replace(/^[,;\s]+|[,;\s]+$/g, '');
        remainder = s.slice(ks).trim();
      }
    }
  } else {
    // no main negative found
    if (triggerColon !== null && triggerColon > promptEnd) {
      const ks = paramNameStart(triggerColon);
      if (ks !== null) {
        negative = '';
        remainder = s.slice(ks).trim();
      } else {
        negative = '';
        remainder = s.slice(promptEnd).trim();
      }
    } else {
      negative = '';
      remainder = s.slice(promptEnd).trim();
    }
  }

  return { prompt, negativePrompt: negative, remainder };
}


   //WORKSFINE??
    static extractTextPromptsAndRemainder(text, opts = {}) {
        // testing quoted text
        //text = "the man holds a sign with the text \"FLUX\" over his head. " + text;
        //text = text.replace("(1girl", "1girl");  // remove un-even bracket
        const s = String(text || '');
        const N = s.length;
        const multiWordKeys = new Set((opts.multiWordKeys || []).map(k => k.toLowerCase()));
        const maxParenSpan = Number.isFinite(opts.maxParenSpan) ? opts.maxParenSpan : 200;
        const minConsecutiveParams = Number.isFinite(opts.minConsecutiveParams) ? opts.minConsecutiveParams : 2;
        const paramWindow = Number.isFinite(opts.paramWindow) ? opts.paramWindow : 200;
        const maxParamWords = Number.isFinite(opts.maxParamWords) ? opts.maxParamWords : 3;
        const allowSingleParamFallback = ('allowSingleParamFallback' in opts) ? !!opts.allowSingleParamFallback : true;

        // ---------- 1) build topLevel[] with soft parens ----------
        const topLevel = new Array(N).fill(true);
        let dq = false; // inside double quote
        let sq = false; // inside single quote
        let brace = 0, bracket = 0, angle = 0;
        const parenStack = [];
        for (let i = 0; i < N; i++) {
            const ch = s[i];
            // escapes inside quotes
            if ((dq || sq) && ch === '\\') { topLevel[i] = false; i++; if (i < N) topLevel[i] = false; continue; }
            // quotes (strict)
            if (!sq && ch === '"' && !dq) { dq = true; topLevel[i] = false; continue; }
            if (dq && ch === '"' && s[i - 1] !== '\\') { dq = false; topLevel[i] = false; continue; }
            if (!dq && ch === "'" && !sq) { sq = true; topLevel[i] = false; continue; }
            if (sq && ch === "'" && s[i - 1] !== '\\') { sq = false; topLevel[i] = false; continue; }

            if (dq || sq) { topLevel[i] = false; continue; } // inside quotes — ignore bracket state

            // strict containers
            if (ch === '{') { brace++; topLevel[i] = false; continue; }
            if (ch === '}' && brace > 0) { brace--; topLevel[i] = false; continue; }
            if (ch === '[') { bracket++; topLevel[i] = false; continue; }
            if (ch === ']' && bracket > 0) { bracket--; topLevel[i] = false; continue; }
            if (ch === '<') { angle++; topLevel[i] = false; continue; }
            if (ch === '>' && angle > 0) { angle--; topLevel[i] = false; continue; }

            // parentheses - soft
            if (ch === '(') { parenStack.push(i); topLevel[i] = false; continue; }
            if (ch === ')' && parenStack.length > 0) { parenStack.pop(); topLevel[i] = false; continue; }

            // if inside strict container -> not top-level
            if (brace > 0 || bracket > 0 || angle > 0) { topLevel[i] = false; continue; }

            // if inside a parenthesis, mark non-top-level but auto-close if span too large
            if (parenStack.length > 0) {
                topLevel[i] = false;
                const lastOpen = parenStack[parenStack.length - 1];
                if (i - lastOpen > maxParenSpan) {
                    parenStack.pop(); // autoclose oldest
                    // after popping current char remains non-top-level; subsequent chars are outside that paren
                }

                continue;
            }

            // otherwise top-level true
            topLevel[i] = true;
        }
        // leftover '(' will just remain unmatched; we intentionally do not retroactively mark earlier chars

        const isTopLevel = idx => idx >= 0 && idx < N && topLevel[idx];

        // ---------- helpers to find candidate colon triggers ----------
        function findNextTopLevelColon(from) {
            for (let i = Math.max(0, from); i < N; i++) if (s[i] === ':' && topLevel[i]) return i;

            return -1;
        }
        function firstNonSpaceAfter(idx) {
            let j = idx + 1;
            while (j < N && /\s/.test(s[j])) j++;

            return j;
        }
        function isCandidateTrigger(colonIdx) {
            if (colonIdx < 0 || colonIdx >= N) return false;
            if (!isTopLevel(colonIdx)) return false;

            const j = firstNonSpaceAfter(colonIdx);
            if (j >= N) return false;
            const ch = s[j];
            if (/[0-9]/.test(ch)) return true; // number
            if (ch === '"' || ch === "'") return true; // quoted string
            if (ch === '{' || ch === '[') return true; // object/array

            return false;
        }

        // gather candidate colon indices
        const candidates = [];
        let pos = 0;
        while (true) {
            const colon = findNextTopLevelColon(pos);
            if (colon === -1) break;
            if (isCandidateTrigger(colon)) candidates.push(colon);
            pos = colon + 1;
        }

        // cluster finder: minConsecutiveParams within paramWindow
        function findCluster(cands, minCount, window) {
            for (let i = 0; i < cands.length; i++) {
                let count = 1, last = cands[i];
                for (let j = i + 1; j < cands.length && count < minCount; j++) {
                    if (cands[j] - last <= window) { count++; last = cands[j]; } else break;
                }
                if (count >= minCount) return { startIdx: i, endIdx: i + count - 1 };
            }

            return null;
        }

        const cluster = findCluster(candidates, minConsecutiveParams, paramWindow);

        // fallback single strong trigger (quoted/object) if allowed
        let chosenTriggerColon = null;
        if (cluster) chosenTriggerColon = candidates[cluster.startIdx];
        else if (allowSingleParamFallback && candidates.length > 0) {
            const strong = candidates.find(c => {
                const j = firstNonSpaceAfter(c);
                const ch = (j < N) ? s[j] : '';

                return ch === '{' || ch === '[' || ch === '"' || ch === "'";
            });

            chosenTriggerColon = strong || candidates[0];
        }

        // Improved back-scan: include the rightmost token (param) and
        // extend left only through tokens that start with UPPERCASE or match multiWordKeys hint.
        // Stops at punctuation or when preceding word starts lowercase (unless multiWordKeys match).
        function backScanParamNameStart(colonIndex, maxWords = 3) {
            // move left to the last non-space character before colon
            let p = colonIndex - 1;
            while (p >= 0 && /\s/.test(s[p])) p--;
            if (p < 0) return 0;

            // collect up to maxWords words going left
            const words = [];
            let end = p;
            while (words.length < maxWords && end >= 0) {
                // find start of this word (letters/digits/_-)
                let start = end;
                while (start >= 0 && /[A-Za-z0-9_\-]/.test(s[start])) start--;
                start++;
                if (start > end) break; // no word found
                const token = s.slice(start, end + 1);
                words.unshift({ start, end: end + 1, token });
                // prepare next word: skip spaces left of this word
                let q = start - 1;
                while (q >= 0 && /\s/.test(s[q])) q--;
                // stop if punctuation directly before (hard boundary)
                if (q >= 0 && /[,\.;:(){}\[\]<>]/.test(s[q])) {
                    break;
                }

                end = q;
            }

            if (words.length === 0) {
                // fallback: take a safe single-word start
                let st = colonIndex - 1; while (st >= 0 && /\s/.test(s[st])) st--;
                while (st >= 0 && /[^\s,;:(){}\[\]<>]/.test(s[st])) st--;
                return Math.max(0, st + 1);
            }

            // If only one word -> param name is that word's start
            if (words.length === 1) return words[0].start;

            // Try to find the *longest* suffix of the collected words which:
            //  - either matches multiWordKeys (case-insensitive)
            //  - or whose leftmost word starts with uppercase letter (so we allow "Model hash")
            // Otherwise, fallback to only the rightmost word (param token itself).
            for (let take = words.length; take >= 2; take--) {
                const startIdx = words.length - take;
                const startPos = words[startIdx].start;
                const combo = words.slice(startIdx).map(w => w.token).join(' ').toLowerCase();

                // if the combination matches a provided multiWordKey, accept it
                if (multiWordKeys.has(combo) || /^adetailer\b/i.test(combo)) {
                    return startPos;
                }

                // otherwise check capitalization hint: leftmost token of this candidate
                const leftmostToken = words[startIdx].token;
                if (/^[A-Z]/.test(leftmostToken)) {
                    return startPos;
                }
            }

            // no multi-word match and no capitalization hint -> use only the rightmost (param) token
            return words[words.length - 1].start;
        }

        // ---------- compute prompt & negative & remainder ----------
        const pm = /^\s*Prompt\s*:/i.exec(s);
        const promptStart = pm ? pm.index + pm[0].length : 0;
        const negMarkerLower = 'negative prompt:';
        const negMarkerIndex = s.toLowerCase().indexOf(negMarkerLower, promptStart);

        // promptEnd: negative marker or chosen trigger before promptStart
        let promptEnd = N;
        if (negMarkerIndex !== -1 && negMarkerIndex > promptStart) {
            promptEnd = negMarkerIndex;
        } else if (chosenTriggerColon !== null && chosenTriggerColon > promptStart) {
            const keyStart = backScanParamNameStart(chosenTriggerColon, maxParamWords);
            promptEnd = keyStart;
        } else {
            promptEnd = N;
        }

        const prompt = s.slice(promptStart, promptEnd).trim().replace(/^[,;\s]+|[,;\s]+$/g, '');

        let negative = '';
        let remainder = '';
        if (negMarkerIndex !== -1 && negMarkerIndex >= promptStart) {
            const negStart = negMarkerIndex + negMarkerLower.length;
            // find chosen trigger AFTER negStart (not any earlier chosenTriggerColon)
            const candidatesAfter = candidates.filter(c => c >= negStart);
            let chosenAfterNeg = null;
            if (candidatesAfter.length > 0) {
                const cl = findCluster(candidatesAfter, minConsecutiveParams, paramWindow);
                if (cl) chosenAfterNeg = candidatesAfter[cl.startIdx];
                else if (allowSingleParamFallback) {
                    // pick strong or first
                    const strong = candidatesAfter.find(c => {
                        const j = firstNonSpaceAfter(c); const ch = (j < N) ? s[j] : '';
                        
                        return ch === '{' || ch === '[' || ch === '"' || ch === "'";
                    });

                    chosenAfterNeg = strong || candidatesAfter[0];
                }
            }

            if (!chosenAfterNeg) {
                negative = s.slice(negStart).trim().replace(/^[,;\s]+|[,;\s]+$/g, '');
                remainder = '';
            } else {
                const keyStart = backScanParamNameStart(chosenAfterNeg, maxParamWords);
                negative = s.slice(negStart, keyStart).trim().replace(/^[,;\s]+|[,;\s]+$/g, '');
                remainder = s.slice(keyStart).trim();
            }
        } else {
            // no negative: if chosen trigger after promptEnd then remainder starts there
            if (chosenTriggerColon !== null && chosenTriggerColon > promptEnd) {
                const keyStart = backScanParamNameStart(chosenTriggerColon, maxParamWords);
                remainder = s.slice(keyStart).trim();
                negative = '';
            } else {
                remainder = s.slice(promptEnd).trim();
                negative = '';
            }
        }

        return { prompt, negativePrompt: negative, remainder };
    }

static extractTextPromptsAndRemainder_work(text, opts = {}) {
    text = text.replace("(1girl", "1girl"); //BUG-FIX
    
    const s = String(text || '');

    const N = s.length;
    const multiWordKeys = new Set(((opts.multiWordKeys)||[]).map(k => k.toLowerCase()));

    // ---------- precompute topLevel[] ----------
    const topLevel = new Array(N).fill(true);
    let dq = false, sq = false;
    let paren = 0, brace = 0, bracket = 0, angle = 0;
    for (let i = 0; i < N; i++) {
        const ch = s[i];
        if ((dq || sq) && ch === '\\') { topLevel[i] = false; i++; if (i<N) topLevel[i]=false; continue; }
        if (!sq && ch === '"' && !dq) { dq = true; topLevel[i]=false; continue; }
        if (dq && ch === '"' && s[i-1] !== '\\') { dq = false; topLevel[i]=false; continue; }
        if (!dq && ch === "'" && !sq) { sq = true; topLevel[i]=false; continue; }
        if (sq && ch === "'" && s[i-1] !== '\\') { sq = false; topLevel[i]=false; continue; }
        if (dq || sq) { topLevel[i] = false; continue; }

        if (ch === '(') { paren++; topLevel[i]=false; continue; }
        if (ch === ')' && paren>0) { paren--; topLevel[i]=false; continue; }
        if (ch === '{') { brace++; topLevel[i]=false; continue; }
        if (ch === '}' && brace>0) { brace--; topLevel[i]=false; continue; }
        if (ch === '[') { bracket++; topLevel[i]=false; continue; }
        if (ch === ']' && bracket>0) { bracket--; topLevel[i]=false; continue; }
        if (ch === '<') { angle++; topLevel[i]=false; continue; }
        if (ch === '>' && angle>0) { angle--; topLevel[i]=false; continue; }

        topLevel[i] = (paren===0 && brace===0 && bracket===0 && angle===0);
    }

    const prefixNonTop = new Uint32Array(N+1);
    for (let i=0;i<N;i++) prefixNonTop[i+1] = prefixNonTop[i] + (topLevel[i] ? 0 : 1);

    function isTopLevelBetween(a,b) {
        if (a>=b) return true;
        a = Math.max(0,a); b = Math.min(N,b);
        return (prefixNonTop[b] - prefixNonTop[a]) === 0;
    }

    function findNextTopLevelColon(from) {
        for (let i = Math.max(0,from); i < N; i++) if (s[i] === ':' && topLevel[i]) return i;
        return -1;
    }

    // Compute key before colon (max 3 words), with multi-word hints
    function computeKeyBeforeColon(colonIndex, maxWords = 3) {
        let j = colonIndex - 1;
        while (j >=0 && /\s/.test(s[j])) j--;
        if (j<0) return null;

        const tokens = [];
        let scanPos = j;
        for (let t=0;t<maxWords && scanPos>=0;t++) {
            let tokEnd = scanPos;
            let tokStart = tokEnd;
            while (tokStart>=0 && /[A-Za-z0-9_\-]/.test(s[tokStart])) tokStart--;
            tokStart++;
            if (tokStart>tokEnd) break;
            tokens.unshift({ token: s.slice(tokStart,tokEnd+1), start: tokStart, end: tokEnd+1 });
            scanPos = tokStart-1;
            while (scanPos>=0 && /\s/.test(s[scanPos])) scanPos--;
        }
        if (tokens.length===0) return null;
        const toksLower = tokens.map(x => x.token.toLowerCase());
        for (let take = tokens.length; take>=1; take--) {
            const startIdx = tokens.length-take;
            const cand = toksLower.slice(startIdx).join(' ');
            if (multiWordKeys.has(cand) || /^adetailer\b/.test(cand)) {
                return { keyStart: tokens[startIdx].start, keyName: cand, tokenCount: take };
            }
        }
        const last = tokens[tokens.length-1];
        return { keyStart: last.start, keyName: last.token, tokenCount:1 };
    }

    // Check if colon triggers a top-level parameter
    function isTopLevelParam(colonIndex) {
        if (!topLevel[colonIndex]) return false;

        // Skip spaces to next char
        let k = colonIndex+1;
        while (k<N && /\s/.test(s[k])) k++;
        if (k>=N) return false;
        const ch = s[k];

        // number or quoted string
        if (/[0-9]/.test(ch)) return true;
        if (ch === '"' || ch === "'") return true;

        // JSON object or list
        if (ch === '{' || ch === '[') return true;

        return false;
    }

    // ---------- extract positive prompt ----------
    const pm = /^\s*Prompt\s*:/i.exec(s);
    const promptStart = pm ? pm.index + pm[0].length : 0;
    const negMarkerLower = 'negative prompt:';
    const negMarkerIndex = s.toLowerCase().indexOf(negMarkerLower, promptStart);

    let promptEnd;
    if (negMarkerIndex !== -1 && negMarkerIndex > promptStart) {
        promptEnd = negMarkerIndex;
    } else {
        // search first top-level colon after prompt start
        let colon = findNextTopLevelColon(promptStart);
        while(colon!==-1 && !isTopLevelParam(colon)) colon = findNextTopLevelColon(colon+1);
        promptEnd = colon!==-1 ? computeKeyBeforeColon(colon).keyStart : N;
    }
    const prompt = s.slice(promptStart,promptEnd).trim().replace(/^[,;\s]+|[,;\s]+$/g, '');

    // ---------- extract negative prompt ----------
    let negative = '';
    let remainder = '';
    if (negMarkerIndex!==-1) {
        const negStart = negMarkerIndex + negMarkerLower.length;
        // find first top-level param colon after negStart
        let colon = findNextTopLevelColon(negStart);
        while(colon!==-1 && !isTopLevelParam(colon)) colon = findNextTopLevelColon(colon+1);
        if (colon===-1) {
            negative = s.slice(negStart).trim().replace(/^[,;\s]+|[,;\s]+$/g,'');
            remainder = '';
        } else {
            const keyInfo = computeKeyBeforeColon(colon);
            negative = s.slice(negStart,keyInfo.keyStart).trim().replace(/^[,;\s]+|[,;\s]+$/g,'');
            remainder = s.slice(keyInfo.keyStart).trim();
        }
    } else {
        remainder = s.slice(promptEnd).trim();
    }

    return { prompt, negativePrompt: negative, remainder };
}

//REMOVE AFTER TESTING
static extractTextPromptsAndRemainder_Simple_not_work(text) {
    const result = {
        prompt: '',
        negativePrompt: '',
        remainder: ''
    };

    // --- 1️⃣ Positive Prompt ---
    // Start from "Prompt:" keyword (optional) or beginning of text
    const posRe = /^(?:Prompt:\s*)?([\s\S]*?)(?=Negative prompt:|$)/i;
    const posMatch = text.match(posRe);
    if (posMatch) {
        result.prompt = posMatch[1].trim().replace(/,+\s*$/, '');
        text = text.slice(posMatch[0].length); // remove positive prompt from remaining text
    }

    // --- 2️⃣ Negative Prompt ---
    const negRe = /Negative prompt:\s*/i;
    const negIndex = text.search(negRe);
    if (negIndex !== -1) {
        // everything after "Negative prompt:"
        let negStart = negIndex + text.match(negRe)[0].length;
        let negText = text.slice(negStart);

        // Find first top-level colon indicating a param
        const colonMatch = negText.match(/:(?=\s*(?:-?\d|["'{\[<]))/); 
        let negEnd = colonMatch ? colonMatch.index : negText.length;

        result.negativePrompt = negText.slice(0, negEnd).trim().replace(/,+\s*$/, '');

        // remainder starts at negEnd
        result.remainder = negText.slice(negEnd).trim();
    } else {
        // no negative prompt
        result.remainder = text.trim();
    }

    return result;
}

//REMOVE AFTER TESTING
static extractTextPromptsAndRemainder_work_but_not_remainder(text, opts = {}) {
  const s = String(text || '');
  const N = s.length;
  const multiWordKeys = new Set(((opts.multiWordKeys)||[]).map(k => k.toLowerCase()));

  // ---------- precompute topLevel[] ----------
  const topLevel = new Array(N).fill(true);
  let dq = false, sq = false;
  let paren = 0, brace = 0, bracket = 0, angle = 0;
  for (let i = 0; i < N; i++) {
    const ch = s[i];
    if ((dq || sq) && ch === '\\') { topLevel[i] = false; i++; if (i<N) topLevel[i]=false; continue; }
    if (!sq && ch === '"' && !dq) { dq = true; topLevel[i]=false; continue; }
    if (dq && ch === '"' && s[i-1] !== '\\') { dq = false; topLevel[i]=false; continue; }
    if (!dq && ch === "'" && !sq) { sq = true; topLevel[i]=false; continue; }
    if (sq && ch === "'" && s[i-1] !== '\\') { sq = false; topLevel[i]=false; continue; }
    if (dq || sq) { topLevel[i] = false; continue; }

    if (ch === '(') { paren++; topLevel[i]=false; continue; }
    if (ch === ')' && paren>0) { paren--; topLevel[i]=false; continue; }
    if (ch === '{') { brace++; topLevel[i]=false; continue; }
    if (ch === '}' && brace>0) { brace--; topLevel[i]=false; continue; }
    if (ch === '[') { bracket++; topLevel[i]=false; continue; }
    if (ch === ']' && bracket>0) { bracket--; topLevel[i]=false; continue; }
    if (ch === '<') { angle++; topLevel[i]=false; continue; }
    if (ch === '>' && angle>0) { angle--; topLevel[i]=false; continue; }

    topLevel[i] = (paren===0 && brace===0 && bracket===0 && angle===0);
  }
  const prefixNonTop = new Uint32Array(N+1);
  for (let i=0;i<N;i++) prefixNonTop[i+1] = prefixNonTop[i] + (topLevel[i] ? 0 : 1);

  function isTopLevelBetween(a,b) {
    if (a>=b) return true;
    a = Math.max(0,a); b = Math.min(N,b);
    return (prefixNonTop[b] - prefixNonTop[a]) === 0;
  }
  function findNextTopLevelColon(from) {
    for (let i = Math.max(0,from); i < N; i++) if (s[i] === ':' && topLevel[i]) return i;
    return -1;
  }

  // compute key tokens before colon (multi-word override possible)
  function computeKeyBeforeColon(colonIndex, fragmentStart = 0, maxTokens=6) {
    let j = colonIndex - 1;
    while (j >= fragmentStart && /\s/.test(s[j])) j--;
    if (j < fragmentStart) return null;
    const tokens = [];
    let scanPos = j;
    for (let t=0; t<maxTokens && scanPos>=fragmentStart;) {
      let tokEnd = scanPos;
      let tokStart = tokEnd;
      while (tokStart >= fragmentStart && /[A-Za-z0-9_\-]/.test(s[tokStart])) tokStart--;
      tokStart++;
      if (tokStart > tokEnd) break;
      tokens.unshift({ token: s.slice(tokStart, tokEnd+1), start: tokStart, end: tokEnd+1 });
      scanPos = tokStart - 1;
      while (scanPos >= fragmentStart && /\s/.test(s[scanPos])) scanPos--;
    }
    if (tokens.length === 0) return null;
    const toksLower = tokens.map(x => x.token.toLowerCase());
    for (let take = tokens.length; take>=1; take--) {
      const startIdx = tokens.length - take;
      const cand = toksLower.slice(startIdx).join(' ');
      if (multiWordKeys.has(cand) || /^adetailer\b/.test(cand)) {
        return { keyStart: tokens[startIdx].start, keyName: cand, tokenCount: take };
      }
    }
    const last = tokens[tokens.length-1];
    return { keyStart: last.start, keyName: last.token.toLowerCase(), tokenCount: 1 };
  }

  // NEW: decide whether a colon+key is likely a param (not running text)
  function isLikelyParam(colonIndex, keyStart) {
    // 1) if key is in override multiWordKeys or ADetailer -> yes
    const keyInfo = computeKeyBeforeColon(colonIndex, Math.max(0, keyStart-100), 6);
    if (!keyInfo) return false;
    if (multiWordKeys.has(keyInfo.keyName) || /^adetailer\b/.test(keyInfo.keyName)) return true;

    // 2) look at next non-space char after colon
    let k = colonIndex + 1;
    while (k < N && /\s/.test(s[k])) k++;
    if (k >= N) return false;
    const ch = s[k];

    // value starts with digits/quotes/braces/brackets/angle -> likely param
    if (/[0-9"'\{\[\<]/.test(ch)) return true;

    // starts with uppercase letter (Model names often are TitleCase) -> likely param
    if (/[A-Z]/.test(ch)) return true;

    // heuristic: if the next ~60 chars contain ", <SomeToken>:" sequence (another param soon),
    // it's likely we're inside a param-list (key: val, NextKey: ...), so accept.
    const slice = s.slice(k, Math.min(N, k + 120));
    if (/[,]\s*[A-Za-z0-9_\-]{2,50}\s*:/.test(slice)) return true;

    // otherwise, it's probably running text ("features: long..." => reject)
    return false;
  }

  // find first param (colon+key) after start that passes isLikelyParam
  function findFirstParamAfter(startIndex) {
    let pos = Math.max(0, startIndex);
    while (pos < N) {
      const colon = findNextTopLevelColon(pos);
      if (colon === -1) return null;
      const ki = computeKeyBeforeColon(colon, startIndex, 6);
      if (ki && ki.keyStart >= startIndex && isLikelyParam(colon, ki.keyStart)) {
        return { colon, keyStart: ki.keyStart, keyName: ki.keyName };
      }
      pos = colon + 1;
    }
    return null;
  }

  // ---------- now extract prompt and negative using the improved finder ----------
  const pm = /^\s*Prompt\s*:/i.exec(s);
  const promptStart = pm ? pm.index + pm[0].length : 0;
  const negMarkerLower = 'negative prompt:';
  const negMarkerIndex = s.toLowerCase().indexOf(negMarkerLower, promptStart);

  let promptEnd;
  if (negMarkerIndex !== -1 && negMarkerIndex > promptStart) {
    promptEnd = negMarkerIndex;
  } else {
    const param = findFirstParamAfter(promptStart);
    promptEnd = param ? param.keyStart : N;
  }
  const prompt = s.slice(promptStart, promptEnd).trim().replace(/^[,;\s]+|[,;\s]+$/g, '');

  // negative
  let negative = '';
  let remainder = s;
  if (negMarkerIndex !== -1 && negMarkerIndex >= promptStart) {
    const negContentStart = negMarkerIndex + negMarkerLower.length;
    const paramAfterNeg = findFirstParamAfter(negContentStart);
    if (!paramAfterNeg) {
      negative = s.slice(negContentStart).trim().replace(/^[,;\s]+|[,;\s]+$/g, '');
      remainder = s.slice(0, negMarkerIndex);
    } else {
      const keyStart = paramAfterNeg.keyStart;
      let p = keyStart - 1;
      while (p >= negContentStart && /\s/.test(s[p])) p--;
      if (p >= negContentStart && s[p] === ',' && isTopLevelBetween(negContentStart, p)) {
        negative = s.slice(negContentStart, p).trim().replace(/^[,;\s]+|[,;\s]+$/g, '');
        remainder = s.slice(0, negMarkerIndex) + s.slice(p);
      } else {
        negative = s.slice(negContentStart, keyStart).trim().replace(/^[,;\s]+|[,;\s]+$/g, '');
        remainder = s.slice(0, negMarkerIndex) + s.slice(keyStart);
      }
    }
  } else {
    remainder = s.slice(promptEnd);
  }

  // cleanup
  remainder = remainder.replace(/^\s*Prompt\s*:\s*/i, '').trim();
  remainder = remainder.replace(/^[,;:\s]+/, '');

  return { prompt, negativePrompt: negative, remainder };
}

// get COMMENTS and REMOVE
static extractTextPromptsAndRemainder_with_Comments(text, opts = {}) {
  const s = String(text || '');
  const N = s.length;

  // optional multi-word keys (lowercase). Extend if you want known multi-word keys
  // BEHAVE like single-word keys. Can be extended also to 1-word, 3-word keys
  // e.g. ['model hash', 'lora hashes', 'adetailer dilate erode', ...]
  const multiWordKeys = new Set((opts.multiWordKeys || [
    'model hash',
    'lora hashes',
    'ti hashes',
    'civitai resources'
  ]).map(k => k.toLowerCase()));

  // ---------- low-level scanner helpers ----------
// Determine top-levelness by scanning bracket/quote depths between fromIndex (inclusive) and toIndex (exclusive).
// strict top-level check between two indices (exclusive end)
  function findNextTopLevelColonFrom(start) {
    // returns index of next ':' at top-level, or -1
    let dq = false; // inside double quote
    let sq = false; // inside single quote
    let paren = 0, brace = 0, bracket = 0, angle = 0;
    for (let i = start; i < N; i++) {
      const ch = s[i];
      if ((dq || sq) && ch === '\\') { i++; continue; } // skip escaped char inside quotes

      if (!sq && ch === '"' && !dq) { dq = true; continue; }
      if (dq && ch === '"' && s[i - 1] !== '\\') { dq = false; continue; }
      if (!dq && ch === "'" && !sq) { sq = true; continue; }
      if (sq && ch === "'" && s[i - 1] !== '\\') { sq = false; continue; }

      if (dq || sq) continue; // inside quotes — ignore bracket state

      if (ch === '(') { paren++; continue; }
      if (ch === ')' && paren > 0) { paren--; continue; }
      if (ch === '{') { brace++; continue; }
      if (ch === '}' && brace > 0) { brace--; continue; }
      if (ch === '[') { bracket++; continue; }
      if (ch === ']' && bracket > 0) { bracket--; continue; }
      if (ch === '<') { angle++; continue; }
      if (ch === '>' && angle > 0) { angle--; continue; }

      if (ch === ':' && paren === 0 && brace === 0 && bracket === 0 && angle === 0) return i;
    }

    return -1;
  }

  // compute keyStart and keyName for a colon position
  // fragmentStart is the earliest allowed keyStart (to avoid scanning outside prompt segment)
  // maxTokens controls how many tokens to consider for multi-word keys
  function computeKeyBeforeColon(colonIndex, fragmentStart = 0, maxTokens = 4) {
    // step left past whitespace
    let j = colonIndex - 1;
    while (j >= fragmentStart && /\s/.test(s[j])) j--;
    if (j < fragmentStart) return null;

    // collect tokens (contiguous [A-Za-z0-9_-]) backwards (no punctuation inside tokens)
    const tokens = [];
    let scanPos = j;
    for (let t = 0; t < maxTokens && scanPos >= fragmentStart;) {
      // token end
      let tokEnd = scanPos;
      // token start
      let tokStart = tokEnd;
      while (tokStart >= fragmentStart && /[A-Za-z0-9_\-]/.test(s[tokStart])) tokStart--;
      tokStart++;
      if (tokStart > tokEnd) break; // not a valid token (maybe punctuation)
      tokens.unshift({ token: s.slice(tokStart, tokEnd + 1), start: tokStart, end: tokEnd + 1 });
      // move left past spaces
      scanPos = tokStart - 1;
      while (scanPos >= fragmentStart && /\s/.test(s[scanPos])) scanPos--;
    }

    if (tokens.length === 0) return null;

    // Try longest multi-word key match (from rightmost tokens)
    const toksLower = tokens.map(x => x.token.toLowerCase());
    for (let take = tokens.length; take >= 1; take--) {
      const startIdx = tokens.length - take;
      const candidate = toksLower.slice(startIdx).join(' ');
      if (multiWordKeys.has(candidate) || /^adetailer\b/.test(candidate)) {
        return { keyStart: tokens[startIdx].start, keyName: candidate, tokenCount: take };
      }
    }

    // fallback single-token key
    const last = tokens[tokens.length - 1];
    return { keyStart: last.start, keyName: last.token.toLowerCase(), tokenCount: 1 };
  }

  // top-level check between absolute indices [from, to)
  function isTopLevelBetween(from, to) {
    if (from >= to) return true;
    let dq = false, sq = false;
    let paren = 0, brace = 0, bracket = 0, angle = 0;
    for (let i = from; i < to; i++) {
      const ch = s[i];
      if ((dq || sq) && ch === '\\') { i++; continue; }
      if (!sq && ch === '"' && !dq) { dq = true; continue; }
      if (dq && ch === '"' && s[i - 1] !== '\\') { dq = false; continue; }
      if (!dq && ch === "'" && !sq) { sq = true; continue; }
      if (sq && ch === "'" && s[i - 1] !== '\\') { sq = false; continue; }
      if (dq || sq) continue;
      if (ch === '(') { paren++; continue; }
      if (ch === ')' && paren > 0) { paren--; continue; }
      if (ch === '{') { brace++; continue; }
      if (ch === '}' && brace > 0) { brace--; continue; }
      if (ch === '[') { bracket++; continue; }
      if (ch === ']' && bracket > 0) { bracket--; continue; }
      if (ch === '<') { angle++; continue; }
      if (ch === '>' && angle > 0) { angle--; continue; }
    }
    return dq === false && sq === false && paren === 0 && brace === 0 && bracket === 0 && angle === 0;
  }

  // ---------- find positive prompt ----------
  // prompt start: after "Prompt:" (if present at beginning) else 0
  let promptStart = 0;
  const promptRegex = /^\s*Prompt\s*:/i;
  const promptMatch = promptRegex.exec(s);
  if (promptMatch) promptStart = promptMatch.index + promptMatch[0].length;

  // if negative marker exists after promptStart, we stop positive at it
  const negMarkerLower = 'negative prompt:';
  const negMarkerIndex = s.toLowerCase().indexOf(negMarkerLower, promptStart);

  let promptEnd = -1;
  if (negMarkerIndex !== -1 && negMarkerIndex > promptStart) {
    promptEnd = negMarkerIndex;
  } else {
    // search for first suitable top-level colon whose computed keyStart > promptStart
    let scanPos = promptStart;
    while (true) {
      const colonIndex = findNextTopLevelColonFrom(scanPos);
      if (colonIndex === -1) { promptEnd = N; break; }
      const keyInfo = computeKeyBeforeColon(colonIndex, promptStart, 4);
      if (keyInfo && keyInfo.keyStart > promptStart) { promptEnd = keyInfo.keyStart; break; }
      // else skip this colon and continue
      scanPos = colonIndex + 1;
    }
  }
  const prompt = s.slice(promptStart, promptEnd === -1 ? N : promptEnd).trim().replace(/^[,;\s]+|[,;\s]+$/g, '');

  // ---------- find negative prompt ----------
  let negative = '';
  let remainderStartIndex = promptEnd === -1 ? N : promptEnd; // absolute index in s where remainder begins (before removing neg)
  if (negMarkerIndex !== -1 && negMarkerIndex >= promptStart) {
    const negMarkerLen = negMarkerLower.length; // length of 'negative prompt:'
    const negContentStart = negMarkerIndex + negMarkerLen; // absolute index in s where negative text begins
    // find first suitable top-level colon after negContentStart
    let scanPos = negContentStart;
    let colonIndex = -1;
    let keyInfo = null;
    while (true) {
      const cidx = findNextTopLevelColonFrom(scanPos);
      if (cidx === -1) break;
      const ki = computeKeyBeforeColon(cidx, negContentStart, 6); // allow more tokens for ADetailer
      if (ki && ki.keyStart >= negContentStart) { colonIndex = cidx; keyInfo = ki; break; }
      scanPos = cidx + 1;
    }

    if (colonIndex === -1) {
      // no param found -> negative goes to end
      negative = s.slice(negContentStart).trim().replace(/^[,;\s]+|[,;\s]+$/g, '');
      // remainder should be everything before negMarkerIndex (drop marker+negative)
      remainderStartIndex = 0; // we will build remainder from start->negMarkerIndex (and later attach any text after negative, but negative goes to end)
      // set flag to remove marker+neg; we'll build remainder below
    } else {
      // we have colonIndex and keyInfo.keyStart
      const keyStart = keyInfo.keyStart;
      // find immediate non-space before keyStart
      let p = keyStart - 1;
      while (p >= negContentStart && /\s/.test(s[p])) p--;
      // if immediate non-space before keyStart is comma AND that comma is top-level between negContentStart..p, end before comma
      if (p >= negContentStart && s[p] === ',' && isTopLevelBetween(negContentStart, p)) {
        negative = s.slice(negContentStart, p).trim().replace(/^[,;\s]+|[,;\s]+$/g, '');
        // remainder will be text before negative marker + text from that comma onward (so comma remains in remainder)
        remainderStartIndex = 0; // we'll construct remainder using slices below
      } else {
        // end at keyStart (do not include keyStart in negative)
        negative = s.slice(negContentStart, keyStart).trim().replace(/^[,;\s]+|[,;\s]+$/g, '');
        remainderStartIndex = 0; // remainder will be pieces before neg marker + from keyStart
      }
    }
  }

  // ---------- build remainder (clean) ----------
  // We want to remove:
  // - positive prompt region (promptStart .. promptEnd)
  // - negative marker + negative content (negMarkerIndex .. negEnd)
  // and leave the rest intact.
  let remainder = s;

  // Remove negative marker + negative content if negative exists (or marker present)
  if (negMarkerIndex !== -1 && negMarkerIndex >= promptStart) {
    // Determine negEnd absolute index in s
    const negMarkerLen = negMarkerLower.length;
    const negContentStart = negMarkerIndex + negMarkerLen;
    // compute negEnd: if we detected colon/key (keyInfo earlier), use that keyStart or comma pos; else negEnd=N
    // Recompute colon/key search to find exact negEnd used above
    let negEnd = N;
    let found = false;
    let scanPos = negContentStart;
    while (!found) {
      const cidx = findNextTopLevelColonFrom(scanPos);
      if (cidx === -1) { negEnd = N; break; }
      const ki = computeKeyBeforeColon(cidx, negContentStart, 6);
      if (ki && ki.keyStart >= negContentStart) {
        // decide if we ended before a preceding comma
        let keyStart = ki.keyStart;
        let p = keyStart - 1;
        while (p >= negContentStart && /\s/.test(s[p])) p--;
        if (p >= negContentStart && s[p] === ',' && isTopLevelBetween(negContentStart, p)) {
          negEnd = p;
        } else {
          negEnd = keyStart;
        }
        found = true;
        break;
      }
      scanPos = cidx + 1;
    }
    // remove from negMarkerIndex up to negEnd
    remainder = remainder.slice(0, negMarkerIndex) + remainder.slice(negEnd);
  }

  // Remove positive prompt (and its Prompt: marker if present)
  if (promptStart > 0) {
    // promptStart includes marker length; we removed negative marker above, indices could shift,
    // so compute using slices on original s: we want to remove original prompt region.
    // Simpler: rebuild remainder from original s pieces excluding prompt and neg segment(s)
    // We'll compute promptEnd again absolute:
    let absPromptEnd = promptEnd;
    if (absPromptEnd === -1) absPromptEnd = N;
    // Now create remainder removing [promptStart, absPromptEnd)
    remainder = s.slice(0, promptStart).replace(/\s*$/, '')   // text before prompt marker (probably empty)
              + s.slice(absPromptEnd); // everything after prompt
    // But earlier we removed negMarker piece, so to ensure both removed properly, do final cleanup:
    // Remove any leftover 'Negative prompt:' markers and leading punctuation
    remainder = remainder.replace(/^\s*,?\s*/,'');
    // Also remove leading "Prompt:" or its marker if leftover
    remainder = remainder.replace(/^\s*Prompt\s*:\s*/i, '');
  } else {
    // promptStart == 0 (no Prompt:), but positive prompt may be at start; remove slice [0, promptEnd)
    let absPromptEnd = promptEnd === -1 ? N : promptEnd;
    remainder = s.slice(absPromptEnd);
  }

  // Final cleanup: trim and remove leading punctuation
  remainder = remainder.trim().replace(/^[,;:\s]+/, '');

  return {
    prompt,
    negativePrompt: negative,
    remainder
  };
}


static extractTextPromptsAndRemainder_Simple_Hardcoded(text) {
    const result = { prompt: '', negativePrompt: '', remainder: text };

    const topLevelKeys = [
        'Negative prompt', 'Steps', 'Sampler', 'Seed', 'Model hash', 'Model', 'Hashes',
        'ADetailer', 'Lora hashes', 'TI hashes', 'Civitai Resources'
    ];

    // --- top-level scanner ---
    function scanTopLevel(s, start = 0, end = s.length, callback) {
        let dq = false, sq = false;
        let paren = 0, brace = 0, bracket = 0, angle = 0;
        for (let i = start; i < end; i++) {
            const ch = s[i];
            if ((dq || sq) && ch === '\\') { i++; continue; }

            if (!sq && ch === '"' && !dq) { dq = true; continue; }
            if (dq && ch === '"' && s[i - 1] !== '\\') { dq = false; continue; }
            if (!dq && ch === "'" && !sq) { sq = true; continue; }
            if (sq && ch === "'" && s[i - 1] !== '\\') { sq = false; continue; }
            if (dq || sq) continue;

            if (ch === '(') paren++; else if (ch === ')' && paren > 0) paren--;
            else if (ch === '{') brace++; else if (ch === '}' && brace > 0) brace--;
            else if (ch === '[') bracket++; else if (ch === ']' && bracket > 0) bracket--;
            else if (ch === '<') angle++; else if (ch === '>' && angle > 0) angle--;

            if (!dq && !sq && paren === 0 && brace === 0 && bracket === 0 && angle === 0) {
                if (callback(ch, i)) break;
            }
        }
    }

    // --- extract prompt helper ---
    function extractPrompt(startKeyword = '', stopKeywords = []) {
        let start = 0;
        if (startKeyword) {
            const idx = result.remainder.indexOf(startKeyword);
            if (idx >= 0) start = idx + startKeyword.length;
        }

        let end = result.remainder.length;
        scanTopLevel(result.remainder, start, result.remainder.length, (ch, i) => {
            for (let key of stopKeywords) {
                if (result.remainder.slice(i).startsWith(key)) {
                    end = i;
                    return true;
                }
            }
            return false;
        });

        let prompt = result.remainder.slice(start, end).trim().replace(/,+\s*$/, '');
        return { prompt, end };
    }

    // --- positive prompt: stop at Negative prompt or top-level keys ---
    let { prompt: posPrompt, end: posEnd } = extractPrompt(
        'Prompt:', 
        topLevelKeys
    );
    if (!posPrompt) ({ prompt: posPrompt, end: posEnd } = extractPrompt('', topLevelKeys));
    result.prompt = posPrompt;
    result.remainder = result.remainder.slice(posEnd);

    // --- negative prompt: stop at next top-level key ---
    const negStart = result.remainder.indexOf('Negative prompt:');
    if (negStart >= 0) {
        const { prompt: negPrompt, end: negEnd } = extractPrompt('Negative prompt:', topLevelKeys);
        result.negativePrompt = negPrompt;
        result.remainder = result.remainder.slice(negEnd);
    }

    return result;
}



    static extractTextPrompts_Err(text) {
        const s = String(text || '');

        // helpers
        function findNegativeMarker() {
            const re = /\bNegative\s*prompt\s*[:=]/i;
            const m = re.exec(s);

            return m ? m.index : -1;
        }

        // small utility: find optional "Prompt:" marker index (strict: start or after comma/newline/()
        function findPromptMarker() {
            const re = /(?:^|,|\n|\()\s*Prompt\s*[:=]/i;
            const m = re.exec(s);

            return m ? (m.index + m[0].search(/Prompt/i)) : -1;
        }

        // Determine top-levelness by scanning bracket/quote depths between fromIndex (inclusive) and toIndex (exclusive).
        // strict top-level check between two indices (exclusive end)
        function isTopLevelBetween(from, to) {
            let dq = false; // inside double quote
            let sq = false; // inside single quote
            let paren = 0, brace = 0, bracket = 0, angle = 0;

            for (let i = from; i < to; i++) {
                const ch = s[i];

                if ((dq || sq) && ch === '\\') { i++; continue; } // skip escaped char inside quotes
                if (!sq && ch === '"' && !dq) { dq = true; continue; }
                if (dq && ch === '"' && s[i-1] !== '\\') { dq = false; continue; }
                if (!dq && ch === "'" && !sq) { sq = true; continue; }
                if (sq && ch === "'" && s[i-1] !== '\\') { sq = false; continue; }

                if (dq || sq) continue; // inside quotes — ignore bracket state

                if (ch === '(') paren++; else if (ch === ')' && paren>0) paren--;
                else if (ch === '{') brace++; else if (ch === '}' && brace>0) brace--;
                else if (ch === '[') bracket++; else if (ch === ']' && bracket>0) bracket--;
                else if (ch === '<') angle++; else if (ch === '>' && angle>0) angle--;
            }

            // only top-level if all depths are zero (nothing unclosed)
            return !dq && !sq && paren===0 && brace===0 && bracket===0 && angle===0;
        }

        // Candidate parameter pattern: Key:Value where after colon the value begins with { [ " or a number or a token.
        const candidateRe = /([A-Za-z][A-Za-z0-9 _\-]{0,80}?)\s*:\s*(?:\{|\[|"|[-+]?\d+(\.\d+)?|[^,\s][^,]*)/g;

        // find first top-level candidate at/after startIndex
        function findFirstCandidate(startIndex) {
            candidateRe.lastIndex = startIndex;
            let m;
            while ((m = candidateRe.exec(s)) !== null) {
                const keyStart = m.index;
                // avoid parentheses or angle prefix like "(goggles:" or "<lora:" by rejecting if char before is '(' or '<'
                const prevChar = s[keyStart - 1];
                if (prevChar === '(' || prevChar === '<') continue;

                // require top-level colon (scan from startIndex to keyStart)
                if (!isTopLevelBetween(startIndex, keyStart)) continue;

                // Additional heuristic: avoid matching small lowercase words used inside prompts:
                // if key starts with a lowercase letter AND is short (<=3), treat as likely NOT a metadata key (e.g. "and:" "or:")
                if (/^[a-z]{1,3}$/.test(m[1].trim())) continue;

                // Also avoid matching tokens that look like lora tokens inside angle brackets (we already checked '<' before)
                // and avoid matching things that are part of "aDetailer model" by checking preceding word.
                // Check immediate preceding word:
                const preFrom = Math.max(0, keyStart - 40);
                const preMatch = s.slice(preFrom, keyStart).match(/([A-Za-z0-9_\-]+)\s*$/);
                if (preMatch && /^(ADetailer|Lora|Lora_\d+|TI)$/i.test(preMatch[1])) continue;

                // Also ensure that after the colon the "value start" is not just a short parenthetical emphasis (we already guarded parentheses)
                // Accept this candidate
                return { keyStart, match: m[0] };
            }

            return null;
        }

        // --- compute positive prompt ---
        // compute prompt start index
        const pmIdx = findPromptMarker();
        let posStart = 0;
        if (pmIdx >= 0) {
            // set posStart right after the "Prompt:"" marker
            const slice = s.slice(pmIdx, pmIdx + 40);
            const mm = slice.match(/\bPrompt\s*[:=]/i);
            posStart = pmIdx + (mm ? mm.index + mm[0].length : 0);
        }

        // Negative marker index (if any)
        const negIdx = findNegativeMarker();

        // positive prompt: if negative marker exists -> everything up to that marker
        // otherwise up to first candidate (if any)
        let posEnd;
        // but if Negative marker appears before that key, end at Negative marker
        if (negIdx >= 0) {
            posEnd = negIdx;
        }
        else {
            const cand = findFirstCandidate(posStart);
            posEnd = cand ? cand.keyStart : s.length;
        }
        const prompt = s.slice(posStart, posEnd).trim().replace(/^[,;\s]+|[,;\s]+$/g,'');
        const promptSpan = [posStart, posEnd];

        // --- compute negative prompt (if any) ---
        // Negative prompt: if no negative marker => null
        let negative = null, negativeSpan = null;
        if (negIdx >= 0) {
            // determine start of negative content
            // start after "Negative prompt:" token
            const slice = s.slice(negIdx, negIdx + 40);
            const mNeg = slice.match(/\bNegative\s*prompt\s*[:=]/i);
            const negContentStart = negIdx + (mNeg ? mNeg.index + mNeg[0].length : 0);

            const cand = findFirstCandidate(negContentStart);
            if (!cand) {
                // no candidate -> negative goes to end
                negative = s.slice(negContentStart).trim().replace(/^[,;\s]+|[,;\s]+$/g,'');
                negativeSpan = [negContentStart, s.length];
            } else {
                const keyStart = cand.keyStart;
                // find immediate preceding non-space char before keyStart
                let j = keyStart - 1;
                while (j >= negContentStart && /\s/.test(s[j])) j--;

                if (j >= negContentStart && s[j] === ',') {
                    // ensure comma is top-level (between negContentStart and j)
                    if (isTopLevelBetween(negContentStart, j)) {
                        // end before this comma
                        negative = s.slice(negContentStart, j).trim().replace(/^[,;\s]+|[,;\s]+$/g,'');
                        negativeSpan = [negContentStart, j];
                    } else {
                        // comma is not top-level -> end at keyStart
                        negative = s.slice(negContentStart, keyStart).trim().replace(/^[,;\s]+|[,;\s]+$/g,'');
                        negativeSpan = [negContentStart, keyStart];
                    }
                } else {
                    // no immediate preceding comma -> end at keyStart
                    negative = s.slice(negContentStart, keyStart).trim().replace(/^[,;\s]+|[,;\s]+$/g,'');
                    negativeSpan = [negContentStart, keyStart];
                }
            }
        }

        return {
            prompt,
            promptSpan,
            negativePrompt: negative,
            negativeSpan
        };
    }

    // ----------------- Prompt extraction -----------------
    /**
     * Extracts:
     * - main A1111-style prompt & negative prompt
     * - ComfyUI node prompts for a small set of node names
     * - ADetailer prompts (face/hand/foot) via parseADetailerMetadata()
     *
     * Returns { prompts: { main, ClipTextEncode, easypositive, custom_node, ... },
     *           negative_prompts: { main, ClipTextEncode, easynegative, custom_node, ... } }
     */
    static extractAllPrompts(text, hashes = {}) {
        const outPrompts = {
            main: null, // A1111-style
            ClipTextEncode: null,
            easypositive: null,
            custom_node: null,
            // extra nodes can be added dynamically
        };
        const outNeg = {
            main: null,
            ClipTextEncode: null,
            easynegative: null,
            custom_node: null
        };

        const { prompt, negativePrompt } = this.extractPromptsMinimalButRobust_v3(text);

        if (prompt) outPrompts.main = this.trimAllWhitespacesAndCommas(prompt);
        if (negativePrompt) outNeg.main = this.trimAllWhitespacesAndCommas(negativePrompt);

        // 2) ComfyUI node style prompts
        // nodes we care about; you can add more
        const nodes = ['ClipTextEncode', 'easypositive', 'easynegative', 'custom_node'];
        // Build a regex that matches e.g. ClipTextEncode prompt: "..."  OR ClipTextEncode: "..."
        const nodePattern = nodes.map(n => this.escapeRegex(n)).join('|');
        const comfyRe = new RegExp(`\\b(?:${nodePattern})\\b(?:\\s+prompt)?\\s*:\\s*(".*?"|[^,\\n]+)`, 'gi');
        let cm;
        while ((cm = comfyRe.exec(text)) !== null) {
            const foundNode = cm[0].match(new RegExp(`\\b(${nodePattern})\\b`, 'i'))?.[1];
            if (!foundNode) continue;

            const val = this.stripQuotes(cm[1]).trim();
            if (/ClipTextEncode/i.test(foundNode)) {
                // ClipTextEncode commonly has both prompt & negative, but this regex only captures one occurrence.
                // We'll put into ClipTextEncode prompt, and later parse negative if a negative key is found separately.
                outPrompts.ClipTextEncode = val;
            }
            else if (/easypositive/i.test(foundNode)) outPrompts.easypositive = val;
            else if (/custom_node/i.test(foundNode)) outPrompts.custom_node = val;
        }

        // Also try to capture negative prompts for ClipTextEncode / custom_node if they are present with explicit "negative" wording
        const comfyNegRe = new RegExp(`\\b(?:${nodePattern})\\b(?:\\s+negative\\s*prompt|\\s+negative)?\\s*:\\s*(".*?"|[^,\\n]+)`, 'gi');
        while ((cm = comfyNegRe.exec(text)) !== null) {
            const foundNode = cm[0].match(new RegExp(`\\b(${nodePattern})\\b`, 'i'))?.[1];
            if (!foundNode) continue;

            const val = this.stripQuotes(cm[1]).trim();
            // class negative nodes: easynegative explicitly maps to negative, others default to positive
            if (/ClipTextEncode/i.test(foundNode)) outNeg.ClipTextEncode = val;
            else if (/easynegative/i.test(foundNode)) outNeg.easynegative = val;
            else if (/custom_node/i.test(foundNode)) outNeg.custom_node = val;
        }

        // 3) ADetailer prompts (face/hand/foot). Use specialized parser to get each adetailer entry.
        const adEntries = this.parseADetailerMetadata(text, hashes);
        // map them into prompts/negatives per role if model names contain 'face'/'hand'/'foot' or by index
        adEntries.forEach(e => {
            const modelLower = (e.model || '').toLowerCase();
            const role =
                /face/i.test(modelLower) ? 'face' :
                /hand/i.test(modelLower) ? 'hand' :
                /foot/i.test(modelLower) ? 'foot' : `adetailer_${e.index}`;
            if (e.prompt) {
                outPrompts[`ADetailer (${role})`] = e.prompt;
            }
            if (e.negative_prompt) {
                outNeg[`ADetailer (${role})`] = e.negative_prompt;
            }
        });

        return { prompts: outPrompts, negativePrompts: outNeg, adetailers: adEntries };
    }

//TODO33
    /*
    Hashes merging & sorting utility
    */
    // Merge two hash dicts: 'hashes' (existing) and 'parsed' (from parseModelAndLoras)
static mergeAndNormalizeHashes(hashes = {}, parsed = {}) {
  // shallow copies
  const merged = { ...hashes, ...parsed };

  // If there is both a plain "model" and a "model:NAME", prefer the named key and remove plain "model".
  // If multiple model:NAME entries exist and plain model equals one of them, keep both but prefer named in display.
  const modelPlain = merged['model'];
  if (modelPlain) {
    // find any model:name that has same hash; if one exists, remove plain 'model'
    const namedModelKey = Object.keys(merged).find(k => k.toLowerCase().startsWith('model:') && merged[k] === modelPlain);
    if (namedModelKey) {
      delete merged['model'];
    } else {
      // else keep both; optionally turn plain 'model' into model:unknown or leave as-is
    }
  }

  // produce ordering: model keys first, then lora:, then embed:, then the rest alphabetical
  const ordered = {};
  // 1) all model:* keys (alphabetically)
  Object.keys(merged).sort().forEach(k => {
    if (k.toLowerCase().startsWith('model:')) ordered[k] = merged[k];
  });
  // 1b) if plain model still exists, put it next as "model"
  if ('model' in merged) ordered['model'] = merged['model'];

  // 2) all lora: keys
  Object.keys(merged).sort().forEach(k => {
    if (k.toLowerCase().startsWith('lora:')) ordered[k] = merged[k];
  });

  // 3) all embed:
  Object.keys(merged).sort().forEach(k => {
    if (k.toLowerCase().startsWith('embed:')) ordered[k] = merged[k];
  });

  // 4) the rest
  Object.keys(merged).sort().forEach(k => {
    if (!ordered.hasOwnProperty(k)) ordered[k] = merged[k];
  });

  return ordered;
}


    // ----------------- Reference-data merger (model, lora, adetailer, embed, others) -----------------
    static mergeAndPrioritizeAll(existingHashes = {}, parsedHashes = {}) {
        // parsedHashes takes precedence
        const merged = { ...existingHashes, ...parsedHashes };

        // If any model:NAME exists -> drop plain model
        if (Object.keys(merged).some(k => /^model:/i.test(k)) && merged.hasOwnProperty('model')) {
            delete merged['model'];
        }
        // If any adetailer:NAME exists -> drop plain adetailer
        if (Object.keys(merged).some(k => /^adetailer:/i.test(k)) && merged.hasOwnProperty('adetailer')) {
            delete merged['adetailer'];
        }
        // If any embed:NAME exists -> drop plain embed
        if (Object.keys(merged).some(k => /^embed:/i.test(k)) && merged.hasOwnProperty('embed')) {
            delete merged['embed'];
        }

        const out = {};
        const push = ks => ks.forEach(k => { out[k] = merged[k]; });

        // 1) model group: plain model first, then model:... sorted
        if (merged.hasOwnProperty('model')) out['model'] = merged['model'];
        const modelNamedKeys = Object.keys(merged).filter(k => /^model:/i.test(k))
            .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
        push(modelNamedKeys);

        // 2) lora group: numeric-order when possible, otherwise alpha
        const loraKeys = Object.keys(merged).filter(k => /^lora:/i.test(k))
            .sort((a, b) => {
                const ai = a.match(/^lora:(\d+)$/i), bi = b.match(/^lora:(\d+)$/i);
                if (ai && bi) return Number(ai[1]) - Number(bi[1]);

                return a.toLowerCase().localeCompare(b.toLowerCase());
            });
        push(loraKeys);

        // 3) adetailer group
        if (merged.hasOwnProperty('adetailer')) out['adetailer'] = merged['adetailer'];
        const adetailerKeys = Object.keys(merged).filter(k => /^adetailer:/i.test(k))
            .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
        push(adetailerKeys);

        // 4) embed group
        if (merged.hasOwnProperty('embed')) out['embed'] = merged['embed'];
        const embedKeys = Object.keys(merged).filter(k => /^embed:/i.test(k))
            .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
        push(embedKeys);

        // 5) remaining keys
        const otherKeys = Object.keys(merged).filter(k => !/^model/i.test(k) && !/^lora:/i.test(k) && !/^adetailer:/i.test(k) && !/^embed:/i.test(k))
            .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
        push(otherKeys);

        return out;
    }

    // ----------------- Example usage -----------------
    /* Example input text (mix of single-line Style2 Hashes and ADetailer metadata & prompts)
        const exampleText = `
            Hashes: {"model": "59225eddc3", "lora:hololive_kaela_kovalskia_redebut": "11bc3bab82", "lora:Butterfly_Applique_Black_Silk_Chiffon_Party_Dress": "c555e1d0f1", "adetailer:face_yolov9c.pt": "d02fe493c3", "adetailer:hand_yolov9c.pt": "6f116f686e", "adetailer:foot_yolov8x_v2.pt": "9f39f32ab8", "embed:lazypos": "3086669265"}
            Prompt: "a beautiful portrait, cinematic lighting, <lora:hololive_kaela_kovalskia_redebut:0.75>"
            Negative Prompt: "lowres, bad anatomy"
            ClipTextEncode prompt: "cinematic female portrait"
            ClipTextEncode negative prompt: "bad lighting"
            ADetailer model: face_yolov9c.pt, ADetailer prompt: "extremely detailed eyes, extremely detailed face", ADetailer negative prompt: "lazyneg", ADetailer model 2nd: hand_yolov9c.pt, ADetailer prompt 2nd: "finely drawn hand", ADetailer model 3rd: foot_yolov8x_v2.pt, ADetailer prompt 3rd: "finely drawn foot"
        `;
    */

    /* Suppose we already parsed Hashes JSON into an object "styleHashes" elsewhere:
        const styleHashes = {
            "model": "59225eddc3",
            "lora:hololive_kaela_kovalskia_redebut": "11bc3bab82",
            "lora:Butterfly_Applique_Black_Silk_Chiffon_Party_Dress": "c555e1d0f1",
            "adetailer:face_yolov9c.pt": "d02fe493c3",
            "adetailer:hand_yolov9c.pt": "6f116f686e",
            "adetailer:foot_yolov8x_v2.pt": "9f39f32ab8",
            "embed:lazypos": "3086669265"
        };
    */

    /* And suppose parseModelAndLoras(text) returns parsedModels (from earlier code)
        const parsedModels = {
        "model:chilloutmix_NiPrunedFp32Fix": "fc2511737a",
        "lora:betterCuteAsian03": "Unknown"
        };
    */

    /* Now run prompt extraction and adetailer parsing (adetailer parser will attach hashes from styleHashes)
        const { prompts, negativePrompts, adetailers } = extractAllPrompts(exampleText, styleHashes);
    */

    /* Merge reference hashes
        const reference = mergeAndPrioritizeAll(styleHashes, parsedModels);
    */

    /* Output
        console.log('--- Prompts (collated) ---');
        console.log('Main prompt:', prompts.main);
        console.log('ClipTextEncode prompt:', prompts.ClipTextEncode);
        console.log('easypositive prompt:', prompts.easypositive);
        console.log('ADetailer prompts:', adetailers.map(a => ({ index: a.index, model: a.model, prompt: a.prompt, hash: a.hash })));
        console.log('\n--- Negative prompts (collated) ---');
        console.log('Main negative:', negativePrompts.main);
        console.log('ClipTextEncode negative:', negativePrompts.ClipTextEncode);
        console.log('\n--- Reference Data ---');
        console.log(reference);

        Result:
        Prompts will contain:
        main : "a beautiful portrait, cinematic lighting, <lora:...>"
        ClipTextEncode : "cinematic female portrait"
        ADetailer entries array with prompts + hashes attached (face/hand/foot)
        Reference Data: merged+ordered object (model, model:..., lora:..., adetailer:..., embed:..., others)
    */


    //TODO - this extractModelHashes() is redundant with the
    // function extractResources() which calles Style0-Style5 parsers
    static extractModelHashes(text, metadata) {
        // Initialize hashes object
        let hashes = {};
        //hashes = {...hashes, ...parsedHashes};

        const style0Hashes = this.parseStyle0(text);
        style0Hashes.map(r => {
            hashes[`${r.prefix}:${r.name}`] = (r.hash) ? r.hash : "Unknown";
        });

        const style1Hashes = this.parseStyle1(text);
        style1Hashes.map(r => {
            hashes[`${r.prefix}:${r.name}`] = (r.hash) ? r.hash : "Unknown";
        });

        const style2Hashes = this.parseStyle2(text);
        style2Hashes.map(r => {
            hashes[`${r.prefix}:${r.name}`] = (r.hash) ? r.hash : "Unknown";
        });

        const style3Hashes = this.parseStyle3(text);
        style3Hashes.map(r => {
            hashes[`${r.prefix}:${r.name}`] = (r.hash) ? r.hash : "Unknown";
        });

        const style4Hashes = this.parseStyle4(text);
        style4Hashes.map(r => {
            hashes[`${r.prefix}:${r.name}`] = (r.hash) ? r.hash : "Unknown";
        });

        const style5Hashes = this.parseStyle5(text);
        style5Hashes.map(r => {
            hashes[`${(r.airUrn) ? r.resourceType : r.type}:${r.name}@${r.version}`] = (r.airUrn) ? r.airUrn : r.modelVersionId;
        });

        // deduplicate and sort hashes
        hashes = this.mergeAndPrioritizeHashes(hashes);
        
        // store the Hashes dict into raw metadata
        // Only set hashes in metadata if we found some
        if (Object.keys(hashes).length > 0) {
            metadata.raw['hashes'] = hashes;
        }

        return hashes;
    }

    //REMOVE
    static async extractJPEGMetadata_Old(file, metadata) {
        // First, try to use ExifReader with the full file for comprehensive EXIF parsing
        try { //TODO - disabled ExifReader
            if (false && typeof ExifReader !== 'undefined') {
                // Read the entire file for ExifReader (it handles large files efficiently)
                const buffer = await file.arrayBuffer();
                const exifData = ExifReader.load(buffer);
                metadata.raw['EXIF_formatted'] = await this.formatExifData(exifData, metadata);
            }
        } catch (error) {
            console.error('Error parsing EXIF with ExifReader:', error);
            metadata.raw['EXIF'] = `[EXIF parsing failed: ${error.message}]`;
        }
        
        // For performance, only read first 1024KB for additional metadata extraction
        //const maxBytes = Math.min(file.size, 1024 * 1024); // 1MB
        //const buffer = await file.slice(0, maxBytes).arrayBuffer();
        const buffer = await file.arrayBuffer();
        const dataView = new DataView(buffer);
        
        // Check JPEG signature
        if (buffer.byteLength < 2 || dataView.getUint16(0) !== 0xFFD8) {
            throw new Error('Invalid JPEG file');
        }
        
        let offset = 2;
        
        while (offset < buffer.byteLength - 1) {
            // Safety check to prevent infinite loops
            if (offset >= buffer.byteLength - 1) {
                break;
            }
            
            // Check for markers
            if (dataView.getUint8(offset) === 0xFF) {
                // Skip padding bytes (0xFF)
                while (offset < buffer.byteLength && dataView.getUint8(offset) === 0xFF) {
                    offset++;
                }
                
                // Check if we still have data
                if (offset >= buffer.byteLength) {
                    break;
                }
                
                const marker = dataView.getUint8(offset);
                offset++;
                
                // Check for APP1 marker (0xFFE1) which contains EXIF/XMP data
                if (marker === 0xE1) {
                    // Check if we have enough bytes for length
                    if (offset + 1 >= buffer.byteLength) {
                        break;
                    }
                    
                    const length = dataView.getUint16(offset);
                    offset += 2;
                    
                    // Check if we have enough bytes for data
                    if (offset + length - 2 > buffer.byteLength) {
                        // Not enough data, skip this marker
                        offset += length - 2;
                        continue;
                    }
                    
                    const data = buffer.slice(offset, offset + length - 2);
                    await this.parseJPEGAPP1_Old(data, metadata);
                    offset += length - 2;
                } else if (marker >= 0xC0 && marker <= 0xCF) {
                    // Start of frame markers, get length
                    // Check if we have enough bytes for length
                    if (offset + 1 >= buffer.byteLength) {
                        break;
                    }
                    
                    const length = dataView.getUint16(offset);
                    offset += 2 + length - 2;
                } else {
                    // Skip other markers
                    // Check if we have enough bytes for length
                    if (offset + 1 >= buffer.byteLength) {
                        break;
                    }
                    
                    const length = dataView.getUint16(offset);
                    offset += 2 + length - 2;
                }
            } else {
                offset++;
            }
            
            // Break if we've reached the end of image marker
            if (offset < buffer.byteLength - 1 && dataView.getUint16(offset) === 0xFFD9) {
                break;
            }
        }
        
        return metadata;
    }

    static async parseJPEGAPP1_Old(data, metadata) {
        console.debug("parseJPEGAPP1_Old() processing ...");

        const bytes = new Uint8Array(data);

        // JPEG APP1 structure = [0xFFE1][length][Exif\0\0][TIFF header …]
        // APP1 segment starts with "Exif\0\0"
        const exifHeader = "Exif\0\0"; // 6 bytes long
        const headerBytes = new TextDecoder("ascii").decode(bytes.subarray(0, 6));

        if (headerBytes === exifHeader) {
            try {
                // our parser expects to start right at the TIFF header, not before.
                // So skip the 6-byte "Exif\0\0" marker, then parseExifStrings() works the same as with WEBP.

                // Skip the Exif header (6 bytes)
                const tiffData = data.slice(6);

                // Now reuse the same parser as WEBP
                const exifStrings = this.parseExifStrings(tiffData);

                //TODO //CHECK - also read other "common" EXIF fields
                metadata.raw['EXIF_tiff'] = tiffData; //exifData;
                metadata.raw['EXIF_strings'] = exifStrings; //exifData;
                metadata.raw['EXIF_formatted'] = await this.formatExifData(tiffData, metadata);

                // Prefer UserComment; fall back to ImageDescription / XPComment
                const sdText =
                    exifStrings.UserComment || // <- almost all times the sdText stays here
                    exifStrings.ImageDescription ||
                    exifStrings.XPComment ||
                    "";
                
                if (sdText) {
                    console.log("JPEG EXIF SD text:", sdText);

                    console.log("exifStrings.UserComment:", exifStrings.UserComment); // from this the sdText was populated
                    console.log("exifStrings.ImageDescription:", exifStrings.ImageDescription); // empty
                    console.log("exifStrings.XPComment:", exifStrings.XPComment); //empty

                    metadata.raw['EXIF'] = '[EXIF data found in JPEG file - stored in metadata.raw.EXIF_text]';
                    metadata.raw["EXIF_text"] = sdText; //DEBUG
                    metadata.raw["parameters"] = sdText;

                    await this.extractParsedMetadata("parameters", sdText, metadata);

                    return;
                }
            } catch (error) {
                    // Not text data or error reading as text
                    console.error("EXIF Metadata Processing Error:", error);
            }
        }

        // ---- XMP fallback ----
        const textDecoder = new TextDecoder("utf-8", { fatal: false });
        const xmpData = textDecoder.decode(data);

        // Handle found XMP
        const xmpMetaValue = await this.parseXMPParameters(xmpData, metadata);
        // this has generated raw "XMP_data" and "XML_meta" metadata
        if (xmpMetaValue.len > 0)
            await this.extractParsedMetadata("XMP_meta", xmpMetaValue, metadata);

        return;
    }

    static async formatExifData(exifData) {
        const formattedData = {};

        if (!exifData) {
            formattedData['Error'] = 'No EXIF data found';

            return formattedData;
        }

        // Common EXIF tags to display
        const commonTags = [
            'Make', 'Model', 'DateTime', 'DateTimeOriginal', 'DateTimeDigitized',
            'ExposureTime', 'FNumber', 'ISO', 'FocalLength', 'Flash',
            'WhiteBalance', 'ExposureMode', 'MeteringMode', 'SceneCaptureType',
            'ImageWidth', 'ImageHeight', 'XResolution', 'YResolution',
            'ResolutionUnit', 'Software', 'Artist', 'Copyright',
            'ColorSpace', 'ExifVersion', 'FlashpixVersion',
            'ComponentsConfiguration', 'CompressedBitsPerPixel',
            'ShutterSpeedValue', 'ApertureValue', 'BrightnessValue',
            'ExposureBiasValue', 'MaxApertureValue', 'SubjectDistance',
            'LightSource', 'SensingMethod', 'FileSource', 'SceneType',
            'CustomRendered', 'DigitalZoomRatio', 'FocalLengthIn35mmFilm',
            'GainControl', 'Contrast', 'Saturation', 'Sharpness',
            'SubjectDistanceRange', 'ImageUniqueID', 'LensSpecification',
            'LensMake', 'LensModel', 'LensSerialNumber'
        ];
        
        // Process each tag and format it user-friendly
        for (const tagName of commonTags) {
            if (exifData[tagName]) {
                const tag = exifData[tagName];
                let value = tag.description || tag.value;
                
                // Format specific values
                if (tagName === 'ExposureTime' && tag.value) {
                    if (tag.value < 1) {
                        value = `1/${Math.round(1/tag.value)}s`;
                    } else {
                        value = `${tag.value}s`;
                    }
                } else if (tagName === 'FNumber' && tag.value) {
                    value = `f/${tag.value}`;
                } else if (tagName === 'FocalLength' && tag.value) {
                    value = `${tag.value}mm`;
                } else if (tagName === 'ISO' && tag.value) {
                    value = `ISO ${tag.value}`;
                }
                
                formattedData[tagName] = value;
            }
        }
        
        // Add GPS data if available
        if (exifData.GPSLatitude && exifData.GPSLongitude) {
            const lat = exifData.GPSLatitude.description || exifData.GPSLatitude.value;
            const lon = exifData.GPSLongitude.description || exifData.GPSLongitude.value;
            formattedData['GPS Location'] = `${lat}, ${lon}`;
        }
        
        // Look for AI generation parameters in EXIF
        const userComment = exifData.UserComment;
        if (userComment && userComment.value) {
            const comment = userComment.value;
            if (typeof comment === 'string' && (comment.includes('parameters') || comment.includes('prompt'))) {
                formattedData['AI Parameters'] = comment;
                // Also parse the parameters for the main metadata
                this.extractAIGenerationParameters(comment, metadata);
            }
        }
        
        // Look for parameters in ImageDescription
        const imageDescription = exifData.ImageDescription;
        if (imageDescription && imageDescription.value) {
            const description = imageDescription.value;
            if (typeof description === 'string' && (description.includes('parameters') || description.includes('prompt'))) {
                formattedData['Image Description'] = description;
                // Also parse the parameters for the main metadata
                this.extractAIGenerationParameters(description, metadata);
            }
        }
        
        // Look for parameters in other common EXIF fields
        const software = exifData.Software;
        if (software && software.value) {
            const softwareValue = software.value;
            if (typeof softwareValue === 'string' && (softwareValue.includes('parameters') || softwareValue.includes('prompt'))) {
                formattedData['Software'] = softwareValue;
                // Also parse the parameters for the main metadata
                this.extractAIGenerationParameters(softwareValue, metadata);
            }
        }
        
        // Look for parameters in Artist field (sometimes used by AI tools)
        const artist = exifData.Artist;
        if (artist && artist.value) {
            const artistValue = artist.value;
            if (typeof artistValue === 'string' && (artistValue.includes('parameters') || artistValue.includes('prompt'))) {
                formattedData['Artist'] = artistValue;
                // Also parse the parameters for the main metadata
                this.extractAIGenerationParameters(artistValue, metadata);
            }
        }
        
        return formattedData;
    }


    // this function is called/reused from extractWebpMetadata() and parseJPEGAPP1()
    static parseExifStrings_Old(exifArrayBuffer) {
        const view = new DataView(exifArrayBuffer);

        // --- TIFF header ---
        const b0 = String.fromCharCode(view.getUint8(0));
        const b1 = String.fromCharCode(view.getUint8(1));
        const byteOrder = b0 + b1; // "II" or "MM"
        const little = byteOrder === 'II';
        if (!(little || byteOrder === 'MM')) return {}; // not TIFF
        if (view.getUint16(2, little) !== 0x002A) return {}; // wrong TIFF magic
        const ifd0Off = view.getUint32(4, little) >>> 0;

        const T = {
            ImageDescription: 0x010E,
            XPComment:        0x9C9C,    // Windows XP tag (UTF-16LE bytes)
            ExifIFDPointer:   0x8769,    // points to Exif IFD
            UserComment:      0x9286     // "ASCII\0\0\0" | "JIS\0\0\0\0\0" | "UNICODE\0" + payload
        };

        const typeSize = {
            1: 1, // BYTE
            2: 1, // ASCII (8-bit)
            3: 2, // SHORT
            4: 4, // LONG
            5: 8, // RATIONAL
            7: 1, // UNDEFINED (opaque bytes)
            9: 4, // SLONG
            10: 8 // SRATIONAL
        };

        const decASCII  = new TextDecoder('ascii', {fatal:false});
        const decUTF8   = new TextDecoder('utf-8',  {fatal:false});
        const decU16LE  = new TextDecoder('utf-16le', {fatal:false});
        const decU16BE  = new TextDecoder('utf-16be', {fatal:false});

        function clamp(n, lo, hi){ return Math.max(lo, Math.min(hi, n)); }

        function readIFD(offset) {
            if (offset <= 0 || offset + 2 > view.byteLength) return {tags:new Map(), next:0};

            const count = view.getUint16(offset, little);
            let p = offset + 2;
            const tags = new Map();
            for (let i = 0; i < count; i++, p += 12) {
                if (p + 12 > view.byteLength) break;

                const tag   = view.getUint16(p, little);
                const type  = view.getUint16(p + 2, little);
                const cnt   = view.getUint32(p + 4, little);
                const val32 = view.getUint32(p + 8, little);
                const unit  = typeSize[type] || 1;
                const bytelen = unit * cnt;

                let dataOffset, inline = false;
                if (bytelen <= 4) {
                    // inline value in the 4-byte field
                    dataOffset = p + 8;
                    inline = true;
                } else {
                    dataOffset = val32 >>> 0; // offset from TIFF start
                }

                tags.set(tag, {type, cnt, bytelen, dataOffset, inline});
            }

            const next = (p + 4 <= view.byteLength) ? (view.getUint32(p, little) >>> 0) : 0;

            return {tags, next};
        }

        function readBytes(entry) {
            if (!entry) return new Uint8Array(0);

            if (entry.inline) {
                const out = new Uint8Array(entry.bytelen);
                for (let i = 0; i < entry.bytelen; i++) out[i] = view.getUint8(entry.dataOffset + i);
                return out;
            } else {
                const start = entry.dataOffset;
                const end   = start + entry.bytelen;
                if (end > view.byteLength) return new Uint8Array(0);
                return new Uint8Array(view.buffer, start, entry.bytelen);
            }
        }

        function clean(s) {
            // trim ASCII NULLs and trailing whitespaces

            return s.replace(/\u0000+$/,'').trim();
        }

        function decodeUserComment(bytes) {
            if (bytes.length < 8) return '';

            const code = decASCII.decode(bytes.subarray(0, 8)).replace(/\0/g,'').toUpperCase();
            const payload = bytes.subarray(8);

            if (code.startsWith('ASCII')) {
                return clean(decUTF8.decode(payload));
            }
            if (code.startsWith('UNICODE')) {
                // many generators write UTF-16LE; some write BE. Pick best by printable score.
                const le = decU16LE.decode(payload);
                const be = decU16BE.decode(payload);
                const score = s => {
                    let p = 0;
                    for (let i = 0; i < s.length; i++) {
                        const c = s.charCodeAt(i);
                        if (c === 9 || c === 10 || c === 13 || (c >= 32 && c < 127)) p++;
                    }

                    return p / Math.max(1, s.length);
                };

                return clean(score(le) >= score(be) ? le : be);
            }

            // Unknown code → heuristic

            return clean(bestGuess(payload));
        }

        function bestGuess(bytes) {
            // Heuristic: if ~50% zeros → UTF-16 (try LE first), else UTF-8
            const n = bytes.length;
            const scan = Math.min(n, 8192);
            let zeros = 0;

            for (let i = 0; i < scan; i++) if (bytes[i] === 0) zeros++;

            const ratio = zeros / Math.max(1, scan);
            
            if (ratio > 0.25) {
                const le = decU16LE.decode(bytes);
                const be = decU16BE.decode(bytes);
                const asciiRatio = s => {
                    let p = 0;
                    for (let i = 0; i < s.length; i++) {
                        const c = s.charCodeAt(i);
                        if (c === 9 || c === 10 || c === 13 || (c >= 32 && c < 127)) p++;
                    }

                    return p / Math.max(1, s.length);
                };

                return asciiRatio(le) >= asciiRatio(be) ? le : be;
            }

            return decUTF8.decode(bytes);
        }

        const out = {};

        // Walk IFD0
        const {tags: ifd0, next: ifd1Off} = readIFD(ifd0Off);

        // ImageDescription (0x010E) — often plain ASCII/UTF8
        const t010E = ifd0.get(T.ImageDescription);

        if (t010E) {
            const b = readBytes(t010E);
            out.ImageDescription = clean(bestGuess(b));
        }

        // XPComment (0x9C9C) — Windows: UTF-16LE byte array, null-terminated
        const tXP = ifd0.get(T.XPComment);

        if (tXP) {
            const b = readBytes(tXP);
            // Strip trailing double NULs and decode as UTF-16LE
            out.XPComment = clean(decU16LE.decode(b));
        }

        // ExifIFD pointer (0x8769) → go there for UserComment
        const tExifPtr = ifd0.get(T.ExifIFDPointer);

        if (tExifPtr) {
            // ExifIFDPointer value is a LONG offset; if it was inline, it’s still the 4 bytes at entry.dataOffset
            const exifIFDOffset = tExifPtr.inline
            ? new DataView(view.buffer).getUint32(tExifPtr.dataOffset, little) >>> 0
            : (tExifPtr.dataOffset >>> 0); // defensive; normally inline

            const {tags: exifIFD} = readIFD(exifIFDOffset);

            // UserComment (0x9286) — where SD/Comfy often embed params
            const tUC = exifIFD.get(T.UserComment);
            if (tUC) {
                const b = readBytes(tUC);
                out.UserComment = decodeUserComment(b);
            }
        }

        return out;
    }

    static async extractWEBPMetadata_Old(file, metadata) {
        // For WEBP files, we can extract basic metadata using the File API
        metadata.raw['fileName'] = file.name;
        metadata.raw['fileSize'] = file.size;
        metadata.raw['fileType'] = file.type;
        metadata.raw['lastModified'] = new Date(file.lastModified).toISOString();

        // Try to extract metadata from WEBP tags if available
        try {
            // For performance, only read first 1024KB for metadata extraction
            //const maxBytes = Math.min(file.size, 1024 * 1024); // 1MB
            //const buffer = await file.slice(0, maxBytes).arrayBuffer();
            // we read the full buffer
            const buffer = await file.arrayBuffer();
            const dataView = new DataView(buffer);
            
            // Check WEBP signature
            if (buffer.byteLength >= 12) {
                const riffSignature = dataView.getUint32(0);
                const webpSignature = dataView.getUint32(8);
                
                if (riffSignature === 0x52494646 && webpSignature === 0x57454250) { // "RIFF" and "WEBP"
                    metadata.raw['webpSignature'] = 'Valid WEBP file detected';
                    
                    // Try to extract EXIF metadata if present
                    let offset = 12;
                    while (offset < buffer.byteLength - 8) {
                        // Check if we have enough bytes for a chunk header
                        if (offset + 8 > buffer.byteLength) break;
                        
                        const chunkType = String.fromCharCode(
                            dataView.getUint8(offset),
                            dataView.getUint8(offset + 1),
                            dataView.getUint8(offset + 2),
                            dataView.getUint8(offset + 3)
                        );
                        const chunkSize = dataView.getUint32(offset + 4, true); // Little endian
                        
                        // Check if we have enough bytes for chunk data
                        if (offset + 8 + chunkSize > buffer.byteLength) break;
                        
                        // Process EXIF chunk
                        if (chunkType === 'EXIF') {
                            try {
                                const exifData = buffer.slice(offset + 8, offset + 8 + chunkSize);

                                 // Now reuse the same parser as JPEG
                                const exifStrings = this.parseExifStrings(exifData);
                                // Prefer UserComment; fall back to ImageDescription / XPComment
                                const sdText =
                                    exifStrings.UserComment || // <- almost all times the sdText stays here
                                    exifStrings.ImageDescription ||
                                    exifStrings.XPComment ||
                                    "";

                                if (sdText) {
                                    console.log("WEBP EXIF SD text:", sdText);

                                    console.log("exifStrings.UserComment:", exifStrings.UserComment); // from this the sdText was populated
                                    console.log("exifStrings.ImageDescription:", exifStrings.ImageDescription); // empty
                                    console.log("exifStrings.XPComment:", exifStrings.XPComment); // empty

                                    metadata.raw['EXIF'] = '[EXIF data found in WEBP file - stored in metadata.raw.EXIF_text]';
                                    metadata.raw["EXIF_text"] = sdText; //DEBUG
                                }
                            } catch (error) {
                                // Not text data or error reading as text
                                console.error("WEBP EXIF Metadata Processing Error:", error);
                                metadata.raw['EXIF'] = `[WEBP EXIF Metadata Processing Error: ${error.message}]`;
                            }
                        }
                        
                        // Process XMP chunk
                        if (chunkType === 'XMP') {
                            try {
                                const xmpData = buffer.slice(offset + 8, offset + 8 + chunkSize);

                                // Handle found XMP
                                const xmpMetaValue = await this.parseXMPParameters(xmpData, metadata);
                                // this has generated raw "XMP_data" and "XML_meta" metadata
                                if (xmpMetaValue.len > 0)
                                    await this.extractParsedMetadata("XMP_meta", xmpMetaValue, metadata);

                            } catch (error) {
                                // Not text data or error reading as text
                                console.error("WEBP XMP Metadata Processing Error:", error);
                                metadata.raw['XMP'] = `[WEBP XMP Metadata Processing Error: ${error.message}]`;
                            }
                        }
                        
                        offset += 8 + chunkSize;
                        // Skip padding byte if chunk size is odd
                        if (chunkSize % 2 === 1) {
                            offset += 1;
                        }
                    }
                } else {
                    metadata.raw['webpSignature'] = '[Invalid WEBP file signature]';
                }
            } else {
                metadata.raw['webpSignature'] = '[File too small to be a valid WEBP file]';
            }
        } catch (e) {
            metadata.raw['webpMetadataError'] = `[Error extracting WEBP metadata: ${e.message}]`;
        }
                
        return metadata;
    }



    static parseValue(value) {
        // Try to convert to appropriate type
        if (value === 'true') return true;
        if (value === 'false') return false;
        if (value === 'null') return null;
        
        // Try to parse as number
        if (!isNaN(value) && !isNaN(parseFloat(value))) {
            return parseFloat(value);
        }
        
        // Return as string
        return value;
    }

    // RL - BEGIN (ChatGPT old) - not used

    // static function parseAirURN() -> error
    // need to be static parseAirURN()
    static parseAirURN(urn) {
        const airRegex = /urn:air:([^:]+):([^:]+):([^:]+):(\d+)@(\d+)(?=["\],])/;
        // urn:air:     → literal
        // ([^:]+) ×3   → captures sdxl, embedding, civitai
        // (\d+)        → modelId
        // @(\d+)       → versionId
        // (?=["\],])   → lookahead, asserts that the URN is immediately followed by ", ], or , (but doesn’t consume it)
        //
        // e.g. all these match:
        //  ✔ "air":"urn:air:sdxl:embedding:civitai:1302719@1860747",
        //  ✔ "air":"urn:air:sdxl:embedding:civitai:1302719@1860747"]
        //  ✔ urn:air:sdxl:checkpoint:civitai:1277670@1896532

        const match = urn.match(airRegex);

        if (!match) {
            throw new Error(`Invalid AIR URN format: ${urn}`);
        }

        const [ , modelType, resourceType, source, modelId, modelVersionId ] = match;

        return {
            modelType,
            resourceType,
            source,
            modelId: modelId, //parseInt(modelId, 12),
            modelVersionId: modelVersionId, //parseInt(modelVersionId, 12),
            airUrn: urn
        };
    }

    static async enrichResourceOld(resource) {
        const { modelName, versionName, weight = 1.0, air } = resource;
        const parsedAir = parseAirURN(air);

        // Fetch extra info from CivitAI API
        const { modelData, versionData } = await fetchCivitaiInfo(
            parsedAir.modelId,
            parsedAir.modelVersionId
        );

        return {
            modelName,
            versionName,
            weight,
            ...parsedAir,
            modelData,    // full model JSON (creator, tags, categories, etc.)
            versionData   // full version JSON (files, images, hashes, etc.)
        };
    }

    static async enrichAllOld(resources) {
        return Promise.all(resources.map(enrichResourceOld));
    }

    // RL - END (ChatGPT (old) - not used

    // RL - BEGIN (ChatGPT new)
    /**
     * So the full flow is now:
     * - extractResources(meta) → collects raw refs from styles 1–4.
     * - dedupeAndMergeResources(resources) → collapses duplicates (hash / air / id / name).
     * - Promise.all(map(enrichResource)) → parallel API fetch & enrichment.
     * - sortResources() → checkpoint first, then LoRA (alpha), then Embedding (alpha), then unknown.
     */

    /**
     * Batch resolve in parallel + dedupe-merge + sort
     * 
     * returns a pre-sorted, fully enriched array of models.
     * UI can just dump the list → it will always be grouped:
     * - Checkpoints (top, any order inside is kept)
     * - LoRAs (alphabetically by name)
     * - Embeddings (alphabetically by name)
     * - Unknown stragglers last
     */
    static async enrichAllResources(metadata) {
        // Step 1: extract from metadata (parser handles styles 1–4)
        const extractedModels = this.extractResources(metadata.raw["parameters"]);
        console.debug ("Extracted Models:\n" + UI.formatJSON(extractedModels));

        // Step 2: dedupe(+merge) before hitting the CivitAI API
        const dedupedModels = this.dedupeAndMergeResources (extractedModels);
        console.debug("Deduped Models:\n" + UI.formatJSON(dedupedModels));

        // Step 3: resolve all enrichments in parallel
        const enrichedModels = await Promise.all(dedupedModels.map(r => this.enrichResource(r)));
        console.debug("Enriched Models:\n" + UI.formatJSON(enrichedModels));

        // Step 4: sort into groups (Checkpoint → LoRA → Embedding → Unknown)
//TODO - Sort with Object vs Array (see ChatGPT)

        // Only set resolvedModels in metadata if we found some
        //alert(Object.keys(enrichedModels).length); //FIX

        //const sortedEnrichedModels = this.sortResources(enrichedModels);

        // Promise.all(promises) always resolves to an array, no matter what each promise returns.
        // So even if resolveModelResource() returns { key: "lora:123", entry: { … } },
        // the outer Promise.all will wrap them like this:
        //  [
        //      { key: "model", entry: { … } },
        //      { key: "lora:1234567890AB", entry: { … } },
        //      { key: "embed:0987654321", entry: { … } }
        //  ]

        // QUICKFIX (works) - merge shallow objects
        const resolvedModels = Object.assign({}, ...enrichedModels);
        metadata.resolvedModels = resolvedModels;
        //console.debug("resolvedModels (shallow)\n", UI.formatJSON(resolvedModels);

        return resolvedModels;

//TODO - below code is "DEAD" and we only "miss" SORTING

        //const resolvedModels = {};
        const hashes = {};

        for (const res of enrichedModels) { //TODO - sortedEnrichedModels
            if (!res) continue;

            const { key, entry } = res;
            resolvedModels[key] = entry;
            hashes[key] = entry.hash;
        }

        // write back to metadata

        // Only set hashes in metadata if we found some
        if (Object.keys(hashes).length > 0) {
	        metadata.raw['hashes'] = hashes;
        }
        // Only set resolvedModels in metadata if we found some
        alert(Object.keys(resolvedModels).length); //FIX

        if (Object.keys(resolvedModels).length > 0) {
            metadata.resolvedModels = resolvedModels;
        }

        return resolvedModels;
    }

    /**
     * Main extractor
     */
    static extractResources(metadataRawParameters) {
        if (!metadataRawParameters)
            return []; // return an empty resources array

        const resources = [
            ...this.parseStyle0(metadataRawParameters),
            ...this.parseStyle1(metadataRawParameters),
            ...this.parseStyle3(metadataRawParameters),
            ...this.parseStyle4(metadataRawParameters),
            ...this.parseStyle5(metadataRawParameters)
        ];

        return resources;
    }

    // *** helper function (used currently for Style3)
    // getFileName("pony/twilight_style")) will return "twilight_style"
    static getFileName(path) {
        // The regex captures characters that are not a slash or backslash, at the end of the string.
        //const regex = /[/\\]([^/\\]+)$/;
        //const name = path.match(regex)?.[1] || path; // The `?.[1]` extracts the capture group, with a fallback
        //return name;

        const lastSlash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
        if (lastSlash > -1) {
            return path.substring(lastSlash + 1);
        }

        return path;
    }

    static getFileExtension(path) {
        const lastDot = path.lastIndexOf('.');
        if (lastDot > -1) {
            return path.substring(lastDot + 1);
        }

        return "";
    }

    /* name can be:
        "pony/twilight_style" and should be stripped to
        "twilight_style"
        
        "Illustrious\\oneObsession_17RED.safetensors" should be stripped to
        "oneObsession_17RED"

        "Slider_alpha1.0_rank4_noxattn_last.safetensors" should be stripped to
        "Slider_alpha1.0_rank4_noxattn_last"
    */
    static stripPathAndExt(name) {
        if (!name) return null; //name

        name = String(name).trim().replace(/^["']|["']$/g, '');
        name = name.replace(/^.*[\\/]/, ''); // drop path prefix
        name = name.replace(/\.(safetensors|ckpt|pt)$/i, '').trim(); // drop extension

        return name.trim();
    };

    /*
        We need to deal with:
        Lora_0 Model name: Cleavage Slider_alpha1.0_rank4_noxattn_last.safetensors, Lora_0 Model hash: 15b9045d82, Lora_0 Strength model: 1.0000000000000002, Lora_0 Strength clip: 1.0,
        Lora_1 Model name: DetailerILv2-000008.safetensors, Lora_1 Model hash: 528277aedc, Lora_1 Strength model: 2.0000000000000004, Lora_1 Strength clip: 1.0,
        Lora_2 Model name: p0nyd1sney1ncasev1x0n2 - IL -v2.safetensors, Lora_2 Model hash: c3078d8c8c, Lora_2 Strength model: 0.5, Lora_2 Strength clip: 1.0,
        Lora_3 Model name: PinkieRetroAnimeIL.safetensors, Lora_3 Model hash: b4dd0dbb35, Lora_3 Strength model: 0.6, Lora_3 Strength clip: 1.0,
        
        but maybe expand same pattern to 'Embed_' (with .pt embedding files)
        finally 'similar' such multi-instance patterns can exist with 'ADetailer' (see below)

        JavaScript’s RegExp does not support variable placeholders directly inside regex literals (/.../), because literals are compiled statically.
        We can, however, dynamically construct regexes using the RegExp constructor and safely inject your variable after escaping it properly.
        Let’s take our example and make it parameterized.

        original static RegEx:
        const loraTokenRegEx = /Lora_(\d+)\s+Model\s+name\s*:\s*([^,]+)|Lora_(\d+)\s+Model\s*hash\s*:\s*([A-Fa-f0-9]+)/gi;

        ✅ 2. Parameterized version (using a variable prefix)
        Let’s say we want to use "Lora_", "Embed_", etc. interchangeably.

        // Example:
        const loraTokenRegEx = makeTokenRegex('Lora_');
        const embedTokenRegEx = makeTokenRegex('Embed_');

        let match;
        while ((match = loraTokenRegEx.exec(text)) !== null) {
            // match[1], match[2], etc.
        }

        ✅ 5. Example in use
        const regex = makeTokenRegex('ADetailer_');
        const text = 'ADetailer_2 Model name: FancyDetailer.safetensors, ADetailer_2 Model hash: abcd1234';
        let match;
        while ((match = regex.exec(text)) !== null) {
            console.log('index', match.index, '→', match);
        }

        index 0 → [
            'ADetailer_2 Model name: FancyDetailer.safetensors',
            '2',
            'FancyDetailer.safetensors',
            undefined,
            undefined
        ]
        index 60 → [
            'ADetailer_2 Model hash: abcd1234',
            undefined,
            undefined,
            '2',
            'abcd1234'
        ]

        | Goal                            | How
        | ------------------------------- | -------------------------------------------------------------------------
        | Use variable text in regex      | new RegExp(stringWithMyVariable);
        | Escape special regex characters | prefix.replace(/[.*+?^${}()|[\\]/g, '\$&');
        | Multiple possible prefixes      | Combine them into a non-capturing group `(?:Lora_ | ADetailer_ | Embed_)`
        | Iterate matches                 | Always use `.exec()` in a `while` loop with the `g` flag
    */
    static makeTokenRegex(prefix) {
        /*
            If we ever allow prefixes like "Lora+" or "Lora (Main)",
            those characters (+, (, )) would break our regex because they have special meanings.
            That’s why we need to escape, to turn "Lora+" → "Lora\+" before injecting it.
        */
        // Escape any regex special characters in the prefix just in case
        const esc = this.escapeRegex(prefix);

        // Build the pattern dynamically
        const pattern =
            `${esc}(\\d+)\\s+Model\\s+name\\s*:\\s*([^,]+)` +
            `|${esc}(\\d+)\\s+Model\\s*hash\\s*:\\s*([A-Fa-f0-9]+)`;

        // Compile with global & case-insensitive flags
        return new RegExp(pattern, 'gi');
    }
    /*
        ✅ 4. Optional parameter (multiple prefixes)
        We can also build a pattern that matches several prefixes at once
        — e.g. Lora_ or Embed_ or ADetailer_

        // Example: match Lora_, Embed_ or ADetailer_
        const tokenRegEx = makeMultiTokenRegex(['Lora_', 'Embed_', 'ADetailer_']);
    */
    static makeMultiTokenRegex(prefixes) {
        const escaped = prefixes.map(p => this.escapeRegex(p));

        const prefixGroup = `(?:${escaped.join('|')})`; // non-capturing group
        const pattern =
            `${prefixGroup}(\\d+)\\s+Model\\s+name\\s*:\\s*([^,]+)` +
            `|${prefixGroup}(\\d+)\\s+Model\\s*hash\\s*:\\s*([A-Fa-f0-9]+)`;
            
        return new RegExp(pattern, 'gi');
    }

    // higher-level structured params, parsed by parseStyle0() - parseStyle5()
    static modelReferencePatterns = {
        "style0_inPromptRefs":  /<(lora|embed):([^:]+):([^>]+)>/g, // Style0 "in-prompt" references
        "style1a_modelHash":    /(?:^|,)\s*Model hash:\s*([a-fA-F0-9]{10,12})/i, // Style1
        "style1b_model":        /(?:^|,)\s*Model:\s*([^,]+)/i, // Style1
        // Style2 = "Lora_" (separatly parsed)
        "style3_hashes":        /Hashes:\s*({.*?})/i, // Style3
        "style4a_loraHashes":   /Lora hashes:\s*"(.*?)"/i, // Style4
        "style4b_tiHashes":     /TI hashes:\s*"(.*?)"/i, // Style4
        "style5_Civitai":       /Civitai resources:\s*(\[.*?\])(?:,|$)/is // Style5
    };

    /*
     * Style 0: "<lora:name:weight>" (in-prompt references)
     */
    static parseStyle0(metadataRawParameters) {
        /* e.g.
            <lora:betterCuteAsian03:0.3>, woman posing for a photo,
            (wearing deep_v-neck_dress:1.2), (very_long_hair:1.3), good hand,
            4k, high-res, masterpiece, best quality, head:1.3, ((Hasselblad photography)),
            finely detailed skin, sharp focus, (cinematic lighting), night, soft lighting,
            dynamic angle, [:(detailed face:1.2):0.2], (((5 stars hotel background))),
            <lora:deep_v-neck_dress:0.4>, <lora:very_long_hair-10:0.4>

            [
                {
                    "type": "lora",
                    "name": "betterCuteAsian03",
                    "weight": 0.3
                },
                {
                    "type": "lora",
                    "name": "deep_v-neck_dress",
                    "weight": 0.4
                },
                {
                    "type": "embed",
                    "name": "very_long_hair-10",
                    "weight": 0.4
                }
            ]


            RegEx
            /<(?:lora|embed):([^:]+):([^>]+)>/g

            Breakdown of the changes

            (?:lora|embed): This is the non-capturing group for alternation.

            lora matches the literal string "lora".
            | acts as an "OR" operator.
            embed matches the literal string "embed".

            ?: makes the group non-capturing, which means it matches the content but does not save it as a numbered group. This ensures that the name is still the first captured group and weight is the second.

        */ 
        //const text = "<lora:betterCuteAsian03:0.3>, woman posing for a photo, (wearing deep_v-neck_dress:1.2), (very_long_hair:1.3),\ngood hand,4k, high-res, masterpiece, best quality, head:1.3,((Hasselblad photography)), finely detailed skin, sharp focus, (cinematic lighting), night, soft lighting, dynamic angle, [:(detailed face:1.2):0.2],(((5 stars hotel background))),  <lora:deep_v-neck_dress:0.4> ,  <embed:very_long_hair-10:0.4>";

        // Make the type a capturing group: (lora|embed)
        //const tagRegex = /<(lora|embed):([^:]+):([^>]+)>/g;
        const tagRegex = this.modelReferencePatterns["style0_inPromptRefs"];
        const tagMatches = metadataRawParameters.matchAll(tagRegex);
        const tags = [];
        let i = 0;

        for (const matchModel of tagMatches) {
            i++; // index for "Unknown" hashes, if they are not unique they get "deduped"
            const type = (matchModel) ? matchModel[1] : "Unknown"; // First captured group
            const name = (matchModel) ? matchModel[2] : "Unknown";  // Second captured group
            const weight = parseFloat(matchModel[3]); // Third captured group

            /*
                tags.push({
                    type: type,
                    name: name,
                    weight: weight
                });
                }

                // Convert the final array of objects to a JSON string with indentation
                //const tagJson = JSON.stringify(tags, null, 2);

                //console.log(tagJson);
            */

            tags.push({
                displayType: this.normalizeType("Lora", type),
                type: type,
                prefix: type,
                //hash: `Unknown`, // ${i} unique "Unknown1", "Unknown2", ... hashes, so the not get deduped
                name: name,
                // weight: matchModel[3],
                source: "Style0"
            });
        }

        return tags;
    }

    /*
     * Style 1: "Model hash: 217daae812"
     * be careful not to parse the variant ", Lora_2 Model hash: c3078d8c8c,"
     * e.g.
     * Lora_2 Model name: p0nyd1sney1ncasev1x0n2 - IL -v2.safetensors, Lora_2 Model hash: c3078d8c8c, Lora_2 Strength model: 0.5, Lora_2 Strength clip: 1.0,
     * also prevent matching "Model:" substrings like "Strength model: 0.5"
     */
    static parseStyle1(metadataRawParameters) {
        // Require that "Model hash:" is either at start OR immediately follows a comma (,)
        //const regexModelHash = /(?:^|,)\s*Model hash:\s*([a-fA-F0-9]{10,12})/i;
        const matchModelHash = metadataRawParameters.match(this.modelReferencePatterns["style1a_modelHash"]);

        if (!matchModelHash) return [];

        // often Style1 also has a "Model:" entry near it, e.g.
        // , Model hash: 217daae812, Model: JANKUV5NSFWTrainedNoobai_v50, ...
        // or
        // , Model: Illustrious\\oneObsession_17RED.safetensors, Model hash: 2ae98c944e, ...

        // the "Model:" name can only enrich an existing "Model hash", but is not found alone (without a "Model hash")
        // ALWAYS require that "Model:" is either at start OR immediately follows a comma ','
        //const regexModel = /(?:^|,)\s*Model:\s*([^,]+)/i;
        const matchModel = metadataRawParameters.match(this.modelReferencePatterns["style1b_model"]);

        return [
            {
                displayType: this.normalizeType("Checkpoint", "model"), //displayTypeMap["Model hash"],
                type: "Checkpoint",
                prefix: "model",
                hash: (matchModelHash) ? matchModelHash[1].trim() : "Unknown",
                name: (matchModel) ? this.stripPathAndExt(matchModel[1].trim()) : "Unkown",
                source: "Style1"
            }
        ];
    }

    /*
     * Style 2:
        Lora_0 Model name: Cleavage Slider_alpha1.0_rank4_noxattn_last.safetensors, Lora_0 Model hash: 15b9045d82, Lora_0 Strength model: 1.0000000000000002, Lora_0 Strength clip: 1.0,
        Lora_1 Model name: DetailerILv2-000008.safetensors, Lora_1 Model hash: 528277aedc, Lora_1 Strength model: 2.0000000000000004, Lora_1 Strength clip: 1.0,
        Lora_2 Model name: p0nyd1sney1ncasev1x0n2 - IL -v2.safetensors, Lora_2 Model hash: c3078d8c8c, Lora_2 Strength model: 0.5, Lora_2 Strength clip: 1.0,
        Lora_3 Model name: PinkieRetroAnimeIL.safetensors, Lora_3 Model hash: b4dd0dbb35, Lora_3 Strength model: 0.6, Lora_3 Strength clip: 1.0,
     */
    static parseStyle2(metadataRawParameters) {
        const result = {};
        const loras = {}; // by index -> { name?, hash? }
        const loraTokenRegEx = this.makeTokenRegex('Lora_');

        let match;
        while ((match = loraTokenRegEx.exec(metadataRawParameters)) !== null) {
            // match[1], match[2], etc.
            if (match[1] && match[2]) { // Lora_i Model name:
                const idx = parseInt(match[1], 10);
                loras[idx] = loras[idx] || {};
                loras[idx].name = this.stripPathAndExt(match[2]);
            } else if (match[3] && match[4]) { // Lora_i Model hash:
                const idx = parseInt(match[3], 10);
                loras[idx] = loras[idx] || {};
                loras[idx].hash = match[4].trim();
            }
        }

        if (Object.keys(loras).length === 0)
            return []; // no match for this Style

        // final assembly: prefer name keys, fallback to index keys
        const idxs = Object.keys(loras).map(x => parseInt(x, 10)).sort((a, b) => a - b);
        for (const i of idxs) {
            const o = loras[i];
            if (!o || !o.hash) continue;

            if (o.name) result[`lora:${o.name}`] = o.hash;
            else result[`lora:${i}`] = o.hash;
        }

        return Object.entries(result).map(([key, hash]) => {
            let [prefix, name] = key.includes(":") ? key.split(":") : [key, ''];

            return {
                displayType: this.normalizeType(prefix, `${prefix}:${name}`),
                type: 'LORA',
                prefix: prefix, // 'lora'
                hash: hash,
                name: name,
                source: "Style2"
            };
        });
    }

    /*
     * Style 3: …, Hashes: {"embed:lazypos":"3086669265","embed:lazyneg":"ba21023c70","model":"217daae812”}, …
        or e.g. from 105642609.webp
        Hashes: {"model": "2ae98c944e", "lora:Cleavage Slider_alpha1.0_rank4_noxattn_last": "15b9045d82", "lora:DetailerILv2-000008": "528277aedc", "lora:p0nyd1sney1ncasev1x0n2 - IL -v2": "c3078d8c8c", "lora:PinkieRetroAnimeIL": "b4dd0dbb35"}
     */
    static parseStyle3(metadataRawParameters) {
        //const regex = /Hashes:\s*({.*?})(?:,|$)/i; // not always worked as there sometimes the comma is missing
        //const regex = /Hashes:\s*({.*?})(?:s*|,|$)/i; // fixed and added s*  - should work, but not really needed
        //const regex = /Hashes:\s*({[^}]+})/i; // seems also to work (but not consistant with Style4 regEx)
        //const regexHashes = /Hashes:\s*({.*?})/i; // only match everything between the curly brackets {...}
        const hashesMatch = metadataRawParameters.match(this.modelReferencePatterns["style3_hashes"]);

        if (!hashesMatch)
            return [];
        
        let parsedHashes = [];

        try {
            parsedHashes = JSON.parse(hashesMatch[1]);
        } catch { // Not valid JSON, try to parse as key-value pairs
            //return [];
            const hashesText = hashesMatch[1];
            const hashPairs = hashesText.match(/"([^"]+)":"([^"]+)"/g);
            if (hashPairs) {
                for (const pair of hashPairs) {
                    let [key, value] = pair.replace(/"/g, '').split(':');
                    let [type, name] = key.includes(":") ? key.split(":") : [key, ''];
                    type = type.toLowerCase(); // can have "lora:xxx" OR "LORA:yyy"
                    name = this.stripPathAndExt(name);
                    parsedHashes[`${type}:${name}`] = value;
                }
            }
        }

        // sometimes Style3 "Hashes" also contain a 'model' hash (without a name),
        // and also has a "Model: " entry near it, e.g.
        // Hashes: {"model": "59225eddc3", "lora:hololive_kaela_kovalskia_redebut": "11bc3bab82",
        //  "lora:Butterfly_Applique_Black_Silk_Chiffon_Party_Dress": "c555e1d0f1", ... }
        // the "Model:" name can only enrich an existing "Model hash", or Hashes: {"model:"},
        // but is typically not found alone (without a "Model hash", or "Hashes" dict)
        return Object.entries(parsedHashes).map(([key, val]) => {
            let [type, name] = key.includes(":") ? key.split(":") : [key, ''];
            type = type.toLowerCase(); // can have "lora:xxx" OR "LORA:yyy"
            if (type === 'model' && name === '') {
                // try to get the missing 'name' from a separate "Model:" metadata property
                // ALWAYS require that "Model:" is either at start OR immediately follows a comma ','
                //const regexModel = /(?:^|,)\s*Model:\s*([^,]+)/i;
                const matchModel = metadataRawParameters.match(this.modelReferencePatterns["style1b_model"]);
                if (matchModel)
                    name = matchModel[1]; // update the empty name with found "Model"
            }
            //TODO - leave the 'embed' 12-char hashes unchanged
            // (even we know they mostly only work as 10-char "candidates")
            // for now leave that to the dedupeAndMergeResources() function

            // lora hashes can come in the following format:
            //  "LORA:pony/twilight_style" and should be stripped to "LORA:twilight_style"
            name = this.stripPathAndExt(name); // cut path prefix

            return {
                displayType: this.normalizeType(type, key), //displayTypeMap[type] || "Unknown",
                type: (type === 'model') ? 'Checkpoint' : (type === 'lora') ? 'LORA' : (type === 'embed') ? 'TextualInversion' : (type === 'adetailer') ? 'ADetailer' : type, // last fallback to 'unknown' type (but preserve it)
                prefix: type, // 'model', "lora", 'embed', 'adetailer'
                hash: val.trim(),
                name: name.trim(),
                source: "Style3"
            };
        });
    }

    /**
     * Style 4: Lora hashes / TI hashes
     * 
     * Example:
     * Lora hashes: "TrendCraft_The_Peoples_Style_Detailer-v2.4I-5_18_2025-Illustrious: 6a2b18d95a97, breasts_size_slider_illustrious_goofy: 419768fc16a7, pkmndiantha-illu-nvwls-v1: e45d18e63514”, …
     * 
     * Example (with duplicates):
     * TI hashes: "lazyneg: ba21023c7054, lazyhand: 3cc8f76aaf5a, lazyneg: ba21023c7054, lazyhand: 3cc8f76aaf5a", …
     */
    static parseStyle4(metadataRawParameters) {
        const results = [];
        // Look for Lora hashes pattern: Lora hashes: "name1: hash1, name2: hash2, ..."
        //const regexLoraHashes = /Lora hashes:\s*"(.*?)"/i; // /Lora hashes:\s*"([^"]+)"/i
        // Look for TI hashes pattern: TI hashes: "name1: hash1, name2: hash2, ..."
        //const regexTiHashes = /TI hashes:\s*"(.*?)"/i; // /TI hashes:\s*"([^"]+)"/i
        //TODO: "TI: " only

        const parsePairs = (str, prefix) =>
            str.split(/\s*,\s*/).map(pair => {
            const [name, hash] = pair.split(/\s*:\s*/);

            return {
                displayType: this.normalizeType(prefix, `${prefix}:${name}`),
                type: (prefix === 'lora') ? 'LORA' : (prefix === "embed") ? "TextualInversion" : prefix,
                prefix: prefix,
                hash: hash.trim(),
                name: this.stripPathAndExt(name.trim()),
                source: "Style4"
            };
        });

        const loraHashesMatch = metadataRawParameters.match(this.modelReferencePatterns["style4a_loraHashes"]);

        if (loraHashesMatch)
            results.push(...parsePairs(loraHashesMatch[1], "lora")); // "Lora hashes"

        const tiHashesMatch = metadataRawParameters.match(this.modelReferencePatterns["style4b_tiHashes"]);
        if (tiHashesMatch)
            results.push(...parsePairs(tiHashesMatch[1], "embed")); // "TI hashes"

        // Note: There can be duplicates, so we need to handle that
        // Deduplicate by hash
        return Array.from(new Map(results.map(r => [r.hash, r])).values());
    }

    /*
     * Style 5: Civitai resources: [ ... ]
     * air URN format spec:
     * urn:air:{ecosystem}:{type}:{source}:{id}@{version}
     * ecosystem = e.g. sd1, sd2, sdxl
     * type = resource type (e.g. model, lora, embedding, hypernet)
     * source = typically civitai in our case
     * id = modelId
     * version = modelVersionId
     * e.g.
     * urn:air:sdxl:checkpoint:civitai:1277670@1896532
     * urn:air:sdxl:lora:civitai:915918@1244133
     * urn:air:sdxl:embedding:civitai:1302719@1833157
     * 
     *  "AIR" URNs Regex - dynamic for all modelTypes:
     * const airRegex = /urn:air:([^:]+):([^:]+):([^:]+):(\d+)@(\d+)(?=["\],])/;
     * urn:air: → literal
     * ([^:]+) ×3 → captures ecosystem/modelType (e.g. sdxl), embedding, civitai
     *            → resource type (e.g. checkpoint, lora, embedding)
     *            → source (e.g. civitai)
     * (\d+) → modelId
     * @(\d+) → modelVersionId
     * (?=["\],]) → lookahead, asserts that the URN is immediately followed by ", ], or , (but doesn’t consume it)
     * 
     *  e.g. all these match:
     *   ✔ "air":"urn:air:sdxl:embedding:civitai:1302719@1860747",
     *   ✔ "air":"urn:air:sdxl:embedding:civitai:1302719@1860747"]
     *   ✔ urn:air:sdxl:checkpoint:civitai:1277670@1896532
     * 
     * Example:
     * 
     * Civitai resources: [
     * "{modelName":"\u2728 JANKU v5 NSFW Trained + NoobAI + RouWei Illustrious XL \u2728",
     * "versionName":"v5.0 \ud83c\udd95",
     * "air":"urn:air:sdxl:checkpoint:civitai:1277670@1896532"},
     * 
     * {"modelName":"Stabilizer IL/NAI","versionName":"illus01 v1.198",
     * "weight":0.5,
     * "air":"urn:air:sdxl:lora:civitai:971952@2055853"},
     * 
     * {"modelName":"MoriiMee Gothic Niji | LoRA Style",
     * "versionName":"V1 Ilustrious",
     * "weight":0.8,
     * "air":"urn:air:sdxl:lora:civitai:915918@1244133"},
     * 
     * {"modelName":"Inkyo - Illustrious Custom Style",
     * "versionName":"V1",
     * "weight":0.6,
     * "air":"urn:air:sdxl:lora:civitai:1726453@1953811"},
     * 
     * {"modelName":"\u2728 Lazy Embeddings for ALL illustrious NoobAI Pony SDXL models LazyPositive LazyNegative (Positive and Negative plus more!)",
     * "versionName":"lazypos v2",
     * "weight":1.0,
     * "air":"urn:air:sdxl:embedding:civitai:1302719@1833157"},
     * 
     * {"modelName":"\u2728 Lazy Embeddings for ALL illustrious NoobAI Pony SDXL models LazyPositive LazyNegative (Positive and Negative plus more!)",
     * "versionName":"lazyneg v3",
     * "weight":1.0,
     * "air":"urn:air:sdxl:embedding:civitai:1302719@1860747"}
     * ]
     */
    static parseStyle5(metadataRawParameters) {
        // Look for "AIR" URNs (they are equally unique as a hash)
        //const regex = /Civitai resources:\s*(\[.*?\])(?=[,}\]])/is;
        //const regexCivitai = /Civitai resources:\s*(\[.*?\])(?:,|$)/is;
        const regexCivitai = this.modelReferencePatterns["style5_Civitai"]
        // Civitai resources: → literal prefix
        // \s*          → allow spaces
        // (\[.*?\])    → capture the JSON array, non-greedy
        // (?=[,}\]])   → lookahead: array must be followed by ,, }, or ] (so we stop cleanly)

        // use regex.exec(text), instead of text.match(regex), as it loops thru the arr, match() does only work for first arr instance
        //const match = metadataRawParameters.match(regexCivitai);
        const match = regexCivitai.exec(metadataRawParameters);
        if (!match)
            return [];

        let arr;
        try {
            arr = JSON.parse(match[1]); // get the AIR URN JSON array
        } catch(e) {
            const Style5Error = `Style5 Parser: 'Civitai resources' block found in 'raw' metadata, but cannot be parsed as JSON: ${e}\n${UI.formatJSON(metadataRawParameters)}`;
            console.log(Style5Error);

            return [];
        }

        // loop thru the arr
        return arr.map(r => {
            //const airRegex = /urn:air:([^:]+):([^:]+):([^:]+):(\d+)@(\d+)(?=["\],])/; // this not work with the lookahead (not match)
            const airCivitaiRegex = /urn:air:([^:]+):([^:]+):civitai:(\d+)@(\d+)/; //(?=["\],])/; //note also that 'civitai' is hardcoded here (that reduces the match index by 1)
            // urn:air:     → literal
            // civitai:     → literal (as it comes from "Civitai resources" air URN array)
            // ([^:]+) ×2   → captures modelType (e.g. sdxl) and resourceType (e.g. checkpoint, lora, embedding, ...)
            // (\d+)        → modelId
            // @(\d+)       → versionId
            //
            // (?=["\],])   → NOT NEEDED and NOT always works: non-greedy lookahead, asserts that the URN is immediately followed by ", ], or , (but doesn’t consume it)
            //
            // e.g. all these match:
            //  ✔ "air":"urn:air:sdxl:embedding:civitai:1302719@1860747",
            //  ✔ "air":"urn:air:sdxl:embedding:civitai:1302719@1860747"]
            //  ✔ urn:air:sdxl:checkpoint:civitai:1277670@1896532

            const airMatch = r.air?.match(airCivitaiRegex);
            if (airMatch) {
                const [ , modelType, resourceType, modelId, modelVersionId ] = airMatch;
                const airURN = `urn:air:${modelType}:${resourceType}:civitai:${modelId}@${modelVersionId}`;
            }
            /*
            airMatch === undefined, if no "air" found
            "./Test Images/96602721.jpeg" has a different layout:
                {
                "type":"lora",
                "weight":1,
                "modelVersionId":2148734,
                "modelName":"Christie - Dead or Alive l IllustriousXL (3 Outfits)",
                "modelVersionName":"v1.0"
                }

            "./Test Images/93890153.jpeg" (with "air"):
                {
                "modelName":"\u2728 Lazy Embeddings for ALL illustrious NoobAI Pony SDXL models LazyPositive LazyNegative (Positive and Negative plus more!)",
                "versionName":"lazypos v2",
                "weight":1.0,
                "air":"urn:air:sdxl:embedding:civitai:1302719@1833157"
                }
            */
            return {
                type: // needs to by synced with the normalizeType() helper function
                    r.air?.includes(":lora:") ? "LORA" :
                    r.air?.includes(":embedding:") ? "TextualInversion" :
                    r.air?.includes(":checkpoint:") ? "Checkpoint" : 
                    (airMatch?.[2]) ? (airMatch?.[2]) : r.type,
                name: r.modelName,
                version: (r.versionName) ? (r.versionName) : r.modelVersionName,
                weight: r.weight ?? 1.0, // default 1.0 if missing
                airUrn: (r.air),
                modelType: airMatch?.[1], // e.g. "sdxl"
                resourceType: (airMatch?.[2]) ? airMatch?.[2] : r.type, // e.g. "checkpoint", "lora", "embedding", ...
                // as we cannot reliably expect always to have a 'modelId' in Style5,
                // it is better to avoid it at all, and let resolveByModelVersionId() resolve it
                modelId: (airMatch?.[3]) ? airMatch?.[3] : undefined, // pass the modelId as 'undefined' to trigger it
                modelVersionId: (airMatch?.[4]) ? airMatch?.[4] : r.modelVersionId,
                source: "Style5"
            };
        });
    }

    /**
     * Deduplicate (and merge) resources across all styles
     * 
     * Merge resources with style priority and debug tracing.
     * Preference order: Style5 > Style4 > Style3 > Style2 > Style1 > Style0
     * - Style5 (CivitAI resources / air URNs) → already has modelName, versionName, weight.
     * - Style4 (Lora hashes / TI hashes) → at least differentiates LoRA vs Embedding.
     * - Style3 (Hashes map) → contains different resource types, sometimes only type + hash, more often type:name + hash
     * - Style2 (Lora_x pairs) → contains Lora_0 Model name, Lora_0 Model hash, ...,
     * - Style1 (Model hash) → minimal info, just the raw checkpoint hash.
     * - Style0 (Lora tags) → super minimal, only a searchable name
     * 
     * Priority-based Merge:
     * - If the same model (by hash, air, or id) shows up in multiple styles, keep the one from the highest-preference style.
     * - That means Style5 overrides Style4/3/2/1/0, Style4 overrides 3/2/1/0, etc.
     * 
     * Merge-aware deduplication of properties:
     * - Each extracted resource should carry a style property (0, 1, 2, 3, 4) so we know where it came from.
     * - Deduplication picks the best version of a model reference based on your preference.
     * - Style priority decides which entry is the base.
     * - Any missing fields (like hash, weight, trainedWords) are pulled from lower-priority duplicates.
     * - That way, if Style5 doesn’t include a hash but Style4 does → we keep both.
     * 
     * - wired in some per-field debug tracing so you can later see exactly which Style contributed which property.
     */
    static dedupeAndMergeResources(resources, { debug = true } = {}) {
        const stylePriority = { 5: 5, 4: 4, 3: 3, 2: 2, 1: 1, 0: 0 };
        /*  *** Test with ./Test Images/94306873.png
            EXIF_fields:
            parameters\u00001girl,…
            Need to cut leading parameters\u00001
            The \u0000 only is seen in dthe debug console
            parameters1girl, solo, lazypos, anime-style, detailed background, vibrant colors, delicate,
            dreamy, cinematic lighting,volumetric lighting,ray tracing, natural shadows, dim light,
            moon light, night, starry sky, <lora:hololive_kaela_kovalskia_redebut:0.5> kaela20,
            blonde hair, long hair, red eyes, smile, smug, <lora:Butterfly_Applique_Black_Silk_Chiffon_Party_Dress:1> Butterfly_Appliqu_Black_Silk_Chiffon_Party_Dress,
            bare shoulders, bare arms, black dress, short dress, strapless, sleeveless, butterfly print,
            lace, sash, bow, bare foot, outdoors, lake, grass,flower, running, jump, jumping, midair,
            low angle side view, mountainous horizon, <lora:USNR_STYLE_ILL:0.5> usnr <lora:WSSKX_WAI:0.3> <lora:TRT_IL:0.65> <lora:DynamicPoseIL2att_alpha1_rank4_noxattn_900steps:2> dynamic pose,
            foreshortening, extreme perspective <lora:Smooth_Booster_v3:0.45>
              Negative prompt: lazyneg, lazyhand, nsfw, (sweat:1.5), (goggles:1.5), sunglasses, (jewelry:1.5),
            (earrings:1.5), gem, gemstone, (hair ribbon:1.5), (hair bow:1.5), (earring:1.5), bad perspective,
            poor lighting, missing limbs, cityscape, architecture, glass, glass window, wooden frame, photo,
            photorealistic, realistic, head out of window frame Steps: 30,
            Sampler: Euler a, Schedule type: Karras, CFG scale: 5, Seed: 4281457553, Size: 832x1216,
            Model hash: 59225eddc3, Model: JANKUV4NSFWTrainedNoobaiEPS_v40, Denoising strength: 0.3, Clip skip: 2,
            ENSD: 31337, RNG: CPU, Hashes: {"model": "59225eddc3", "lora:hololive_kaela_kovalskia_redebut": "11bc3bab82",
              "lora:Butterfly_Applique_Black_Silk_Chiffon_Party_Dress": "c555e1d0f1", "lora:USNR_STYLE_ILL": "44586d0587",
              "lora:WSSKX_WAI": "e6b4013103", "lora:TRT_IL": "4f993f5458", "lora:DynamicPoseIL2att_alpha1_rank4_noxattn_900steps": "629144e9d8",
              "lora:Smooth_Booster_v3": "61d7ee6c08", "adetailer:face_yolov9c.pt": "d02fe493c3",
              "adetailer:hand_yolov9c.pt": "6f116f686e", "adetailer:foot_yolov8x_v2.pt": "9f39f32ab8",
              "embed:lazypos": "3086669265", "embed:lazyneg": "ba21023c70", "embed:lazyhand": "3cc8f76aaf"},
            ADetailer model: face_yolov9c.pt, ADetailer prompt: "extremely detailed eyes, extremely detailed face, <lora:hololive_kaela_kovalskia_redebut:0.75> kaela20, red eyes, smile",
            ADetailer negative prompt: "lazyneg, (sweat:1.5), poorly drawn eyes, unaligned eyes, badly shaped eyes, creepy smile, sinister smile, wide smile, freckles, blush",
            ADetailer confidence: 0.7, ADetailer dilate erode: 4, ADetailer mask blur: 4, ADetailer denoising strength: 0.4, ADetailer inpaint only masked: True, ADetailer inpaint padding: 32,
            ADetailer model 2nd: hand_yolov9c.pt, ADetailer prompt 2nd: "finely drawn hand, ultra detailed hand, (perfect hands), (four fingers and one thumb)",
            ADetailer negative prompt 2nd: "lazyneg, lazyhand, badly drawn hand, poorly drawn hand, 4fingers, 3fingers, 6fingers",
            ADetailer confidence 2nd: 0.6, ADetailer dilate erode 2nd: 4, ADetailer mask blur 2nd: 4, ADetailer denoising strength 2nd: 0.4, ADetailer inpaint only masked 2nd: True, ADetailer inpaint padding 2nd: 32,
            ADetailer model 3rd: foot_yolov8x_v2.pt, ADetailer prompt 3rd: "finely drawn foot, ultra detailed foot, (perfect foot)",
            ADetailer negative prompt 3rd: "lazyneg, badly drawn foot, poorly drawn foot",
            ADetailer confidence 3rd: 0.3, ADetailer dilate erode 3rd: 4, ADetailer mask blur 3rd: 4, ADetailer denoising strength 3rd: 0.4, ADetailer inpaint only masked 3rd: True, ADetailer inpaint padding 3rd: 32,
            ADetailer version: 25.3.0, Hires upscale: 2, Hires upscaler: 4x_foolhardy_Remacri,
            Lora hashes: "hololive_kaela_kovalskia_redebut: 11bc3bab8208, Butterfly_Applique_Black_Silk_Chiffon_Party_Dress: c555e1d0f1be, USNR_STYLE_ILL: 44586d05878a, WSSKX_WAI: e6b401310305,
             TRT_IL: 4f993f545850, DynamicPoseIL2att_alpha1_rank4_noxattn_900steps: 629144e9d885, Smooth_Booster_v3: 61d7ee6c08bd",
            TI hashes: "lazypos: 30866692653c, lazypos: 30866692653c,
             lazyneg: ba21023c7054, lazyhand: 3cc8f76aaf5a, lazyneg: ba21023c7054, lazyhand: 3cc8f76aaf5a,
             lazypos: 30866692653c, lazypos: 30866692653c, lazyneg: ba21023c7054, lazyhand: 3cc8f76aaf5a,
             lazyneg: ba21023c7054, lazyhand: 3cc8f76aaf5a",
            Emphasis: Original, Version: classic

            Style3::
            LoRAs with 10-char WRONG Style3 “Hashes”:
            Hashes: {"model": "59225eddc3", "lora:hololive_kaela_kovalskia_redebut": "11bc3bab82", "lora:Butterfly_Applique_Black_Silk_Chiffon_Party_Dress": "c555e1d0f1", "lora:USNR_STYLE_ILL": "44586d0587", "lora:WSSKX_WAI": "e6b4013103", "lora:TRT_IL": "4f993f5458", "lora:DynamicPoseIL2att_alpha1_rank4_noxattn_900steps": "629144e9d8", "lora:Smooth_Booster_v3": "61d7ee6c08",

            New hash type: ‘adetailer’ hash (found in Style3 “Hashes”), but also found separately (see below):
            Hashes: {"model": "59225eddc3", "lora:hololive_kaela_kovalskia_redebut": "11bc3bab82", "lora:Butterfly_Applique_Black_Silk_Chiffon_Party_Dress": "c555e1d0f1", "lora:USNR_STYLE_ILL": "44586d0587", "lora:WSSKX_WAI": "e6b4013103", "lora:TRT_IL": "4f993f5458", "lora:DynamicPoseIL2att_alpha1_rank4_noxattn_900steps": "629144e9d8", "lora:Smooth_Booster_v3": "61d7ee6c08", "adetailer:face_yolov9c.pt": "d02fe493c3", "adetailer:hand_yolov9c.pt": "6f116f686e", "adetailer:foot_yolov8x_v2.pt": "9f39f32ab8", "embed:lazypos": "3086669265", "embed:lazyneg": "ba21023c70", "embed:lazyhand": "3cc8f76aaf"}

            Type “adetailer”:
            "adetailer:face_yolov9c.pt": "d02fe493c3", "adetailer:hand_yolov9c.pt": "6f116f686e", "adetailer:foot_yolov8x_v2.pt": "9f39f32ab8"
            
            “embed” (TI) with 10-char RIGHT (and without duplicates) found in Style3 “Hashes”:
            "embed:lazypos": "3086669265", "embed:lazyneg": "ba21023c70", "embed:lazyhand": "3cc8f76aaf"}

            Style4::
            But then later in the same metadata:
            Same LoRAs with 12-char RIGHT Style4 "Lora hashes":
            Lora hashes: "hololive_kaela_kovalskia_redebut: 11bc3bab8208, Butterfly_Applique_Black_Silk_Chiffon_Party_Dress: c555e1d0f1be, USNR_STYLE_ILL: 44586d05878a, WSSKX_WAI: e6b401310305, TRT_IL: 4f993f545850, DynamicPoseIL2att_alpha1_rank4_noxattn_900steps: 629144e9d885, Smooth_Booster_v3: 61d7ee6c08bd"

            TI with duplicates and 12-char WRONG (need 10-chars) Style4 "TI hashes":
            TI hashes: "lazypos: 30866692653c, lazypos: 30866692653c, lazyneg: ba21023c7054, lazyhand: 3cc8f76aaf5a, lazyneg: ba21023c7054, lazyhand: 3cc8f76aaf5a, lazypos: 30866692653c, lazypos: 30866692653c, lazyneg: ba21023c7054, lazyhand: 3cc8f76aaf5a, lazyneg: ba21023c7054, lazyhand: 3cc8f76aaf5a"

            ADetailer:
            "adetailer" hashes found in Style3 "Hashes" (3x for 'face_*', 'hand_*', and 'foot_*'),
            (see above in Style3, but additionally metadata keys for this 3 'adetailer' models can exist, like:
                "ADetailer model:", "ADetailer prompt:", "ADetailer negative prompt:"
            and even this 3 keys repeated with " 2nd" and " 3rd" suffixes, e.g.
            ADetailer model: face_yolov9c.pt,
            ADetailer prompt: "extremely detailed eyes, extremely detailed face, <lora:hololive_kaela_kovalskia_redebut:0.75> kaela20, red eyes, smile"
            ADetailer negative prompt: "lazyneg, (sweat:1.5), poorly drawn eyes, unaligned eyes, badly shaped eyes, creepy smile, sinister smile, wide smile, freckles, blush"

            ADetailer model 2nd: hand_yolov9c.pt
            ADetailer prompt 2nd: "finely drawn hand, ultra detailed hand, (perfect hands), (four fingers and one thumb)"
            ADetailer negative prompt 2nd: "lazyneg, lazyhand, badly drawn hand, poorly drawn hand, 4fingers, 3fingers, 6fingers"

            ADetailer model 3rd: foot_yolov8x_v2.pt
            ADetailer prompt 3rd: "finely drawn foot, ultra detailed foot, (perfect foot)"
            ADetailer negative prompt 3rd: "lazyneg, badly drawn foot, poorly drawn foot"

            passed in from that "prompt" in "resources" parameter:

            [
            {
                "displayType": "Checkpoint",
                "type": "Checkpoint",
                "prefix": "model",
                "name": "JANKUV4NSFWTrainedNoobaiEPS_v40", <--- swap hash with name
                "hash": "59225eddc3", <-- RIGHT "model" 10-char hash from Style1
                "source": "Style1"
            },
            {
                "displayType": "Checkpoint",
                "type": "Checkpoint",
                "prefix": "model",
                "hash": "59225eddc3", <-- RIGHT "model" 10-char hash from Style3
                "name": "model", <-- here we LOOSE the name from Style1 for the "Hashes" dict
                "source": "Style3"
            },
            {
                "displayType": "LoRA",
                "type": "LORA",
                "prefix": "lora",
                "hash": "11bc3bab82", <-- WRONG "lora" 10-char hash from Style3
                "name": "hololive_kaela_kovalskia_redebut",
                "source": "Style3"
            },
            {
                "displayType": "LoRA",
                "type": "LORA",
                "prefix": "lora",
                "hash": "c555e1d0f1", <-- WRONG "lora" 10-char hash from Style3
                "name": "Butterfly_Applique_Black_Silk_Chiffon_Party_Dress",
                "source": "Style3"
            },
            {
                "displayType": "LoRA",
                "type": "LORA",
                "prefix": "lora",
                "hash": "44586d0587", <-- WRONG "lora" 10-char hash from Style3
                "name": "USNR_STYLE_ILL",
                "source": "Style3"
            },
            {
                "displayType": "LoRA",
                "type": "LORA",
                "prefix": "lora",
                "hash": "e6b4013103", <-- WRONG "lora" 10-char hash from Style3
                "name": "WSSKX_WAI",
                "source": "Style3"
            },
            {
                "displayType": "LoRA",
                "type": "LORA",
                "prefix": "lora",
                "hash": "4f993f5458", <-- WRONG "lora" 10-char hash from Style3
                "name": "TRT_IL",
                "source": "Style3"
            },
            {
                "displayType": "LoRA",
                "type": "LORA",
                "prefix": "lora",
                "hash": "629144e9d8", <-- WRONG "lora" 10-char hash from Style3
                "name": "DynamicPoseIL2att_alpha1_rank4_noxattn_900steps",
                "source": "Style3"
            },
            {
                "displayType": "LoRA",
                "type": "LORA",
                "prefix": "lora",
                "hash": "61d7ee6c08", <-- WRONG "lora" 10-char hash from Style3
                "name": "Smooth_Booster_v3",
                "source": "Style3"
            },
            {
                "displayType": "Unknown",
                "type": "adetailer",
                "prefix": "adetailer", <-- NEW "adetailer" type/prefix
                "hash": "d02fe493c3", <-- NEW 10-char hash from Style3
                "name": "face_yolov9c.pt",
                "source": "Style3"
            },
            {
                "displayType": "Unknown",
                "type": "adetailer",
                "prefix": "adetailer", <-- NEW "adetailer" type/prefix
                "hash": "6f116f686e", <-- NEW 10-char hash from Style3
                "name": "hand_yolov9c.pt",
                "source": "Style3"
            },
            {
                "displayType": "Unknown",
                "type": "adetailer",
                "prefix": "adetailer", <-- NEW "adetailer" type/prefix
                "hash": "9f39f32ab8", <-- NEW 10-char hash from Style3
                "name": "foot_yolov8x_v2.pt",
                "source": "Style3"
            },
            {
                "displayType": "Embedding",
                "type": "TextualInversion",
                "prefix": "embed",
                "hash": "3086669265", <-- RIGHT "embed" 10-char hash from Style3
                "name": "lazypos",
                "source": "Style3"
            },
            {
                "displayType": "Embedding",
                "type": "TextualInversion",
                "prefix": "embed",
                "hash": "ba21023c70", <-- RIGHT "embed" 10-char hash from Style3
                "name": "lazyneg",
                "source": "Style3"
            },
            {
                "displayType": "Embedding",
                "type": "TextualInversion",
                "prefix": "embed",
                "hash": "3cc8f76aaf", <-- RIGHT "embed" 10-char hash from Style3
                "name": "lazyhand",
                "source": "Style3"
            },
            {
                "displayType": "LoRA",
                "type": "LORA",
                "prefix": "lora",
                "hash": "11bc3bab8208", <-- RIGHT "lora" 12-char hash from Style4
                "name": "hololive_kaela_kovalskia_redebut",
                "source": "Style4"
            },
            {
                "displayType": "LoRA",
                "type": "LORA",
                "prefix": "lora",
                "hash": "c555e1d0f1be", <-- RIGHT "lora" 12-char hash from Style4
                "name": "Butterfly_Applique_Black_Silk_Chiffon_Party_Dress",
                "source": "Style4"
            },
            {
                "displayType": "LoRA",
                "type": "LORA",
                "prefix": "lora",
                "hash": "44586d05878a", <-- RIGHT "lora" 12-char hash from Style4
                "name": "USNR_STYLE_ILL",
                "source": "Style4"
            },
            {
                "displayType": "LoRA",
                "type": "LORA",
                "prefix": "lora",
                "hash": "e6b401310305", <-- RIGHT "lora" 12-char hash from Style4
                "name": "WSSKX_WAI",
                "source": "Style4"
            },
            {
                "displayType": "LoRA",
                "type": "LORA",
                "prefix": "lora",
                "hash": "4f993f545850", <-- RIGHT "lora" 12-char hash from Style4
                "name": "TRT_IL",
                "source": "Style4"
            },
            {
                "displayType": "LoRA",
                "type": "LORA",
                "prefix": "lora",
                "hash": "629144e9d885", <-- RIGHT "lora" 12-char hash from Style4
                "name": "DynamicPoseIL2att_alpha1_rank4_noxattn_900steps",
                "source": "Style4"
            },
            {
                "displayType": "LoRA",
                "type": "LORA",
                "prefix": "lora",
                "hash": "61d7ee6c08bd", <-- RIGHT "lora" 12-char hash from Style4
                "name": "Smooth_Booster_v3",
                "source": "Style4"
            },
            {
                "displayType": "Embedding",
                "type": "TextualInversion",
                "prefix": "embed",
                "hash": "30866692653c", <-- WRONG "embed" 12-char hash from Style4 (fallback)
                "name": "lazypos",
                "source": "Style4"
            },
            {
                "displayType": "Embedding",
                "type": "TextualInversion",
                "prefix": "embed",
                "hash": "ba21023c7054", <-- WRONG "embed" 12-char hash from Style4 (fallback)
                "name": "lazyneg",
                "source": "Style4"
            },
            {
                "displayType": "Embedding",
                "type": "TextualInversion",
                "prefix": "embed",
                "hash": "3cc8f76aaf5a", <-- WRONG "embed" 12-char hash from Style4 (fallback)
                "name": "lazyhand",
                "source": "Style4"
            }
            ]            
        */

        const seen = new Map(); // key → { resource, styleRank }

        function mergeObjects(base, incoming, fromStyle) {
            for (const [k, v] of Object.entries(incoming)) {
                if (v === null || v === undefined) continue;

                if (Array.isArray(v)) {
                    const before = base[k] || [];
                    const merged = Array.from(new Set([...before, ...v]));

                    if (debug && merged.length > before.length) {
                        console.log(`[merge] Added array values for "${k}" from Style${fromStyle}`);
                    }
                    base[k] = merged;
                } else if (typeof v === "object" && v !== null) {
                    base[k] = mergeObjects(base[k] || {}, v, fromStyle);
                } else {
                    // Primitive values: overwrite only if missing/Unknown
                    if (
                        base[k] === null ||
                        base[k] === undefined ||
                        base[k] === "Unknown"
                    ) {
                        if (debug) {
                            console.log(`[merge] Set "${k}" from Style${fromStyle} → ${v}`);
                        }
                        base[k] = v;
                    } else if (debug && base[k] !== v) {
                        console.log(`[merge] Kept existing "${k}" (${base[k]}), ignored Style${fromStyle} value (${v})`);
                    }
                }
            }

            return base;
        }

        for (const res of resources) {
            /**
             *  Normalize key:
             * - Deduplicate by hash if available (since that’s the strongest identity key).
             * - Deduplicate by air URN if available.
             * - Deduplicate by (modelId + modelVersionId) pair if available.
             * - As a fallback, deduplicate by modelName + versionName (only if nothing else exists).
             * 
             * That way if “Model hash” and “Hashes” both reference the same checkpoint, we only resolve it once.
            */
            let key = null;
            // *** Test with ./Test Images/94306873.png
            // dedup only with 10-char hashes, as maybe both 10-char and 12-char versions from the SAME hash can exist (for LoRAs and Embeddings)
            // LoRAs (WRONG) 10-key hashes only come from Style3 "Hashes" and the (RIGHT) 12-key hashes from Style4 "Lora hashes" should win
            // Embeddings (WRONG) 12-key hashes only come from Style4 "TI hashes" and the (RIGHT) 10-key hashes from the lower Style3 "Hashes",
            // but for that we have the "Candidate" handling in the resolveByHash() function
            if (res.hash) //res.hash
                //key = `hash:${res.hash}`;
                key = `hash:${res.hash.substring(0, 10)}`; // cut to 10-char for dedup
            else if (res.air)
                key = `air:${res.air}`;
            else if (res.modelId && res.modelVersionId)
                key = `id:${res.modelId}@${res.modelVersionId}`;
            else if (res.modelVersionId) // some images (e.g. "./Test Images/96602721.jpeg" only have a modelVersionId, and no "air"
                key = `id:${res.modelVersionId}`;
            else if (res.modelName && res.versionName)
                key = `name:${res.modelName}@${res.versionName}`;
            else if (res.name) // added for Style0, where we only have matching "name"
                key = `name:${res.name}`;
            
            /*
                Scenario:
                some prompts use <lora:Deep_V_Neck_Dress:1.1>
                WITH additional Style3 "Lora hashes"
                Lora hashes: "Deep_V_Neck_Dress: 35721f2af07e, LiSusQuickTrip_Hi3_IL: f00366172dd9"
                which should be deduped by Style3 > Style0

                but other resources only have <lora:name:weight> instances found, without any hashes
                so we supress "Unknown", as that would be deduped by "hash:Unknown"
                If we pass "Unknown1", "Unknown2" hashes, they not get deduped, even for the same <lora:name>
                So we need to dedup within the same Level (Style0) also only by name
            */


            if (!key) continue;

            // replace res.style with style in this function
            // as in the Resources we only have "source": "Style4"
            const styleName = res.source.trim(); // e.g. "Style4"
            const style = parseInt(styleName.substring(styleName.length - 1)); // e.g. 3

            // const stylePriority = { 4: 4, 3: 3, 2: 2, 1: 1 };
            //const currentRank = stylePriority[res.style] || 0;
            const currentRank = stylePriority[style] || 0;

            /*
                Scenario: prompt: "..., backless dress, <lora:LiSusQuickTrip_Hi3_IL:1>, SusHi3, ..."
                This is a Style0 reference.

                but the AI-Metadata also contains a Style4 reference (Lora hashes:)
                Lora hashes: "Deep_V_Neck_Dress: 35721f2af07e, LiSusQuickTrip_Hi3_IL: f00366172dd9"

                The Style0 with styleRank=0 passes in the 'seen' Map() first
                with key "name:LiSusQuickTrip_Hi3_IL"

                The higher styleRank=3 object with key "hash:35721f2af0" (Style4 LoRA with name)
                should NOT pass-in as “New entry", when its res.name ("Deep_V_Neck_Dress”) === key
                of the existing already 'seen' entry from Style0, which only
                has “name:Deep_V_Neck_Dress” as its key.
                The Style4 should go in the else-branch to fight with the 'existing'
                for its higher styleRank 3 > 0
            */
            //if (!seen.has(key)) {
            const keyResName = `name:${res.name}`;
            if (!seen.has(key) && !seen.has(keyResName)) {
                if (debug) {
                    console.log(`[dedupe] New entry → key=${key}, Style${style}`);
                }
                seen.set(key, { resource: { ...res }, styleRank: currentRank });
            } else {
                //const existing = seen.get(key);
                let existing = seen.get(keyResName); // fight with Style0
                if (!existing) // the fight is with styleRank > 0
                    existing = seen.get(key) // as original

                if (currentRank > existing.styleRank) {
                    if (debug) {
                        console.log(`[dedupe] Higher priority (Style${style}) replaces Style${existing.styleRank} for key=${key}`);
                    }

                    existing.resource = mergeObjects({ ...res }, existing.resource, existing.styleRank);
                    existing.styleRank = currentRank;
                } else {
                    if (debug) {
                        console.log(`[dedupe] Merging Style${style} into existing Style${existing.styleRank} for key=${key}`);
                    }

                    existing.resource = mergeObjects(existing.resource, res, style);
                }
                
                seen.set(key, existing);
            }
        }

        console.debug("resources\n", UI.formatJSON(resources));
        console.debug("seen\n", seen);

        return Array.from(seen.values()).map(v => v.resource);
    }

    /**
     * --- Utility: normalize type to displayType ---
     * Helper function for enrichResource()
     * CivitAI type normalization
     * 
     * Normalize types to displayType → Checkpoint, LoRA, Embedding
     */
    static normalizeType(type, keyPrefix) {
        let displayType = type; // fallback (unknown) type

        if (type) {
            const t = type.toLowerCase();
            
            if (t === "model" || t === "checkpoint")
                displayType = "Checkpoint";
            else if (t === "lora"  || t === "lora hashes")
                displayType = "LoRA";
            else if (t === "embed" || t === "embedding" ||
                t === "textualinversion" || t === "ti hashes")
                displayType = "Embedding";
            else if (t === "adetailer")
                displayType = "ADetailer";
        }

        // Override by prefix when present
        if (keyPrefix?.startsWith("model:")) displayType = "Checkpoint";
        if (keyPrefix?.startsWith("lora:")) displayType = "LoRA";
        if (keyPrefix?.startsWith("embed:")) displayType = "Embedding";
        if (keyPrefix?.startsWith("adetailer:")) displayType = "ADetailer";

        if (keyPrefix === "model") displayType = "Checkpoint";
    
        return displayType;
    }

    // --- Core: resolveByHash (tries 12-char first, fallback 10-char) ---
    static async resolveByHash(hash) {
        // API docs: https://github.com/civitai/civitai/wiki/REST-API-Reference
        const baseAPIUrl = "https://civitai.com/api/v1";
        const candidates = [hash];

        if (hash.length === 12)
            candidates.push(hash.substring(0, 10)); // fallback for TIs

        for (const candidate of candidates) {
            try {
                console.debug(`[resolveByHash] Trying hash ${candidate}`);
                const resp = await fetch(`${baseAPIUrl}/model-versions/by-hash/${candidate}`);

                if (!resp.ok)
                    continue;

                const version = await resp.json();
                console.debug(`[resolveByHash] Success with ${candidate}`);

                return { version, resolvedHash: candidate };

            } catch (err) {
                console.warn(`[resolveByHash] Failed for hash ${candidate}:`, err.message);
            }
        }

        console.warn(`[resolveByHash] All attempts failed for ${hash}`);
        
        return null;
    }

    // --- Core: resolveByAirUrn (Style5) ---
    static async resolveByAirUrn(modelId, modelVersionId) {
        // API docs: https://github.com/civitai/civitai/wiki/REST-API-Reference
        const baseAPIUrl = "https://civitai.com/api/v1";

        try {
            console.debug(`[resolveByAirUrn] Fetching version ${modelVersionId} (model ${modelId})`);
            // Fetch both model + version in parallel
            // const [versionResp, modelResp] = await Promise.all([
            //     fetch(`${baseAPIUrl}/model-versions/${modelVersionId}`).then(r => r.json()),
            //     fetch(`${baseAPIUrl}/models/${modelId}`).then(r => r.json())
            // ]);
            //
            // const version = versionResp || {};
            // const model = modelResp || {};

            const [versionResp, modelResp] = await Promise.all([
                fetch(`${baseAPIUrl}/model-versions/${modelVersionId}`),
                fetch(`${baseAPIUrl}/models/${modelId}`)
            ]);

            if (!versionResp.ok || !modelResp.ok)
                throw new Error("Failed AIR URN lookup");

            const version = await versionResp.json();
            const model = await modelResp.json();

            return { version, model };
        } catch (err) {
            console.warn(`[resolveByAirUrn] Failed for modelVersionId ${modelVersionId}:`, err.message);

            return null;
        }
    }

    static async resolveByModelVersionId(modelVersionId) {
        // API docs: https://github.com/civitai/civitai/wiki/REST-API-Reference
        const baseAPIUrl = "https://civitai.com/api/v1";

        try {
            console.debug(`[resolveByModelVersionId] Fetching version ${modelVersionId}`);
            const modelVersionIdURL = `${baseAPIUrl}/model-versions/${modelVersionId}`;
            console.debug(modelVersionIdURL);

            const versionResp = await fetch(`${baseAPIUrl}/model-versions/${modelVersionId}`);

            if (!versionResp.ok)
                throw new Error("Failed ModelVersionId lookup");

            const version = await versionResp.json();
            //console.debug(version);

            const model = {}; // we not have a model
            return { version, model };

        } catch (err) {
            console.warn(`[resolveByModelVersionId] Failed for modelVersionId ${modelVersionId}:`, err.message);

            return null;
        }
    }

    // --- Builder: create resolved model entry ---
    static buildModelEntry(version, model, prefix, resource) {
        //const hash = resource.hash;
        // use resolved hash, as this is CHECKED!
        const resolvedAutoV2Hash = version.files?.[0]?.hashes?.AutoV2 || null;
        const type = version.model.type;

        const displayType = this.normalizeType(type, prefix);
        const file = version.files?.[0] || {};
        const fileSizeMB = file.sizeKB ? Math.round(file.sizeKB / 1024) : null;

        const key = (prefix === "model")
            ? "model"
            : (resolvedAutoV2Hash)
                ? `${prefix}:${resolvedAutoV2Hash}`
                : `${resource.name}`;

        // Merge trainedWords + tags

        // let mergedTags = [];
        // if (Array.isArray(version.trainedWords))
        //     mergedTags.push(...version.trainedWords);
        // if (Array.isArray(model.tags)) // only in the full model REST JSON
        //     mergedTags.push(...model.tags);
        // mergedTags = [...new Set(mergedTags)];
                
        const mergedTags = [
            ...(version.trainedWords || []),
            ...(model?.tags || []) // only in the full model REST JSON
        ];

        let resolvedModel = {};
        //const entry = {
        resolvedModel[key] = {
            ...resource,
            type,
            displayType,
            hash: resolvedAutoV2Hash,
            extractedHash: resource.hash,
            name: model?.name || version.model.name || resource.modelName || "Unknown",
            id: model?.id || version.model.id || "Unknown",
            version: version.name || resource.versionName || "Unknown",
            baseModel: version.baseModel || "Unknown",
            trainedWords: mergedTags ,
            downloadUrl: version.downloadUrl || null,
            fileSizeMB,
            url: `https://civitai.com/models/${version.modelId}?modelVersionId=${version.id}`,
            //images: version.images?.map(i => i.url) || []
            images: version.images || [] // get the whole info about sample images
        };

        //return { key, entry };
        if (this.debug)
            alert("buildModelEntry -> resolvedModel\n" + UI.formatJSON(resolvedModel));

        return resolvedModel;
    }

    // --- Builder: fallback entry when all fails ---
    static buildFallbackEntry(resource) {
        const searchModelUrl = "https://civitai.com/search/models?query=";

        const hash = resource.hash;
        const name = resource.name; // Style1?, Style3 and Style4 have a name with the "hashes"
        const prefix = resource.prefix;
        const type = resource.type;
        const displayType = this.normalizeType(type, prefix);

        const key = (prefix === "model")
            ? "model" 
            : (hash)
                ? `${prefix}:${hash}`
                : `${prefix}:${name}`;

        let resolvedModel = {};
        //const entry = {
        resolvedModel[key] = {
            ...resource,
            type: displayType,
            hash: hash,
            // if fallback has both "name and "hash" we prefer the "name" search, as "hash" was already tried with both 10-char and 12-char variants
            name: (name) ? `Model with (searchable) name '${name}'` : (hash) ? `Model with (searchable) hash '${hash}'` : "Unknown",
            version: (name) ? name : "Unknown",
            trainedWords: ["Unknown"],
            downloadUrl: null,
            fileSizeMB: "Unknown",
            url: (name) ? `${searchModelUrl}${name}` : (hash) ? `${searchModelUrl}${hash}` : null,
            images: []
        };

        //return { key, entry };
        return resolvedModel;
    }


    static async enrichResource(resource) {
        // To get model version details, use:
        // https://civitai.com/api/v1/model-versions/:modelVersionId
        // To get model information, use:
        // https://civitai.com/api/v1/models/:modelId

        // Webpage for a model/LoRA by its modelVersionId
        // https://civitai.com/model-versions/{modelVersionId}
        // Model download by its modelVersionId:
        // https://civitai.com/api/download/models/{modelVersionId}

        //TODO: check the Python script:
        // https://www.reddit.com/r/StableDiffusion/comments/1kgr0hr/python_script_bulk_download_civitai_models/?utm_source=chatgpt.com
        // it seems to be a sophisticated Model Downloader

        //alert("enrichResource()\n" + UI.formatJSON(resource)); //FIX

        let data = null;
        let data2 = null;

        let prefix = null; // "model", "lora", "embed", "adetailer"

        function generatePrefix(type) {
            type = type.toLowerCase();
            let prefix = null;

            if (type === 'checkpoint' || type === 'model')
                prefix = 'model';
            else if (type === 'lora')
                prefix = 'lora';
            else if (type === 'textualinversion' || type === 'embedding' || type === 'embed') // "Embedding"
                prefix = 'embed';
            else if (type === 'adetailer')
                prefix = 'adetailer';
            else //TODO: for now pass the type for unknow model types
                prefix = type;

            return prefix;
        }

        try {
            console.debug("resource=\n" + UI.formatJSON(resource));

            if (resource.modelId && resource.modelVersionId) {
                data = await this.resolveByAirUrn(resource.modelId, resource.modelVersionId);
                if (data) {
                    prefix = generatePrefix(data.model.type); // AIR URNs from the "Civitai resources" array typically do NOT have a prefix

                    return this.buildModelEntry(data.version, data.model, prefix, resource);
                }
            }

            if (resource.hash) {
                data = await this.resolveByHash(resource.hash);

                if (data) {
                    //console.debug("resolveByHash() data=\n" + UI.formatJSON(data));
                    // every modelVersion has a small subset of the model embedded at version.model
                    const modelId = data.version.modelId; // get the (missing) modelId (e.g. 1277670) from the model version
                    //console.debug("resolveByHash() modelId=" + modelId);

                    prefix = generatePrefix(data.version.model.type); // e.g. "Checkpoint"
                    //console.debug("resolveByHash() prefix=" + prefix);

                    // call again to get the FULL model JSON (for "tags" resolving)
                    data2 = await this.resolveByAirUrn(modelId, data.version.id);
                    if (data2) { // build the resource from both model and version
                        return this.buildModelEntry(data2.version, data2.model, prefix, resource);
                    }
                    else // this should never happen - build the resource from version only
                    // actually it CAN happen
                        return this.buildModelEntry(data.version, null, prefix, resource);
                }
                else
                    alert(`resolveByHash() - 404: NO data found for hash '${resource.hash}'`);
            }

            if (resource.modelVersionId) { // Metadata have no hash and no modelId
                console.debug("resolveByModelVersionId() modelVersionId=" + resource.modelVersionId);

                data = await this.resolveByModelVersionId(resource.modelVersionId);
                if (data) { // same logic as above with "hash", only versionId present, no modelId
                    //console.debug("resolveByModelVersionId() data=\n" + UI.formatJSON(data));
                    // every modelVersion has a small subset of the model embedded at version.model
                    const modelId = data.version.modelId; // get the (missing) modelId (e.g. 1277670) from the model version
                    console.debug("resolveByModelVersionId() modelId=" + modelId);

                    prefix = generatePrefix(data.version.model.type); // e.g. "Checkpoint"
                    console.debug("resolveByModelVersionId() prefix=" + prefix);

                    // call again to get the FULL model JSON (for "tags" resolving)
                    data2 = await this.resolveByAirUrn(modelId, data.version.id);
                    if (data2) { // build the resource from both model and version
                        return this.buildModelEntry(data2.version, data2.model, prefix, resource);
                    }
                    else // this should never happen - build the resource from version only
                        return this.buildModelEntry(data.version, null, prefix, resource);
                }
                else
                    alert(`resolveByModelVersionId() - 404: NO data found for modelVersionId '${resource.modelVersionId}'`);
            }


            // Final fallback
            console.debug(`[resolveModelResource] Using fallback for ${resource.hash || resource.modelVersionId}`);

            return this.buildFallbackEntry(resource);

        } catch (err) {
            console.error("enrichResource failed:", err);

            return resource;
        }
    }

    /**
     * Pre-sort order:
     * 1. Checkpoints
     * 2. LoRAs (alphabetical by modelName)
     * 3. Embeddings (alphabetical by modelName)
     * 4. Unknown last
     * 
     * Objects in JS are not ordered in the same way arrays are.
     * If you want to apply a sort for UI rendering, you’ll want to:
     * 1. Convert the object into an array of [key, entry] pairs.
     * 2. Sort that array with your rules (Checkpoint first, then LoRA alphabetically, then Embeddings).
     * 3. Either:
     *  - return a sorted array (good for rendering directly in UI), or
     *  - rebuild a new object in the sorted order (if you need the “resolvedModels” structure preserved).
     */
    static sortResources(resources) { // needs to be in sync with the normalizeType() helper function
        const entries = Object.entries(resources);

        // Sort by type: Checkpoint first, then LoRA (alphabetical), then Embedding
        entries.sort(([keyA, a], [keyB, b]) => {
            const order = { "Checkpoint": 0, "LoRA": 1, "Embedding": 2, "Unknown": 3 };

            const orderA = order[a.displayType] ?? 99;
            const orderB = order[b.displayType] ?? 99;

            if (orderA !== orderB) return orderA - orderB;

            // If both are LoRAs, sort alphabetically by modelName
            if (a.displayType === "LoRA" && b.displayType === "LoRA") {
                return (a.modelName || "").localeCompare(b.modelName || "");
            }

            // Otherwise keep stable order
            return 0;
        });

        // Option 1: return as array for UI
        // return entries.map(([key, entry]) => ({ key, ...entry }));

        // Option 2: rebuild object with sorted keys
        const sortedObject = {};
        for (const [key, entry] of entries) {
            sortedObject[key] = entry;
        }

        return sortedObject;
    } 

    // RL - END (ChatGPT new)

    static debug = false;
    
    // trims leading and trailing commas
    static trimEnclosingCommas(text) {
        /*
         * trims all commas at the beginning and the end,
         * e.g. ", sensitive, , , , , , , , , , , , , , , , Negative prompt: bla"
         * will be replaced to "sensitive, Negative prompt: bla"
        */

        /* old code
        let trimmedText = text.replaceAll(', ,', ','); // compress commas
        const regExPattern = /^,*(.*?),*$/;
        const match = trimmedText.match(regExPattern);

        if (match)
            return match[1].trim(); // trim all trailing whitespaces
        else
            return trimmedText; // unmodified
        */

        const cleaned = text
            // strip leading/trailing comma clusters (with optional spaces)
            .replace(/^\s*(?:,\s*)+|(?:\s*,\s*)+\s*$/g, "")
            // collapse any internal comma clusters (with optional spaces) to ", "
            .replace(/(?:\s*,\s*)+/g, ", ");

        //console.log(cleaned);  // "sensitive, Negative prompt: bla"
        //alert(cleaned); //FIX

        return cleaned; // return cleaned text
    }

    // always called by main.js
    static async resolveModelHashes(metadata) {
        console.debug('resolveModelHashes() - metadata.raw["parameters"]:\n' + UI.formatJSON(metadata.raw["parameters"]));

        // support also the new AIR urns in "Civit resources" metadata
        // as e.g. in image "./Test Images/96537334.png"

        let resolvedModels = {};

        // Replace the IIFE with direct async/await
        try {
            resolvedModels = await this.enrichAllResources(metadata);
            console.debug("Enriched All resolved models:\n" + UI.formatJSON(resolvedModels));
        } catch (error) {
            console.error("Error enriching resources:", error);
        }

        if (Object.keys(resolvedModels).length > 0) {
            metadata.resolvedModels = resolvedModels;
        }

        console.debug("resolveModelHashes() - metadata.raw.hashes\n", UI.formatJSON(metadata.raw.hashes));

        return metadata;
//TODO - below is "DEAD" code, we probably only "miss" metadata.raw.hashes from above code ??
// We ONLY miss the "hashes" dict from "simple" pics and from "96537334.png", which is a "Style5" AIR URN only resolver
        // If we have hashes, try to resolve them to CivitAI model links
        if (metadata.raw.hashes) {
            console.log("Resolving hashes:", metadata.raw.hashes);
            alert("metadata.raw.hashes:\n" + UI.formatJSON(metadata.raw.hashes)); //FIX
            const resolvedModels = {};
 
            for (const [key, hash] of Object.entries(metadata.raw.hashes)) {
                try {
                    console.log(`Resolving hash ${hash} with key ${key}`);
                    console.log(`Key analysis - startsWith 'lora:': ${key.startsWith('lora:')}, startsWith 'embed:': ${key.startsWith('embed:')}, equals 'model': ${key === 'model'}`);
                    // Implement fallback hash resolution logic: 12-char → 10-char → fallback
                    let resolvedModel = null;
                    
                    // First attempt: Try with original hash (12-char for LORA, varies for others)
                    let apiHash = hash;
                    if (key === 'model' && hash.length === 12) {
                        // For model hashes, truncate to 10 characters for first attempt
                        apiHash = hash.substring(0, 10);
                    }
                    
                    console.log(`First attempt: Using hash ${apiHash} (original: ${hash}) for API call`);
                    let response = await fetch(`https://civitai.com/api/v1/model-versions/by-hash/${apiHash}`);
                    
                    if (response.ok) {
                        const data = await response.json();
                        if (data && data.id && data.modelId) {
                            resolvedModel = data;
                            console.log(`First attempt successful for hash ${hash}:`, data);
                        }
                    }
                    
                    // Second attempt: If first failed and we have a 12-char hash, try with 10-char truncated
                    if (!resolvedModel && hash.length === 12) {
                        const truncatedHash = hash.substring(0, 10);
                        console.log(`Second attempt: Using truncated hash ${truncatedHash} for API call`);
                        response = await fetch(`https://civitai.com/api/v1/model-versions/by-hash/${truncatedHash}`);
                        
                        if (response.ok) {
                            const data = await response.json();
                            if (data && data.id && data.modelId) {
                                resolvedModel = data;
                                console.log(`Second attempt successful for hash ${hash}:`, data);
                            }
                        }
                    }
                    
                    // Third attempt: If both failed and we started with 10-char, try with full 12-char (if available)
                    if (!resolvedModel && hash.length === 10 && key.startsWith('lora:')) {
                        // For LORA, we might have truncated a 12-char hash, but we don't have the original
                        // This case is less common, so we skip this attempt
                        console.log(`Third attempt skipped for LORA hash ${hash} (no original 12-char available)`);
                    }
                    
                    if (resolvedModel) {
                        // Successfully resolved model
                        const modelVersion = resolvedModel;
                        const model = resolvedModel.model; // every modelVersion has a small subset of the model embedded at version.model
                        
                        // Create the model URL with modelVersionId
                        const url = `https://civitai.com/models/${modelVersion.modelId}/?modelVersionId=${modelVersion.id}`;
                        
                        // Extract trained words from version (mostly empty), better to get the "tags" from the model itself
                        let trainedWords = 'None';
                        if (modelVersion.trainedWords && modelVersion.trainedWords.length > 0) {
                            trainedWords = modelVersion.trainedWords.join(', ');
                        }
                        
                        // Extract images
                        let images = [];
                        if (modelVersion.images && modelVersion.images.length > 0) {
                            //images = modelVersion.images.map(img => img.url);
                            images = modelVersion.images; // all info
                        }
                        
                        // Determine display type based on our key format
                        let displayType = model.type;
                        if (key.startsWith('lora:')) {
                            displayType = 'LoRA';
                        } else if (key.startsWith('embed:')) {
                            displayType = 'Embedding';
                        } else if (key === 'model') {
                            displayType = 'Checkpoint';
                        }
                        
                        console.log(`Setting display type for key ${key}: ${displayType}`);
                        resolvedModels[key] = {
                            hash: hash,
                            name: model.name,
                            url: url,
                            version: modelVersion.name,
                            displayType: displayType,
                            baseModel: modelVersion.baseModel,
                            trainedWords: trainedWords,
                            images: images,
                            downloadUrl: modelVersion.downloadUrl
                        };
                        console.log(`Resolved model for hash ${hash}:`, resolvedModels[key]);
                    } else {
                        // All attempts failed, use fallback
                        console.log(`All resolution attempts failed for hash ${hash}`);
                        // Determine display type based on our key format
                        let displayType = 'Unknown';
                        if (key.startsWith('lora:')) {
                            displayType = 'LoRA';
                        } else if (key.startsWith('embed:')) {
                            displayType = 'Embedding';
                        } else if (key === 'model') {
                            displayType = 'Checkpoint';
                        }
                        
                        console.log(`Setting fallback display type for key ${key}: ${displayType}`);
                        resolvedModels[key] = {
                            hash: hash,
                            name: `Model with hash ${hash}`,
                            url: `https://civitai.com/search/models?query=${hash}`,
                            version: 'Unknown',
                            displayType: displayType,
                            baseModel: 'Unknown',
                            trainedWords: 'Unknown',
                            images: [],
                            downloadUrl: null
                        };
                        console.log(`Using fallback for hash ${hash}:`, resolvedModels[key]);
                    }
                } catch (e) {
                    // Network error or other issue, use fallback
                    console.error(`Error resolving hash ${hash}:`, e);
                    // Determine display type based on our key format
                    let displayType = 'Unknown';
                    if (key.startsWith('lora:')) {
                        displayType = 'LoRA';
                    } else if (key.startsWith('embed:')) {
                        displayType = 'Embedding';
                    } else if (key === 'model') {
                        displayType = 'Checkpoint';
                    }
                    
                    console.log(`Setting error display type for key ${key}: ${displayType}`);
                    resolvedModels[key] = {
                        hash: hash,
                        name: `Model with hash ${hash}`,
                        url: `https://civitai.com/search/models?query=${hash}`,
                        version: 'Unknown',
                        displayType: displayType,
                        baseModel: 'Unknown',
                        trainedWords: 'Unknown',
                        images: [],
                        downloadUrl: null
                    };
                    console.log(`Using fallback for hash ${hash}:`, resolvedModels[key]);
                }
            }

            metadata.resolvedModels = resolvedModels;
            console.log("Resolved models:", resolvedModels);
            alert("Resolved Models\n" + UI.formatJSON(resolvedModels)); //FIX
        }

        return metadata;
    }

    static extractComfyUINodeTypes(workflow) {
        // Extract node types from a ComfyUI workflow
        if (!workflow) {
            return [];
        }
        
        // Handle both array format and object format for nodes
        let nodes = [];
        if (Array.isArray(workflow.nodes)) {
            // Array format
            nodes = workflow.nodes;
        } else if (typeof workflow === 'object' && !Array.isArray(workflow)) {
            // Object format - extract nodes from the object
            nodes = Object.values(workflow);
        } else if (typeof workflow === 'object' && !workflow.nodes) {
            // Direct object format - the workflow itself is the nodes object
            nodes = Object.values(workflow);
        } else {
            return [];
        }
        
        const nodeTypes = nodes
            .map(node => node.class_type || node.type)
            .filter(type => type !== undefined && type !== null);
        
        // Remove duplicates while preserving order
        return [...new Set(nodeTypes)];
    }
    
    static extractComfyUINodesDetailed(workflow) {
        // Extract detailed node information from a ComfyUI workflow
        if (!workflow) {
            return [];
        }
        
        // Handle both array format and object format for nodes
        let nodes = [];
        if (Array.isArray(workflow.nodes)) {
            // Array format
            nodes = workflow.nodes;
        } else if (typeof workflow === 'object' && !Array.isArray(workflow)) {
            // Object format - extract nodes from the object
            nodes = Object.values(workflow);
        } else if (typeof workflow === 'object' && !workflow.nodes) {
            // Direct object format - the workflow itself is the nodes object
            nodes = Object.values(workflow);
        } else {
            return [];
        }
        
        // Extract detailed information for each node
        return nodes.map(node => {
            const nodeInfo = {
                type: node.class_type || node.type || 'Unknown',
                properties: node.properties || {},
                widgets_values: node.widgets_values || []
            };
            return nodeInfo;
        });
    }

    // my original "hand-written" version (see below an improved GPT5 version) //TEST
    //CHECK double code with extractPromptFromWorkflow()
    static extractWFInputsPrompts(wfInputsPromptsText, parameters) {
        // typically this is a REDUCED JSON from the "inputs" of the ComfyUI workflow (if a ComfyUI workflow exists)
        // it starts with e.g. "{"114":{"inputs":{???},"class_type":"<NodeClassName>",...,"223":{"inputs":{???},"class_type":...}"
        //TODO: parse "known" "class_types, like "easy positive" and "easy negative"
        // for additional positive/negative prompt info from .inputs.positive and inputs.negative
        // e.g.
        /*
            "447": {
                "inputs": {
                "positive": "nsfw, nice breasts, nice nipples, medium nipples, puffy nipples, "
                },
                "class_type": "easy positive",
                "_meta": {
                "title": "NSFW"
                }
            },
            "448": {
                "inputs": {
                "positive": "sensitive, "
                },
                "class_type": "easy positive",
                "_meta": {
                "title": "Non-NSFW"
                }
            },
            "449": {
                "inputs": {
                "positive": "extreme sex, "
                },
                "class_type": "easy positive",
                "_meta": {
                "title": "Extreme Sex"
                }
            }, ...
            "455": {
                "inputs": {
                "negative": "fuck, dick, semen, penis, "
                },
                "class_type": "easy negative",
                "_meta": {
                "title": "NSFW"
                }
            },
            "456": {
                "inputs": {
                "negative": "nipples, (embedding:lazynsfw:0.2), "
                },
                "class_type": "easy negative",
                "_meta": {
                "title": "Non-NSFW"
                }
            }, ...                       
        */

        /*
        //TODO - parse jsonWFInputs from our new parameters.wfInputsPrompts metadata parameters section

        const wfInputsPrompts = JSON.parse(rawPromptData); // turn JSON string into JS object
        Object.keys(wfInputsPrompts).some(key =>
            typeof wfInputsPrompts[key] === 'object' && wfInputsPrompts[key].class_type == 'easy positive');

        // processing ...

        parameters['WF Consolidated Positive Prompt'] = 
        parameters['WF Consolidated Negative Prompt'] = 
        */

        const wfInputsPrompts = JSON.parse(wfInputsPromptsText); // turn JSON string into JS object

        let wfConsolidatedPositivePrompt = "";
        let wfConsolidatedNegativePrompt = "";

        Object.entries(wfInputsPrompts).forEach(([key, node]) => {
            //alert(`Node ${key}`); //FIX
            const nodeType = node.class_type || node.type; // e.g. "SDPromptReader"
            const nodeTitle = node.title || node._meta.title; // e.g. "SD Prompt Reader"
            console.log("Processing node with type:", nodeType);

            // Check for inputs.text
            if (node.inputs && typeof node.inputs === 'object') {
                switch (nodeType) {
                    case 'SDPromptReader':
                        // Check for widgets_values array - SDPromptReader typically stores prompt in widgets_values[2]
                        if (node.widgets_values && Array.isArray(node.widgets_values)
                            && node.widgets_values.length > 2) {
                            const promptText = node.widgets_values[2]; // Index 2 typically contains the positive prompt
                            if (promptText && typeof promptText === 'string'
                                && promptText.trim().length > 0) {
                                
                                console.log("Found prompt in SDPromptReader widgets_values[2]:", promptText.substring(0, 200));
                                wfConsolidatedPositivePrompt += `[${nodeTitle}:] ${this.trimEnclosingCommas(promptText.trim())}\n`;
                            }
                        }

                        // Check for inputs.positive or inputs.text
                        if (node.inputs.positive && typeof node.inputs.positive === 'string') {
                            console.log("Found prompt in SDPromptReader inputs.positive:", node.inputs.positive.substring(0, 200));
                            wfConsolidatedPositivePrompt += `[${nodeTitle}:] ${this.trimEnclosingCommas(node.inputs.positive.trim())}\n`;
                        }

                        if (node.inputs.text && typeof node.inputs.text === 'string') {
                            console.log("Found prompt in SDPromptReader inputs.text:", node.inputs.text.substring(0, 200));
                            wfConsolidatedPositivePrompt += `[${nodeTitle}:] ${this.trimEnclosingCommas(node.inputs.text.trim())}\n`;
                        }

                        // Check for inputs.negative
                        if (node.inputs.negative && typeof node.inputs.negative === 'string') {
                            console.log("Found prompt in SDPromptReader inputs.negative:", node.inputs.negative.substring(0, 200));
                            wfConsolidatedNegativePrompt += `[${nodeTitle}:] ${this.trimEnclosingCommas(node.inputs.negative.trim())}\n`;
                        }

                        break;

                    case 'SDPromptSaver':
                        //TODO - check from extractPromptFromWorkflow()

                        break;

                    case 'ClipTextEncode':
                        // Check for inputs.text (method 2 - preferred)
                        if (node.inputs.text && typeof node.inputs.text === 'string') {
                            console.log("Found inputs.text in CLIPTextEncode:", node.inputs.text.substring(0, 200));
                            wfConsolidatedPositivePrompt += `[${nodeTitle}:] ${this.trimEnclosingCommas(node.inputs.text.trim())}\n`;
                        }
                        
                        // Check for widgets_values (method 1 - fallback)
                        if (node.widgets_values && Array.isArray(node.widgets_values) &&
                            node.widgets_values.length > 0 &&
                            typeof node.widgets_values[0] === 'string') {

                            const promptText = node.widgets_values[0]; // Index 0 typically contains the positive prompt
                            if (promptText && typeof promptText === 'string'
                                && promptText.trim().length > 0) {
                                
                                console.log("Found widgets_values in CLIPTextEncode:", node.widgets_values[0].substring(0, 200));
                                wfConsolidatedPositivePrompt += `[${nodeTitle}:] ${this.trimEnclosingCommas(promptText.trim())}\n`;
                            }
                        }

                        break;

                    case 'easy positive': // "easy positive": inputs.positive: "sensitive, "
                        if (node.inputs.positive &&
                            typeof node.inputs.positive === 'string')

                            wfConsolidatedPositivePrompt += `[${nodeTitle}:] ${this.trimEnclosingCommas(node.inputs.positive.trim())}\n`; // e.g. "sensitive, "
                        break;

                    case 'easy negative': // "easy negative": inputs.negative: "nipples, (embedding:lazynsfw:0.2), "
                        if (node.inputs.negative &&
                            typeof node.inputs.negative === 'string')

                            wfConsolidatedNegativePrompt += `[${nodeTitle}:] ${this.trimEnclosingCommas(node.inputs.negative.trim())}\n`; // e.g. "nipples, (embedding:lazynsfw:0.2), "
                        break;

                    default:
                        // Code to execute if no case matches
                }
            }
        });

        // this "return" values are rendered as they contain "...Prompt..."
        parameters['WF Consolidated Positive Prompt'] = wfConsolidatedPositivePrompt; //.slice(0, -2); // cut trailing ", "
        parameters['WF Consolidated Negative Prompt'] = wfConsolidatedNegativePrompt; //.slice(0, -2); // cut trailing ", "
        
        // this return value is currently never used
        const wfInputsPromptsExtracted = {
            "positive": parameters['WF Consolidated Positive Prompt'],
            "negative": parameters['WF Consolidated Negative Prompt']
        }

        return wfInputsPromptsExtracted;
    }

    // GPT5 improved version extractWFInputsPromptsGPT()
    /*
        What I’d improve:
        1.  Generalize Node Handling
            Instead of hardcoding "easy positive" and "easy negative", we can normalize the logic
            and add support for other node classes like CLIPTextEncode or CLIPTextEncodeSDXL.
        
        2.  Handle Nested Input Fields
            Some nodes use inputs.text, others inputs.positive/negative. You want to cover both.

        3.  Preserve _meta.title
            The titles are often useful (e.g. “NSFW”, “Non-NSFW”) and could be grouped.

        4.  Trim + Deduplicate
            Avoid duplicate prompts sneaking into the consolidated string.

        Key upgrades:
        ✅ Adds CLIPTextEncode (important for FLUX workflows).
        ✅ Handles _meta.title for extra context.
        ✅ Deduplicates repeated terms.
        ✅ Generalized logic (easy to extend new node types).
    */
    static extractWFInputsPromptsGPT(wfInputsPromptsText, parameters) {
        const wfInputsPrompts = JSON.parse(wfInputsPromptsText);

        let positives = [];
        let negatives = [];

        Object.entries(wfInputsPrompts).forEach(([key, node]) => {
            const nodeType = node.class_type || node.type || "";
            const title = node._meta?.title ? `(${node._meta.title})` : "";

            if (node.inputs && typeof node.inputs === "object") {
                // --- easy positive ---
                if (nodeType.toLowerCase() === "easy positive" && typeof node.inputs.positive === "string") {
                    positives.push(this.trimEnclosingCommas(node.inputs.positive.trim()) + " " + title);
                }

                // --- easy negative ---
                else if (nodeType.toLowerCase() === "easy negative" && typeof node.inputs.negative === "string") {
                    negatives.push(this.trimEnclosingCommas(node.inputs.negative.trim()) + " " + title);
                }

                // --- CLIPTextEncode / similar ---
                else if (/cliptextencode/i.test(nodeType) && typeof node.inputs.text === "string") {
                    positives.push(this.trimEnclosingCommas(node.inputs.text.trim()) + " " + title);
                }

                // --- future: add other known nodes here ---
            }
        });

        // Deduplicate & clean
        const uniq = arr => [...new Set(arr.map(x => x.trim()))].filter(Boolean);

        positives = uniq(positives);
        negatives = uniq(negatives);

        const wfConsolidatedPositivePrompt = positives.join(", ");
        const wfConsolidatedNegativePrompt = negatives.join(", ");

        // Store in parameters for consistency
        // this "return" values are rendered as they contain "...Prompt..."

        parameters["WF Consolidated Positive Prompt"] = wfConsolidatedPositivePrompt;
        parameters["WF Consolidated Negative Prompt"] = wfConsolidatedNegativePrompt;

        // not used:
        return {
            positive: wfConsolidatedPositivePrompt,
            negative: wfConsolidatedNegativePrompt
        };
    }

    static extractAIGenerationParametersFromMetadataRawPrompt(rawPromptData, parameters) {
        // RL - for ComfyUI-WF images, we have the 4 RAW parameters: "prompt" (JSON), "workflow" (JSON),
        // "hashes" (JSON), and "parameters" ("raw" directly from the EXIF)
        // "prompt" is a subset from the WF, only showing the "inputs" of all WF nodes
        // from here its easy to parse "AI Generation Parameters",
        // when they do not exist as "Traditional" metadata (which only Non-ComfyWF images have attached)

        console.log("extractAIGenerationParametersFromWorkflow called with:", rawPromptData);
        if (!rawPromptData) {
            console.log("No raw prompt data provided");

            return; // unmodified
        }
        if (!parameters) {
            console.log("No parameters provided");

            return; // unmodified (null)
        }

        // Handle both array format and object format for nodes
        // let nodes = [];
        // if (Array.isArray(workflow.nodes)) {
        //     // Array format
        //     console.log("Workflow has nodes array");
        //     alert("Workflow has nodes array"); //FIX
        //     nodes = workflow.nodes;
        // } else if (typeof workflow === 'object' && !Array.isArray(workflow)) {
        //     // Object format - extract nodes from the object
        //     console.log("Workflow is object, extracting nodes");
        //     alert("Workflow is object, extracting nodes"); //FIX
        //     nodes = Object.values(workflow);
        // } else {
        //     console.log("Workflow format not recognized");
        //     alert("Workflow format not recognized"); //FIX

        //     return parameters; // unmodified
        // }

        // Object.entries(rawPromptData).forEach(([key, node]) => {
        //     console.log(`Node ${key}`);
        //     console.log("  Class:", node.class_type);
        //     console.log("  Inputs:", node.inputs);
        // });
        
        console.log("raw prompt nodes to process:", rawPromptData);
        //alert("raw prompt nodes to process:\n" + rawPromptData); //FIX
        
        const rawPromptJSON = JSON.parse(rawPromptData); // turn JSON string into JS object

        Object.entries(rawPromptJSON).forEach(([key, node]) => {
            //alert(`Node ${key}`); //FIX
            const nodeType = node.class_type || node.type;
            console.log("Processing node with type:", nodeType);
            //alert("Processing node with type:" + nodeType); //FIX

            // Check for inputs.text (method 2 - preferred)
            if (node.inputs && typeof node.inputs === 'object') {
                switch (nodeType) {
                    case 'DualCLIPLoaderGGUF': // “DualCLIPLoaderGGUF”: inputs.type: “flux”
                    case 'DualCLIPLoader': // “DualCLIPLoader”: inputs.type: “flux”
                        if (node.inputs.type &&
                            typeof node.inputs.type === 'string')

                            parameters['Workflow Type'] = node.inputs.type.toUpperCase(); // e.g. "FLUX"
                        break;

                    // RL - this is a redundancy with the function "extractPromptFromWorkflow()" //FIX
                    case 'CLIPTextEncode': // “CLIPTextEncode”: inputs.text: “a bottle with ..."
                        if (node.inputs.text &&
                            typeof node.inputs.text === 'string')
                            
                            parameters['Workflow Clip Prompt'] = node.inputs.text;

                        break;

                    case "FluxGuidance":
                        if (node.inputs.guidance &&
                            typeof node.inputs.guidance === 'number')

                            parameters['Flux Guidance'] = node.inputs.guidance;

                        break;

                    case 'BasicScheduler': // "BasicScheduler": inputs.scheduler: “simple”, inputs.steps: 4, inputs.denoise: 1.0
                        if (node.inputs.scheduler &&
                            typeof node.inputs.scheduler === 'string')
                            
                            // in traditional SD metadata this is called "Schedule type"
                            parameters['Schedule type'] = node.inputs.scheduler;

                        if (node.inputs.steps &&
                            typeof node.inputs.steps === 'number')
                            
                            parameters['Steps'] = node.inputs.steps;

                        if (node.inputs.denoise &&
                            typeof node.inputs.denoise === 'number')
                            
                            // in traditional SD metadata this is called "Denoising strength"
                            parameters['Denoising strength'] = node.inputs.denoise;

                        break;

                    case 'KSamplerSelect': // "KSamplerSelect": inputs.sampler_name: “euler”
                        if (node.inputs.sampler_name &&
                            typeof node.inputs.sampler_name === 'string')
                            
                            parameters['Sampler'] = node.inputs.sampler_name;

                        break;

                    case 'RandomNoise': // "RandomNoise": inputs.noise_seed: 112298569477003
                        if (node.inputs.noise_seed &&
                            typeof node.inputs.noise_seed === 'number')
                            
                            parameters['Seed'] = node.inputs.noise_seed;

                        break;

                    case 'EmptyLatentImage': // "EmptyLatentImage": inputs.width: 1024, inputs.height": 1024
                        if (node.inputs.width &&
                            typeof node.inputs.width === 'number')

                            parameters['Width'] = node.inputs.width;

                        if (node.inputs.height &&
                            typeof node.inputs.height === 'number')

                            parameters['Height'] = node.inputs.height;

                        break;

                    default:
                        // Code to execute if no case matches
                }
            }
        });

        return;
    }
    
    //CHECK double code with extractWFInputsPrompts()
    static extractPromptFromWorkflow(workflow) {
        // Extract prompt from various node types in a ComfyUI workflow
        // Priority: SDPromptReader > CLIPTextEncode > SDPromptSaver
        console.log("extractPromptFromWorkflow called with:", workflow);
        if (!workflow) {
            console.log("No workflow provided");
            return null;
        }
        
        // Handle both array format and object format for nodes
        let nodes = [];
        if (Array.isArray(workflow.nodes)) {
            // Array format
            console.log("Workflow has nodes array");
            nodes = workflow.nodes;
        } else if (typeof workflow === 'object' && !Array.isArray(workflow)) {
            // Object format - extract nodes from the object
            console.log("Workflow is object, extracting nodes");
            nodes = Object.values(workflow);
        } else {
            console.log("Workflow format not recognized");
            return null;
        }
        
        console.log("Nodes to process:", nodes);
        
        // Priority 1: Look for SDPromptReader nodes (most likely to contain the actual prompt)
        for (const node of nodes) {
            const nodeType = node.class_type || node.type;
            const nodeTitle = "X"; //node.title || node._meta.title; // e.g. "SD Prompt Reader"

            console.log("Processing node with type:", nodeType);
            if (nodeType === 'SDPromptReader') {
                console.log("Found SDPromptReader node:", node);
                
                // Check for widgets_values array - SDPromptReader typically stores prompt in widgets_values[2]
                if (node.widgets_values && Array.isArray(node.widgets_values) && node.widgets_values.length > 2) {
                    const promptText = node.widgets_values[2]; // Index 2 typically contains the positive prompt
                    if (promptText && typeof promptText === 'string' && promptText.trim().length > 0) {
                        console.log("Found prompt in SDPromptReader widgets_values[2]:", promptText.substring(0, 200));
                        return `[${nodeTitle}:] ${promptText}`;
                    }
                }
                
                // Check for inputs.positive or inputs.text
                if (node.inputs && typeof node.inputs === 'object') {
                    if (node.inputs.positive && typeof node.inputs.positive === 'string') {
                        console.log("Found prompt in SDPromptReader inputs.positive:", node.inputs.positive.substring(0, 200));
                        return `[${nodeTitle}:] ${node.inputs.positive}`;
                    }
                    if (node.inputs.text && typeof node.inputs.text === 'string') {
                        console.log("Found prompt in SDPromptReader inputs.text:", node.inputs.text.substring(0, 200));
                        return `[${nodeTitle}:] ${node.inputs.text}`;
                    }
                }

                // Check for inputs.negative
                if (node.inputs && typeof node.inputs === 'object') {
                    if (node.inputs.positive && typeof node.inputs.positive === 'string') {
                        console.log("Found prompt in SDPromptReader inputs.positive:", node.inputs.positive.substring(0, 200));
                        return `[${nodeTitle}:] ${node.inputs.positive}`;
                    }
                    if (node.inputs.text && typeof node.inputs.text === 'string') {
                        console.log("Found prompt in SDPromptReader inputs.text:", node.inputs.text.substring(0, 200));
                        return `[${nodeTitle}:] ${node.inputs.text}`;
                    }
                }

            }
        }

        let posPrompt = "";
        let negPrompt = "";

        /*

        ./Test Images/Fox_girl_107.png

        negative prompt:

        "type": "CLIPTextEncode",
        "widgets_values": [
            "nail_polish, thick_lips, blurry, anus, shiny skin, bad hands, bad feet, missing toes, extra toes, mismatched eyes, interlocked fingers, extra fingers, deformed hands, asymmetrical fingers, missing fingers, fused fingers, distorted palms, unnatural poses, low resolution, blurry details, pubic_hair, "
        ],
        "color": "#322",
        "bgcolor": "#533"

        "outputs": [
            {
                "name": "CONDITIONING",
                "type": "CONDITIONING",
                "slot_index": 0,
                "links": [
                    4473
                ]
            }
        ],

        "type": "DetailerForEach",
        "inputs": [
            {
            "name": "negative",
            "type": "CONDITIONING",
            "link": 4473
            },

        */
        
        // Priority 2: Look for CLIPTextEncode nodes
        for (const node of nodes) {
            const nodeType = node.class_type || node.type;
            const nodeTitle = node.title;// || node._meta.title; // e.g. "SD Prompt Reader"

            if (nodeType === 'CLIPTextEncode') {
                console.log("Found CLIPTextEncode node:", node);
                
                // Check for inputs.text (method 2 - preferred)
                if (node.inputs &&
                    typeof node.inputs === 'object' &&
                    node.inputs.text &&
                    typeof node.inputs.text === 'string' &&
                    node.inputs.text != "") {
                    console.log("Found inputs.text in CLIPTextEncode:", node.inputs.text.substring(0, 200));
                    return `[${nodeTitle}:] ${node.inputs.text}`;
                }
                
                // Check for widgets_values (method 1 - fallback)
                if (node.widgets_values &&
                    Array.isArray(node.widgets_values) &&
                    node.widgets_values.length > 0 &&
                    typeof node.widgets_values[0] === 'string' &&
                    node.widgets_values[0] != "") {
                    console.log("Found widgets_values in CLIPTextEncode:", node.widgets_values[0].substring(0, 200));
                    return `[${nodeTitle}:] ${node.widgets_values[0]}`;
                }
            }
        }
        
        // Priority 3: Look for SDPromptSaver nodes as fallback
        for (const node of nodes) {
            const nodeType = node.class_type || node.type;
            const nodeTitle = "Z"; //node.title || node._meta.title; // e.g. "SD Prompt Reader"

            if (nodeType === 'SDPromptSaver') {
                console.log("Found SDPromptSaver node:", node);
                
                // Check for widgets_values array - SDPromptSaver might store prompt data
                if (node.widgets_values && Array.isArray(node.widgets_values)) {
                    // Look for a string that looks like a prompt (longer than 50 characters)
                    for (let i = 0; i < node.widgets_values.length; i++) {
                        const value = node.widgets_values[i];
                        if (typeof value === 'string' && value.length > 50 &&
                            (value.includes('masterpiece') || value.includes('quality') || value.includes('detailed'))) {
                            console.log(`Found prompt in SDPromptSaver widgets_values[${i}]:`, value.substring(0, 200));
                            return `[${nodeTitle}:] ${value}`;
                        }
                    }
                }
                
                // Check for inputs
                if (node.inputs && typeof node.inputs === 'object') {
                    if (node.inputs.positive && typeof node.inputs.positive === 'string') {
                        console.log("Found prompt in SDPromptSaver inputs.positive:", node.inputs.positive.substring(0, 200));
                        return `[${nodeTitle}:] ${node.inputs.positive}`;
                    }
                }
            }
        }
        
        console.log("No prompt found in workflow");
        return null;
    }
}

// Make MetadataExtractor available globally
window.MetadataExtractor = MetadataExtractor;