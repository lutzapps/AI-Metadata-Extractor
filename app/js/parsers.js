class MetadataParsers {
// BEGIN - new parsers, Sept 4th 23:00

// The goal: one EXIF parser, one XMP handler, one processing pipeline,
// called consistently across PNG, JPEG, WEBP (and later WEBM, GIF, fallback).
/*
🔗 Integration
"parseExifStrings()" now returns a clean out object with all tags.
"formatExifData()" takes that out and gives you a nice summary + parameter parsing.

*/



// 1. BEGIN Shared helpers (central point)
// --- EXIF + XMP Normalizer ---

// --- Tag Maps ---
// Complete EXIF tag map (for JPEG/WEBP parsing)
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

// Alias map (normalize across PNG/JPEG/WEBP)
static METADATA_KEYWORD_ALIASES = {
    "parameters": "parameters",   // A1111-style prompt & metadata
    "description": "parameters",  // some tools misuse this field
    "comment": "parameters",      // some tools dump prompt here
    "usercomment": "parameters",  // EXIF tag
    "xpcomment": "parameters",    // Windows tag
    "prompt": "prompt",           // ComfyUI reduced inputs JSON
    "workflow": "workflow",       // ComfyUI workflow JSON
    "comfyui": "workflow",        // alias
    "comfyui_json": "workflow"    // alias
};

// --- EXIF parser (drop-in from your Old version, but expanded) ---
// Parses TIFF-based EXIF (for JPEG/WEBP APP1/EXIF chunks)
// returns plain {tagName: value, ...}
static parseExifStrings(exifArrayBuffer) {
    const view = new DataView(exifArrayBuffer);
    const byteOrder = String.fromCharCode(view.getUint8(0)) + String.fromCharCode(view.getUint8(1));
    const little = (byteOrder === 'II');
    if (!(little || byteOrder === 'MM')) return {};
    if (view.getUint16(2, little) !== 0x002A) return {};
    const ifd0Off = view.getUint32(4, little) >>> 0;

    const typeSize = {1:1,2:1,3:2,4:4,5:8,7:1,9:4,10:8};
    const decASCII  = new TextDecoder('ascii');
    const decUTF8   = new TextDecoder('utf-8');
    const decU16LE  = new TextDecoder('utf-16le');
    const decU16BE  = new TextDecoder('utf-16be');

    function clean(s){ return s.replace(/\u0000+$/,'').trim(); }

    function readIFD(offset) {
        if (offset <= 0 || offset+2 > view.byteLength) return {tags:new Map(), next:0};
        const count = view.getUint16(offset, little);
        let p = offset+2, tags = new Map();
        for (let i=0;i<count;i++,p+=12) {
            if (p+12 > view.byteLength) break;
            const tag = view.getUint16(p, little);
            const type = view.getUint16(p+2, little);
            const cnt = view.getUint32(p+4, little);
            const val32 = view.getUint32(p+8, little);
            const unit = typeSize[type]||1;
            const bytelen = unit*cnt;
            let dataOffset, inline = false;
            if (bytelen<=4) {dataOffset=p+8; inline=true;} else {dataOffset=val32>>>0;}
            tags.set(tag,{type,cnt,bytelen,dataOffset,inline});
        }
        const next = (p+4<=view.byteLength) ? (view.getUint32(p,little)>>>0) : 0;
        return {tags,next};
    }

    function readBytes(entry){
        if (!entry) return new Uint8Array(0);
        if (entry.inline) {
            const out=new Uint8Array(entry.bytelen);
            for (let i=0;i<entry.bytelen;i++) out[i]=view.getUint8(entry.dataOffset+i);
            return out;
        } else {
            const start=entry.dataOffset, end=start+entry.bytelen;
            if (end>view.byteLength) return new Uint8Array(0);
            return new Uint8Array(view.buffer,start,entry.bytelen);
        }
    }

    function decodeUserComment(bytes){
        if (bytes.length<8) return '';
        const code = decASCII.decode(bytes.subarray(0,8)).replace(/\0/g,'').toUpperCase();
        const payload = bytes.subarray(8);
        if (code.startsWith('ASCII')) return clean(decUTF8.decode(payload));
        if (code.startsWith('UNICODE')) {
            const le = decU16LE.decode(payload), be = decU16BE.decode(payload);
            const score=s=>[...s].filter(c=>c>=' '&&c<='\u007f').length/s.length;
            return clean(score(le)>=score(be)?le:be);
        }
        return clean(decUTF8.decode(payload));
    }

    const out = {};
    const {tags:ifd0} = readIFD(ifd0Off);

    for (const [tag,entry] of ifd0.entries()) {
        const name=this.EXIF_TAGS[tag];
        if (!name) continue;
        let val;
        if (tag===0x9286) val=decodeUserComment(readBytes(entry));
        else if (tag>=0x9C9B && tag<=0x9C9F) val=clean(decU16LE.decode(readBytes(entry)));
        else val=clean(decUTF8.decode(readBytes(entry)));
        out[name]=val;
    }

    const tExifPtr = ifd0.get(0x8769);
    if (tExifPtr) {
        const off = tExifPtr.inline ? new DataView(view.buffer).getUint32(tExifPtr.dataOffset,little) : tExifPtr.dataOffset;
        const {tags:exifIFD}=readIFD(off);
        for (const [tag,entry] of exifIFD.entries()) {
            const name=this.EXIF_TAGS[tag];
            if (!name) continue;
            let val;
            if (tag===0x9286) val=decodeUserComment(readBytes(entry));
            else val=clean(decUTF8.decode(readBytes(entry)));
            out[name]=val;
        }
    }

    return out;
}

// --- Formatter (restored and hooked) ---
// Format EXIF into human-friendly + parse AI params
// improved version with commonTags + AI parsing)
static async formatExifData(exifData, metadata) {
    const formattedData = {};
    if (!exifData) { formattedData['Error']='No EXIF data found'; return formattedData; }

    const commonTags = ['Make','CameraModel','DateTime','DateTimeOriginal','DateTimeDigitized',
        'ExposureTime','FNumber','ISOSpeedRatings','FocalLength','Flash','WhiteBalance',
        'ExposureMode','MeteringMode','SceneCaptureType','Software','Artist','Copyright'];

    for (const tag of commonTags) {
        if (exifData[tag]) {
            let value=exifData[tag];
            if (tag==='ExposureTime') value = value<1?`1/${Math.round(1/value)}s`:`${value}s`;
            if (tag==='FNumber') value=`f/${value}`;
            if (tag==='FocalLength') value=`${value}mm`;
            if (tag==='ISOSpeedRatings') value=`ISO ${value}`;

            formattedData[tag]=value;
        }
    }

    if (exifData.UserComment) {
        formattedData['AI Parameters'] = exifData.UserComment;
        // we use later extractParsedMetadata() for that
        //MetadataExtractor.extractAIGenerationParameters(exifData.UserComment, metadata);
    }
    if (exifData.ImageDescription) {
        formattedData['Image Description'] = exifData.ImageDescription;
        //MetadataExtractor.extractAIGenerationParameters(exifData.ImageDescription, metadata);
    }
    if (exifData.Software) {
        formattedData['Software'] = exifData.Software;
        //MetadataExtractor.extractAIGenerationParameters(exifData.Software, metadata);
    }
    if (exifData.Artist) {
        formattedData['Artist'] = exifData.Artist;
        //MetadataExtractor.extractAIGenerationParameters(exifData.Artist, metadata);
    }
    return formattedData;
}


// Unified EXIF processor: store raw, formatted, and AI params
static async processExifFields(exifFields, metadata) {
    if (!exifFields || Object.keys(exifFields).length === 0) return;

    metadata.raw.EXIF_fields = exifFields;
    metadata.raw.EXIF_formatted = await this.formatExifData(exifFields, metadata);

    // Prefer fields in order of likelihood
    const sdText =
        exifFields.UserComment ||
        exifFields.ImageDescription ||
        exifFields.XPComment ||
        "";

    if (sdText) {
        metadata.raw.EXIF_text = sdText;
        metadata.raw.parameters = sdText;
        await MetadataExtractor.extractParsedMetadata("parameters", sdText, metadata);
    }
}

// Unified XMP handler
static async processXMP(xmpData, metadata) {
    if (!xmpData) return;

    // Handle found XMP
    const xmpMetaValue = await this.parseXMPParameters(xmpData, metadata);
    if (xmpMetaValue && xmpMetaValue.len > 0) {
        await MetadataExtractor.extractParsedMetadata("XMP_meta", xmpMetaValue, metadata);
    }
}
// 1. END Shared helpers (central point)


// 2. JPEG parser (drop-in replacement for _Old)
static async extractJPEGMetadata(data, metadata) {
    //const buffer = await file.arrayBuffer();
    const buffer = data; //FIX
    const view = new DataView(buffer);

    // Validate JPEG
    if (buffer.byteLength < 2 || view.getUint16(0) !== 0xFFD8) {
        throw new Error("Invalid JPEG file");
    }

    let offset = 2;
    while (offset < buffer.byteLength - 1) {
        if (view.getUint8(offset) !== 0xFF) { offset++; continue; }

        while (offset < buffer.byteLength && view.getUint8(offset) === 0xFF) offset++;
        if (offset >= buffer.byteLength) break;

        const marker = view.getUint8(offset++);
        if (offset + 1 >= buffer.byteLength) break;

        const length = view.getUint16(offset);
        offset += 2;

        if (offset + length - 2 > buffer.byteLength) {
            offset += length - 2;
            continue;
        }

        const segment = buffer.slice(offset, offset + length - 2);

        if (marker === 0xE1) { // APP1 = EXIF or XMP
            const head = new Uint8Array(segment, 0, 6);
            const headStr = new TextDecoder("latin1").decode(head);

            if (headStr.startsWith("Exif")) {
                const tiffData = segment.slice(6);
                const exifFields = this.parseExifStrings(tiffData);
                await this.processExifFields(exifFields, metadata);
            } else if (headStr.includes("http://ns.adobe.com/xap/1.0/") || headStr.includes("<x:xmpmeta")) {
                const xmpData = new TextDecoder("utf-8").decode(segment);
                await this.processXMP(xmpData, metadata);
            }
        }

        offset += length - 2;

        if (offset < buffer.byteLength - 1 && view.getUint16(offset) === 0xFFD9) break; // EOI
    }

    return metadata;
}


// 3. WEBP parser (also unified) - renamed from extract to parseWEBPMetadata
static async parseWEBPMetadata(buffer, metadata) {
    //const buffer = await file.arrayBuffer();
    const view = new DataView(buffer);

    // Validate RIFF/WEBP
    if (new TextDecoder("ascii").decode(new Uint8Array(buffer, 0, 4)) !== "RIFF") {
        throw new Error("Invalid WEBP file");
    }

    let offset = 12; // skip RIFF header
    while (offset + 8 <= buffer.byteLength) {
        const chunkId = new TextDecoder("ascii").decode(new Uint8Array(buffer, offset, 4));
        const chunkSize = view.getUint32(offset + 4, true);
        const chunkData = buffer.slice(offset + 8, offset + 8 + chunkSize);

        if (chunkId === "EXIF") {
            const exifFields = this.parseExifStrings(chunkData);
            await this.processExifFields(exifFields, metadata);
        } else if (chunkId === "XMP ") {
            const xmpData = new TextDecoder("utf-8").decode(chunkData);
            await this.processXMP(xmpData, metadata);
        }

        offset += 8 + chunkSize + (chunkSize % 2); // pad to even
    }

    return metadata;
}


// 4. PNG parser (already wired, just swap text→keywords)
// my existing parsePNGMetadata() was almost same, only keep the
// new and enhanced parsePNGTextChunk() function from here
// --- PNG Parser (with keyword alias normalization) ---
static async parsePNGMetadata(data, metadata) {
    const view = new DataView(data);

    const pngSig = new Uint8Array(data, 0, 8); // 8-Byte signature

    const pngMagic = [137,80,78,71,13,10,26,10].every((v,i) => v === pngSig[i]);
    if (!pngMagic) // check for valid PNG file signature
        return;

    let offset = 8; // mode after the signature
    let xmpBlocks = [];
    let textParams = "";

    while (offset < view.byteLength) {
        const length = view.getUint32(offset, false); // big-endian
        const type = new TextDecoder("ascii").decode(new Uint8Array(data, offset + 4, 4));
        const chunkStart = offset + 8; // chunk-len (4) + type (4)
        const chunkEnd = chunkStart + length;

        if (["tEXt", "zTXt", "iTXt"].includes(type)) {
            try {
                const { keyword, value } = await this.parsePNGTextChunk(data, chunkStart, length, type);

                // map keywords into "normalized" groups
                const normalizedKeyword = this.METADATA_KEYWORD_ALIASES[keyword.toLowerCase()] || keyword.toLowerCase();

                switch (normalizedKeyword) {
                    case "parameters": // A1111 style SD parameters
                        textParams += value + "\n"; // concat all found textChunks

                        break;

                    case "prompt": // JSON with "Inputs" nodes and prompt data (e.g. "easy positive", "CLIPTextEncode" for FLUX, etc.)
                        //TODO //CHECK - double info
                        if (!metadata.raw.ComfyUI_prompt)
                            metadata.raw.ComfyUI_prompt = [];
                        metadata.raw.ComfyUI_prompt.push(value);

                        metadata.raw.prompt = value; // needs the NaN fix
                        // Later we can parse JSON and extract "CLIPTextEncode", etc.
                        // we have extractWFInputsPrompts(wfInputsPromptsText, parameters) for that

                        break;

                    case "workflow": // full ComfyUI workflow JSON found
                        metadata.raw.workflow = value; // store it in raw for later validation

                        break;

                    default:
                }

                // process the chunk metadata
                await MetadataExtractor.extractParsedMetadata(normalizedKeyword, value, metadata);

                if (value.includes("<x:xmpmeta")) {
                    xmpBlocks.push(value);
                }

                // Store everything raw in structured metadata
                if (!metadata.raw.PNG_text) metadata.raw.PNG_text = [];
                metadata.raw.PNG_text.push({ keyword, normalizedKeyword, value });

            } catch (error) {
                console.error("PNG text chunk parse failed: ", error);
            }
        }

        //offset += 12 + length; // chunk + type + CRC
        offset = chunkEnd + 4; // skip CRC (4)
    }

    // consolidate all chunks
    textParams = textParams.trim();
    //metadata.raw.EXIF_text = textParams;
    metadata.raw.parameters = textParams;

    // Handle found XMP
    const xmpMetaValue = await this.parseXMPParameters(xmpBlocks.join(""), metadata);
    // this has generated raw "XMP_data" and "XML_meta" metadata
    if (xmpMetaValue.len > 0)
        await MetadataExtractor.extractParsedMetadata("XMP_meta", xmpMetaValue, metadata);

    return;
}


// already existing and working code before Sept 4th
// --- PNG Text Chunk Parser with real decompression + fallback ---
/*
What’s new:
    Uses DecompressionStream("deflate") (native in Chrome, Edge, Safari TP, Firefox).
    If the chunk is compressed ("zTXt" or "iTXt" with flag=1), we actually decompress and decode as UTF-8.
    "tEXt" and uncompressed "iTXt" still just decode raw.
⚠️ Edge case:
    Older browsers (or Node.js <18) don’t have DecompressionStream
    To make this code to work in Node or older Safari, we added a fallback path using pako.inflateRaw

Key points:
    ✅ Native fast path with DecompressionStream("deflate").
    ✅ Fallback with pako.inflate() only if needed.
    ✅ Errors clearly reported if neither is available.
*/
static async parsePNGTextChunk(buffer, offset, length, type) {
    const dataView = new DataView(buffer);
    const textDecoder = new TextDecoder('utf-8', { fatal: false });

    // Find keyword
    let keywordEnd = offset;
    while (keywordEnd < offset + length && dataView.getUint8(keywordEnd) !== 0) {
        keywordEnd++;
    }

    const keywordBytes = buffer.slice(offset, keywordEnd);
    const keyword = new TextDecoder("ascii").decode(keywordBytes);

    // Move past NULL separator
    let valueOffset = keywordEnd + 1;
    let value = "";

    // Helper: deflate decompression with fallback
    async function inflateDeflateStream(compressed) {
        if (typeof DecompressionStream !== "undefined") {
            // Native path
            const ds = new DecompressionStream("deflate");
            const writer = ds.writable.getWriter();
            writer.write(compressed);
            writer.close();
            const decompressed = await new Response(ds.readable).arrayBuffer();
            return new Uint8Array(decompressed);
        } else {
            // Fallback: pako
            if (typeof pako !== "undefined" && pako.inflate) {
                return pako.inflate(compressed);
            } else {
                throw new Error("No DecompressionStream or pako.inflate available");
            }
        }
    }

    /*
        PNG textual chunks (tEXt, zTXt, iTXt) have a two-part structure:
            - First comes the keyword (ASCII, 1–79 chars, no NULL)
            - Then a NULL separator byte (0x00)
            - Then the text value (may be compressed for zTXt, may be UTF-8 for iTXt)
    */

    if (type === "tEXt") {
        // Keyword (ASCII) + 0x00 + UncompressedData
        const valueBytes = buffer.slice(valueOffset, offset + length);
        value = textDecoder.decode(valueBytes);
    } 
    else if (type === "zTXt") {
        // Keyword (ASCII) + 0x00 + CompressionMethod (1 byte) + CompressedData
        // So we need to check that byte (almost always 0 for zlib/deflate) and then inflate
        const compressionMethod = dataView.getUint8(valueOffset);
        valueOffset += 1;
        if (compressionMethod === 0) { // "zlib/deflate"
            const compressedData = new Uint8Array(buffer, valueOffset, offset + length - (valueOffset - offset));
            const inflated = await inflateDeflateStream(compressedData);
            value = textDecoder.decode(inflated);
        } else {
            value = "[Unsupported compression method]";
        }
    } 
    else if (type === "iTXt") {
        /*
            Details for iTXt can be found at http://www.vias.org/pngguide/chapter11_05.html
            Keyword (ASCII) + 0x00 +
            CompressionFlag (1 byte) +
            CompressionMethod (1 byte) +
            ASCII LanguageTag (null-terminated) +
            UTF-8 TranslatedKeyword (null-terminated) +
            UTF-8 text string (compressed or not depending on flag)
        */
        const compressionFlag = dataView.getUint8(valueOffset++);
        const compressionMethod = dataView.getUint8(valueOffset++);
        // skip language tag (ASCII text)
        while (valueOffset < offset + length && dataView.getUint8(valueOffset) !== 0) valueOffset++;
        valueOffset++;
        // skip translated keyword (Unicode UTF-8 text)
        while (valueOffset < offset + length && dataView.getUint8(valueOffset) !== 0) valueOffset++;
        valueOffset++;

        if (compressionFlag === 0) { // uncompressed text string
            const valueBytes = buffer.slice(valueOffset, offset + length);
            value = textDecoder.decode(valueBytes);
        } else if (compressionFlag === 1 && compressionMethod === 0) {
            // "zlib/deflate" zlib-encoded deflate algorithm
            const compressedData = new Uint8Array(buffer, valueOffset, offset + length - (valueOffset - offset));
            const inflated = await inflateDeflateStream(compressedData);
            value = textDecoder.decode(inflated);
        } else {
            value = `[Unsupported compression method: ${compressionMethod}]`;
        }
    }

    return { keyword, value };
}

// *** GIF Metadata Extraction
// GIF doesn’t have standardized EXIF/XMP like JPEG/WEBP/PNG.
// But we can scan the comment extension (0xFE) blocks:
static async parseGIFMetadata(buffer, metadata) {
    const view = new DataView(buffer);
    let pos = 0;
    const textDecoder = new TextDecoder("utf-8", { fatal: false });
    let comments = [];

    while (pos < buffer.byteLength - 1) {
        if (view.getUint8(pos) === 0x21 && view.getUint8(pos + 1) === 0xFE) {
            // Comment Extension block
            pos += 2;
            let block = "";
            let blockSize = view.getUint8(pos++);

            while (blockSize > 0) {
                const bytes = new Uint8Array(buffer, pos, blockSize);
                block += textDecoder.decode(bytes);
                pos += blockSize;
                blockSize = view.getUint8(pos++);
            }

            comments.push(block.trim());
        } else {
            pos++;
        }
    }

    if (comments.length > 0) {
        metadata.raw["GIF_Comments"] = comments;
        const joinedComments = comments.join("\n");
        //TODO needs separation for "prompt"
        if (joinedComments.includes("parameters") || joined.joinedComments("prompt")) {
            metadata.raw["GIF_comments"] = joinedComments;
            metadata.raw["parameters"] = joinedComments;

            await MetadataExtractor.extractParsedMetadata("parameters", joinedComments, metadata)
        }
    }
}

/*
🔗 Final unified flow
parseExifStrings → raw map {tag:value}
processExifFields → stores raw + formatted + parameters
processXMP → same, always using your parseXMPParameters + MetadataExtractor.extractParsedMetadata
JPEG/WEBP/PNG all just detect segment/chunk → call same helpers.
*/
// END - new parsers, Sept 4th 23:00

// BEGIN MOVE-IN from MetadataExtractor class


// renamed from extract to parseWEBMMetadata
static async parseWEBMMetadata(file, metadata) {
    // Try to extract metadata from WEBM tags if available
    try {
        //CHECK url code?
        const url = URL.createObjectURL(file);
        const video = document.createElement('video');
        video.src = url;
        URL.revokeObjectURL(url);

        // This is a simplified approach - in a real implementation,
        // you would use a library like mediainfo.js for detailed metadata
        metadata.raw['webmMetadata'] = '[WEBM metadata extraction requires additional libraries]';
    } catch (error) {
        console.error("Error extracting WEBM metadata\n", error);
        metadata.raw['webmMetadataError'] = `[Error extracting WEBM metadata: ${error.message}]`;
    }
    
    // Try to read as text to see if it contains metadata
    try {
        const maxBytes = Math.min(file.size, 1024 * 1024); // 1MB
        const text = await file.slice(0, maxBytes).text();

        if (text.includes('parameters') || text.includes('workflow') || text.includes('prompt')) {
            metadata.raw['textContent'] = text.substring(0, 2000) + (text.length > 2000 ? '...' : '');
            metadata.raw["WEBM_text"] = text;
            metadata.raw["parameters"] = text;

            await MetadataExtractor.extractParsedMetadata("parameters", text, metadata);
        }
    } catch (error) {
        // Not a text file or error reading as text
        console.error("Error reading WEBM as text\n", error);
        metadata.raw['textContentError'] = `[Error reading WEBM as text: ${error.message}]`;
    }
    
    return metadata;
}

// renamed from extract to parseVideoMetadata
static async parseVideoMetadata(file, metadata) {
    // Try to extract metadata from video tags if available
    try {
        const url = URL.createObjectURL(file);
        const video = document.createElement('video');
        video.src = url;
        URL.revokeObjectURL(url);
        
        // This is a simplified approach - in a real implementation,
        // you would use a library like mediainfo.js for detailed metadata
        metadata.raw['videoMetadata'] = '[Video metadata extraction requires additional libraries]';
        
    } catch (error) {
        console.error("Error extracting Video metadata\n", error);
        metadata.raw['videoMetadataError'] = `[Error extracting Video metadata: ${error.message}]`;
    }
    
    // Try to read as text to see if it contains metadata
    try {
        const maxBytes = Math.min(file.size, 1024 * 1024); // 1MB
        const text = await file.slice(0, maxBytes).text();
        if (text.includes('parameters') || text.includes('workflow') || text.includes('prompt')) {
            metadata.raw['textContent'] = text.substring(0, 2000) + (text.length > 2000 ? '...' : '');
            metadata.raw["Video_text"] = text;
            metadata.raw["parameters"] = text;

            await MetadataExtractor.extractParsedMetadata("parameters", text, metadata);
        }
    } catch (error) {
        // Not a text file or error reading as text
        console.error("Error reading Video as text\n", error);
        metadata.raw['textContentError'] = `Error reading Video as text: ${error.message}`;
    }
    
    return metadata;
}

// Fallback Text Search - so anything unsupported still gets a best-effort scan
static async fallbackTextSearch(file, metadata) {
    const text = await file.slice(0, 1024 * 1024).text(); // scan 1MB
    
    if (text.includes("parameters") || text.includes("workflow") || text.includes("prompt")) {
        metadata.raw['textContent'] = text.substring(0, 2000) + (text.length > 2000 ? '...' : '');
        metadata.raw["DEFAULT_text"] = text;
        metadata.raw["parameters"] = text;

        await MetadataExtractor.extractParsedMetadata("parameters", text, metadata)
    }
}

// Fallback Text Search - so anything unsupported still gets a best-effort scan
static async fallbackTextSearchFromBuffer(buffer, metadata) {
    const textDecoder = new TextDecoder("utf-8", { fatal: false });
    const slice = buffer.slice(0, Math.min(buffer.byteLength, 1024 * 1024)); // scan 1MB
    const text = textDecoder.decode(slice);

    if (text.includes("parameters") || text.includes("workflow") || text.includes("prompt")) {
        metadata.raw['textContent'] = text.substring(0, 2000) + (text.length > 2000 ? '...' : '');
        metadata.raw["DEFAULT_text"] = text;
        metadata.raw["parameters"] = text;

        await MetadataExtractor.extractParsedMetadata("parameters", text, metadata)
    }
}

static async parseXMPParameters(xmpData, metadata) {
    console.debug("parseXMPParameters()\n", xmpData);

    metadata.raw = metadata.raw || {};

    if (xmpData.length === 0) {
        metadata.raw["XMP"] = "[No XMP data found]";    
    
        return ""; // empty XMP_meta
    }

    metadata.raw["XMP_data"] = xmpData;

    let xmpMetaValue = "";

    //TODO rewrite as regEx
    const xmpStart = xmpData.indexOf("<x:xmpmeta");
    if (xmpStart !== -1) {
        const xmpEnd = xmpData.indexOf("</x:xmpmeta>") + 12;
        if (xmpEnd > xmpStart) {
            xmpMetaValue = xmpData.substring(xmpStart, xmpEnd);
            metadata.raw["XMP_meta"] = xmpMetaValue; //DEBUG
        }
        else
            metadata.raw["XMP_meta"] = "";
    }

    return xmpMetaValue;
}


} // END of class MetadataParsers

// Make MetadataParsers available globally
window.MetadataParsers = MetadataParsers;