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
static async parseWEBMMetadataSimpleNotUsed(file, metadata) {
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

// Add this as a static async method in your MetadataExtractor class (@Sept 14th, 19:20)
/*
How it behaves & integration notes
It reads only the first N bytes (default 4 MB) — you can raise maxBytes in opts if required.
It uses a safe VINT reader and steps element-by-element. For each element it samples a snippet (default 4 KB) and looks for your keywords.
If a match is found it:
stores a WEBM_elements entry (id hex + snippet),
sets/concats metadata.raw.parameters,
calls your shared MetadataExtractor.extractParsedMetadata("parameters", snippet, metadata) so your existing parsing pipeline runs.
If nothing meaningful is found in the EBML walk it falls back to fallbackTextSearchFromBuffer() (which you already have) to scan raw bytes for textual tokens.
The parser is conservative: it clamps sizes, limits recursion depth, and avoids loading entire huge payloads.
Caveats & suggestions
EBML/Matroska element IDs and master vs leaf typing: a fully spec-compliant parser would use the EBML element table (and Matroska schema) to know which IDs are master elements and which are binary/video frames; I avoided embedding a full schema to keep the code dependency-free and compact.
If you find real ComfyUI metadata consistently inside known EBML element IDs (e.g. Tags → SimpleTag → TagString), we can add explicit handling for those IDs to extract the full strings rather than sampling snippets.
If you later feel brave and want full correctness, we can:
add a small static table with Matroska/EBML IDs you care about (Tags, SimpleTag, TagName, TagString) so recursion is deterministic; OR
add a very-small EBML schema classifier — still without external libs.
*/
static async parseWEBMMetadataNotWork(file, metadata, opts = {}) {
    // options
    const MAX_BYTES = opts.maxBytes || 4 * 1024 * 1024; // read up to 4MB by default
    const MAX_ELEMENT_SNIPPET = opts.maxSnippet || 4096; // how many bytes of element payload we sample
    const MAX_DEPTH = opts.maxDepth || 6; // recursion limit

    // small helper: read up to `MAX_BYTES` from the file
    async function readHead(file, size) {
        const slice = file.slice(0, Math.min(file.size, size));
        return new Uint8Array(await slice.arrayBuffer());
    }

    // read head
    let bytes;
    try {
        bytes = await readHead(file, MAX_BYTES);
    } catch (e) {
        metadata.raw = metadata.raw || {};
        metadata.raw.webmReadError = `Failed to read file head: ${e.message}`;
        return metadata;
    }

    if (!bytes || bytes.length < 4) {
        return metadata;
    }

    // quick signature check for EBML header (Matroska/WebM): 0x1A45DFA3
    if (!(bytes[0] === 0x1A && bytes[1] === 0x45 && bytes[2] === 0xDF && bytes[3] === 0xA3)) {
        // Not starting with EBML header — fallback to text sniff
        await this.fallbackTextSearchFromBuffer(bytes.buffer, metadata);
        return metadata;
    }

    // Read VINT (value and length) per EBML rules.
    // Returns { value: Number, length: Number } and DOES NOT move any external offset.
    function readVintInfo(buf, offset) {
        if (offset >= buf.length) throw new Error("readVintInfo: offset out of range");
        const first = buf[offset];
        if (first === 0x00) throw new Error("Invalid VINT (first byte 0x00)");
        let mask = 0x80;
        let length = 1;
        // determine length: number of leading zero bits before first 1 (max 8)
        while ((first & mask) === 0) {
            mask >>= 1;
            length++;
            if (length > 8) throw new Error("VINT length > 8 not supported");
        }
        if (offset + length > buf.length) throw new Error("VINT length extends beyond buffer");
        // value: lower bits of first byte + following bytes
        let value = first & (mask - 1); // mask -1 leaves lower bits
        for (let i = 1; i < length; i++) {
            value = (value << 8) | buf[offset + i];
        }
        return { value, length };
    }

    // Utility: hex string for the ID bytes (for logging & debugging)
    function idHex(buf, off, len) {
        const arr = [];
        for (let i = 0; i < len && (off + i) < buf.length; i++) {
            arr.push(buf[off + i].toString(16).padStart(2, "0"));
        }
        return arr.join("").toUpperCase();
    }

    // Heuristic: decode snippet as UTF-8, then fallback to latin1 on poor result
    function decodeSnippet(buf, off, len) {
        const slice = buf.subarray(off, Math.min(off + len, buf.length));
        const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(slice);
        // quick printable ratio checker
        let printable = 0;
        for (let i = 0; i < utf8.length; i++) {
            const c = utf8.charCodeAt(i);
            if (c === 9 || c === 10 || c === 13 || (c >= 32 && c < 127)) printable++;
        }
        const ratio = printable / Math.max(1, utf8.length);
        if (ratio < 0.5) {
            // try latin1 / windows-1252-ish fallback by treating bytes as single chars
            let latin = "";
            for (let i = 0; i < slice.length; i++) latin += String.fromCharCode(slice[i]);
            return latin;
        }
        return utf8;
    }

    // main recursive parser that walks EBML elements between [start, end)
    async function walkElements(buf, start, end, depth) {
        if (depth > MAX_DEPTH) return false;
        let offset = start;

        while (offset < end) {
            try {
                // read ID (VINT) at offset
                const idInfo = readVintInfo(buf, offset);
                const idLen = idInfo.length;
                const idVal = idInfo.value;
                const idHexStr = idHex(buf, offset, idLen);

                offset += idLen;
                if (offset >= buf.length) break;

                // read size (VINT)
                const sizeInfo = readVintInfo(buf, offset);
                const sizeLen = sizeInfo.length;
                let sizeVal = sizeInfo.value;
                offset += sizeLen;

                // guard: element payload bounds
                let payloadStart = offset;
                let payloadEnd = offset + sizeVal;

                // if payloadEnd beyond buffer we clamp to buffer length
                if (payloadEnd > buf.length) {
                    payloadEnd = buf.length;
                }

                // Safety: if size is obviously bogus (huge) clamp and continue
                if (sizeVal <= 0 || payloadStart >= payloadEnd) {
                    // if size is zero => skip
                    // but some elements use "unknown size" encoded with all 1s — we don't try to handle that fully here
                    offset = payloadEnd;
                    continue;
                }

                // sample a snippet of the payload and look for keywords
                const snippetLen = Math.min(MAX_ELEMENT_SNIPPET, payloadEnd - payloadStart);
                if (snippetLen > 0) {
                    const text = decodeSnippet(buf, payloadStart, snippetLen);
                    if (/parameters|workflow|prompt/i.test(text)) {
                        // Found candidate metadata
                        const cleaned = text.replace(/\0/g, " ").trim();
                        metadata.raw = metadata.raw || {};
                        // store found element with a little context
                        if (!metadata.raw.WEBM_elements) metadata.raw.WEBM_elements = [];
                        metadata.raw.WEBM_elements.push({
                            id: idHexStr,
                            offset: payloadStart,
                            size: Math.min(sizeVal, MAX_ELEMENT_SNIPPET),
                            snippet: cleaned.slice(0, 2000)
                        });

                        // prefer the snippet that contains the keyword as parameters
                        if (!metadata.raw.parameters) {
                            metadata.raw.parameters = cleaned;
                        } else {
                            metadata.raw.parameters += "\n" + cleaned;
                        }

                        // run your central metadata parser
                        try {
                            await MetadataExtractor.extractParsedMetadata("parameters", cleaned, metadata);
                        } catch (e) {
                            // ignore parse errors, but keep stored raw text
                            console.warn("extractParsedMetadata failed on WEBM snippet:", e);
                        }

                        // we can return early if that is enough
                        return true;
                    }
                }

                // Try recursion into payload for nested elements — some EBML masters are containers
                // We don't rely on known element IDs for masters; we just attempt recursion
                // for reasonably-sized payloads (to avoid scanning huge binary frames).
                const TRY_RECURSE_THRESHOLD = 1024 * 1024; // 1MB
                if ((payloadEnd - payloadStart) <= TRY_RECURSE_THRESHOLD) {
                    const found = await walkElements(buf, payloadStart, payloadEnd, depth + 1);
                    if (found) return true;
                }

                // advance to next element
                offset = payloadEnd;
            } catch (e) {
                // Any parsing error: abort EBML walk (we've likely hit binary data or truncated VINT)
                console.debug("EBML walk aborted at depth", depth, "error:", e.message);
                break;
            }
        }

        return false;
    }

    // run the walker over what we've read
    try {
        const found = await walkElements(bytes, 0, bytes.length, 0);
        if (found) {
            // keep metadata.raw.WEBM_elements and metadata.raw.parameters
            return metadata;
        }
    } catch (e) {
        // proceed to fallback
        console.warn("WEBM EBML walker threw:", e);
    }

    // final fallback: do a general textual scan of the buffer (UTF-8 + latin1 if needed)
    await this.fallbackTextSearchFromBuffer(bytes.buffer, metadata);

    return metadata;
}

/*
✅ What this adds & fixes
We now explicitly look for the “TagName / TagString” fields where metadata is intended to be stored in WebM/Matroska. That means fewer false positives from video frames or binary blobs.
The snippet decode is stricter (printable ratio cut off lower) so random binary chunks are skipped unless they contain human‐readable strings.
If no metadata found via these tag fields, fallback text scanning remains (buffer scan) so you don’t lose anything.
If you like, I can also build a similar ID‐table version for MP4 (QuickTime atoms for metadata), so your parseMP4Metadata becomes similarly accurate. Do you want that next?
*/

static async parseWEBMMetadataNW2(file, metadata, opts = {}) {
    const MAX_BYTES = opts.maxBytes || 4 * 1024 * 1024;
    const MAX_SNIPPET = opts.maxSnippet || 4096;
    const MAX_DEPTH = opts.maxDepth || 6;

    // Matroska/WEBM ID table
    const MK = {
        Tags: 0x1254C367,
        Tag: 0x7373,
        SimpleTag: 0x67C8,
        TagName: 0x7BA9,
        TagString: 0x4487
    };

    async function readHead(file, size) {
        const slice = file.slice(0, Math.min(file.size, size));
        return new Uint8Array(await slice.arrayBuffer());
    }

    let buf;
    try {
        buf = await readHead(file, MAX_BYTES);
    } catch (e) {
        metadata.raw = metadata.raw || {};
        metadata.raw.webmReadError = `Failed to read first ${MAX_BYTES} bytes: ${e.message}`;
        return metadata;
    }
    if (!buf || buf.length < 4) {
        return metadata;
    }
    // Signature check
    if (!(buf[0] === 0x1A && buf[1] === 0x45 && buf[2] === 0xDF && buf[3] === 0xA3)) {
        // Not WEBM / EBML
        await this.fallbackTextSearchFromBuffer(buf.buffer, metadata);
        return metadata;
    }

    // VINT reader
    function readVintInfo(b, offset) {
        if (offset >= b.length) throw new Error("readVintInfo: offset OOB");
        const first = b[offset];
        if (first === 0x00) throw new Error("readVintInfo: leading zero invalid");
        let mask = 0x80;
        let length = 1;
        while ((first & mask) === 0) {
            mask >>= 1;
            length++;
            if (length > 8) throw new Error("VINT length >8 not supported");
        }
        if (offset + length > b.length) throw new Error("VINT length extends beyond buffer");
        let value = first & (mask - 1);
        for (let i = 1; i < length; i++) {
            value = (value << 8) | b[offset + i];
        }
        return { value, length };
    }

    function readUint(b, offset, size) {
        // read big-endian unsigned integer — up to 4 bytes comfortably
        if (offset + size > b.length) throw new Error("readUint out of bounds");
        let v = 0;
        for (let i = 0; i < size; i++) {
            v = (v << 8) | b[offset + i];
        }
        return v;
    }

    // converter for ID bytes to number
    // ID encoded as VINT, but for known IDs we know their binary representation
    function idFromBytes(b, offset, idLen) {
        // For known small-length IDs, could parse
        // But simplest: read the idLen bytes and interpret as big-endian
        try {
            return readUint(b, offset, idLen);
        } catch(e) {
            return null;
        }
    }

    // snippet decoder
    function decodeSnippet(b, off, len) {
        const slice = b.subarray(off, Math.min(off + len, b.length));
        const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(slice);
        let printable = 0;
        for (let i = 0; i < utf8.length; i++) {
            const c = utf8.charCodeAt(i);
            if (c === 9 || c === 10 || c === 13 || (c >= 32 && c < 127)) printable++;
        }
        const ratio = printable / Math.max(1, utf8.length);
        if (ratio < 0.3) {  // more strict now
            // fallback Latin1
            let s = "";
            for (let i = 0; i < slice.length; i++) s += String.fromCharCode(slice[i]);
            return s;
        }
        return utf8;
    }

    // walk EBML but focus into Tags → Tag → SimpleTag → TagName / TagString
    async function walkTags(b, start, end, depth) {
        if (depth > MAX_DEPTH) return false;
        let offset = start;

        while (offset < end) {
            let savedOffset = offset;
            try {
                const idInfo = readVintInfo(b, offset);
                const idLen = idInfo.length;
                const idVal = idInfo.value;
                offset += idLen;
                if (offset >= b.length) break;

                const sizeInfo = readVintInfo(b, offset);
                const sizeLen = sizeInfo.length;
                const sizeVal = sizeInfo.value;
                offset += sizeLen;

                const payloadStart = offset;
                let payloadEnd = offset + sizeVal;
                if (payloadEnd > b.length) payloadEnd = b.length;

                // If this is a container tag (Tags, Tag, SimpleTag), recurse in
                if (idVal === MK.Tags || idVal === MK.Tag || idVal === MK.SimpleTag) {
                    const found = await walkTags(b, payloadStart, payloadEnd, depth + 1);
                    if (found) return true;
                }
                // If this is one of the leaf metadata fields: TagName or TagString
                else if (idVal === MK.TagName || idVal === MK.TagString) {
                    const snippetLen = Math.min(MAX_SNIPPET, payloadEnd - payloadStart);
                    if (snippetLen > 0) {
                        const text = decodeSnippet(b, payloadStart, snippetLen);
                        if (/parameters|workflow|prompt/i.test(text)) {
                            metadata.raw = metadata.raw || {};
                            const cleaned = text.replace(/\0/g, " ").trim();
                            if (!metadata.raw.WEBM_tagFields) metadata.raw.WEBM_tagFields = [];
                            metadata.raw.WEBM_tagFields.push({
                                id: idVal.toString(16),
                                snippet: cleaned
                            });
                            if (!metadata.raw.parameters) metadata.raw.parameters = cleaned;
                            else metadata.raw.parameters += "\n" + cleaned;

                            try {
                                await MetadataExtractor.extractParsedMetadata("parameters", cleaned, metadata);
                            } catch (e) {
                                console.warn("extractParsedMetadata error in WEBM TagName/TagString:", e);
                            }
                            return true;
                        }
                    }
                }

                offset = payloadEnd;
            } catch (e) {
                console.debug("WEBM walkTags error at offset", savedOffset, "depth", depth, e.message);
                break;
            }
        }
        return false;
    }

    // run it
    try {
        const found = await walkTags(buf, 0, buf.length, 0);
        if (found) {
            return metadata;
        }
    } catch (e) {
        console.warn("WEBM tag-based walker threw:", e);
    }

    // fallback
    await this.fallbackTextSearchFromBuffer(buf.buffer, metadata);
    return metadata;
}

// --- WEBM / Matroska metadata parser ---
static async parseWEBMMetadataNW3(file, metadata) {
    const buf = new Uint8Array(await file.arrayBuffer());

    // Proper EBML ID reader (IDs keep the "class bits")
    function readEbmlId(b, offset) {
        const first = b[offset];
        let mask = 0x80;
        let length = 1;
        while ((first & mask) === 0) {
            mask >>= 1;
            length++;
            if (length > 4) break; // max 4 bytes
        }
        if (offset + length > b.length) throw new Error("EBML ID truncated");
        let value = 0;
        for (let i = 0; i < length; i++) {
            value = (value << 8) | b[offset + i];
        }
        return { value, length };
    }

    // EBML size parser (strip class bits)
    function readVintInfo(b, offset) {
        const first = b[offset];
        let mask = 0x80;
        let length = 1;
        while ((first & mask) === 0) {
            mask >>= 1;
            length++;
            if (length > 8) break;
        }
        if (offset + length > b.length) throw new Error("VINT truncated");
        let value = first & (mask - 1);
        for (let i = 1; i < length; i++) {
            value = (value << 8) | b[offset + i];
        }
        return { value, length };
    }

    // Matroska IDs of interest
    const IDS = {
        Tags: 0x1254C367,
        Tag: 0x7373,
        SimpleTag: 0x67C8,
        TagName: 0x45A3,
        TagString: 0x4487
    };

    const decoder = new TextDecoder("utf-8", { fatal: false });

    async function walk(b, start, end, depth) {
        let off = start;
        let found = false;

        while (off < end) {
            if (off >= b.length) break;

            // --- read ID ---
            let idInfo;
            try {
                idInfo = readEbmlId(b, off);
            } catch {
                break;
            }
            const idVal = idInfo.value;
            off += idInfo.length;
            if (off >= b.length) break;

            // --- read size ---
            let sizeInfo;
            try {
                sizeInfo = readVintInfo(b, off);
            } catch {
                break;
            }
            const dataLen = sizeInfo.value;
            off += sizeInfo.length;

            const payloadStart = off;
            const payloadEnd = payloadStart + dataLen;
            if (payloadEnd > end) break; // malformed

            if (idVal === IDS.Tags || idVal === IDS.Tag || idVal === IDS.SimpleTag) {
                // Recurse into these containers
                const ok = await walk(b, payloadStart, payloadEnd, depth + 1);
                if (ok) found = true;
            } else if (idVal === IDS.TagName) {
                const tagName = decoder.decode(b.subarray(payloadStart, payloadEnd)).trim();
                metadata.raw.lastTagName = tagName; // temp stash
            } else if (idVal === IDS.TagString) {
                const tagVal = decoder.decode(b.subarray(payloadStart, payloadEnd)).trim();
                const tagName = metadata.raw.lastTagName || "UnknownTag";
                if (/parameters|workflow|prompt/i.test(tagName) || /parameters|workflow|prompt/i.test(tagVal)) {
                    if (!metadata.raw.WEBM_tags) metadata.raw.WEBM_tags = [];
                    metadata.raw.WEBM_tags.push({ name: tagName, value: tagVal });

                    metadata.raw.parameters = tagVal;
                    await MetadataExtractor.extractParsedMetadata("parameters", tagVal, metadata);
                    found = true;
                }
            }

            off = payloadEnd;
        }

        return found;
    }

    try {
        const found = await walk(buf, 0, buf.length, 0);
        if (found) {
            return metadata;
        }
    } catch (e) {
        console.warn("WEBM EBML walker failed:", e);
    }

    // fallback: 1MB text sniff
    await this.fallbackTextSearchFromBuffer(buf.buffer, metadata);
    return metadata;
}

static async parseMP4Metadata(file, metadata, opts = {}) {
    // Dedicated MP4/ISO-BMFF metadata extractor (ilst / Apple-style atoms)
    const MAX_BYTES = opts.maxBytes || (8 * 1024 * 1024); // read whole file by default up to 8MB
    const MAX_BOXES = opts.maxBoxes || 20000;
    const buf = new Uint8Array(await file.arrayBuffer());
    const len = buf.length;
    const decoder = new TextDecoder("utf-8", { fatal: false });

    metadata.raw = metadata.raw || {};
    metadata.raw.boxes = metadata.raw.boxes || [];

    function readUint32BE(b, off) {
        if (off + 4 > len) return 0;
        return (b[off] << 24) | (b[off + 1] << 16) | (b[off + 2] << 8) | (b[off + 3]);
    }

    function readBoxHeader(b, off) {
        // Returns null on invalid header
        if (off + 8 > len) return null;
        let size = readUint32BE(b, off);
        const type = String.fromCharCode(b[off + 4], b[off + 5], b[off + 6], b[off + 7]);
        let headerSize = 8;

        if (size === 1) {
            // largesize (64-bit) — read next 8 bytes
            if (off + 16 > len) return null;
            const hi = readUint32BE(b, off + 8);
            const lo = readUint32BE(b, off + 12);
            size = hi * 4294967296 + lo;
            headerSize = 16;
        } else if (size === 0) {
            // box extends to end of file
            size = len - off;
        }

        const end = off + size;
        return { size, type, start: off, headerSize, end: Math.min(end, len) };
    }

    function recordBox(h, path = "") {
        metadata.raw.boxes.push({
            type: h.type,
            start: h.start,
            end: h.end,
            headerSize: h.headerSize,
            path
        });
    }

    // Recursively find a nested path of boxes (e.g. ['moov','udta','meta','ilst'])
    function findBoxes(b, start, end, path, depth = 0) {
        let off = start;
        let iterations = 0;

        while (off + 8 <= end && off < len) {
            if (++iterations > MAX_BOXES) break;
            const h = readBoxHeader(b, off);
            if (!h || h.headerSize <= 0) break;

            recordBox(h, path.slice(0, depth + 1).join('/'));

            const payloadStart = h.start + h.headerSize;
            const payloadEnd = Math.min(h.end, end);

            if (h.type === path[0]) {
                if (path.length === 1) {
                    // found the desired box; return payload bounds
                    return { box: h, payloadStart, payloadEnd };
                } else {
                    // descend into this box searching for remaining path
                    const res = findBoxes(b, payloadStart, payloadEnd, path.slice(1), depth + 1);
                    if (res) return res;
                }
            }

            // special case: 'meta' often contains 4 bytes version/flags before child boxes
            if (h.type === 'meta') {
                const metaPayloadStart = payloadStart + 4; // skip version/flags
                const res = findBoxes(b, metaPayloadStart, payloadEnd, path, depth + 1);
                if (res) return res;
            }

            // advance
            if (h.end <= off) {
                // ensure progress
                off = off + h.headerSize;
            } else {
                off = h.end;
            }
        }

        return null;
    }

    // Parse 'ilst' atom structure: each child is a key-box which contains 'data' (and for '----' custom keys the 'name' child)
    function parseIlst(b, start, end) {
        const out = {};
        let off = start;
        let iterations = 0;

        while (off + 8 <= end && off < len) {
            if (++iterations > MAX_BOXES) break;
            const keyH = readBoxHeader(b, off);
            if (!keyH) break;

            const keyType = keyH.type;
            const keyPayloadStart = keyH.start + keyH.headerSize;
            const keyPayloadEnd = Math.min(keyH.end, end);

            // store encountered key box
            // (note: we'll also have recorded it earlier in findBoxes when walking the parent tree)
            // iterate children inside this key box
            let innerOff = keyPayloadStart;
            let foundName = null;
            let foundDataValue = null;

            // first pass to find 'name' (for '----' keys)
            while (innerOff + 8 <= keyPayloadEnd) {
                const childH = readBoxHeader(b, innerOff);
                if (!childH) break;
                if (childH.type === 'name') {
                    const ns = decoder.decode(b.subarray(childH.start + childH.headerSize, Math.min(childH.end, keyPayloadEnd))).replace(/\0/g, '').trim();
                    if (ns.length) foundName = ns;
                    break;
                }
                if (childH.end <= innerOff) innerOff += childH.headerSize; else innerOff = childH.end;
            }

            // second pass: find 'data' child(s)
            innerOff = keyPayloadStart;
            while (innerOff + 8 <= keyPayloadEnd) {
                const childH = readBoxHeader(b, innerOff);
                if (!childH) break;
                const childType = childH.type;
                const dataStart = childH.start + childH.headerSize;
                const dataEnd = Math.min(childH.end, keyPayloadEnd);

                if (childType === 'data') {
                    // Apple data boxes often start with 4 bytes type/flags + 4 bytes locale / reserved.
                    // Skip first 8 bytes when present to reach actual payload.
                    let payloadStart = dataStart;
                    const skip = 8;
                    if ((dataEnd - payloadStart) > skip) payloadStart += skip;

                    const txt = decoder.decode(b.subarray(payloadStart, dataEnd)).replace(/\0/g, '').trim();
                    if (txt.length) {
                        foundDataValue = txt;
                        // store and continue to gather multiple data children if present (concatenate)
                        const keyName = (keyType === '----' && foundName) ? foundName : keyType;
                        const normKey = keyName.replace(/[^\w]/g, '').toLowerCase();
                        if (!out[normKey]) out[normKey] = txt; else out[normKey] += '\n' + txt;
                    }
                }

                if (childH.end <= innerOff) innerOff += childH.headerSize; else innerOff = childH.end;
            }

            if (keyH.end <= off) off += keyH.headerSize; else off = keyH.end;
        }

        return out;
    }

    // Try common metadata paths (some files put ilst under moov->udta->meta->ilst, others moov->meta->ilst)
    const candidatePaths = [
        ['moov', 'udta', 'meta', 'ilst'],
        ['moov', 'meta', 'ilst'],
        ['moov', 'udta', 'ilst']
    ];

    let parsed = null;
    for (const p of candidatePaths) {
        const res = findBoxes(buf, 0, len, p);
        if (res && res.payloadStart < res.payloadEnd) {
            try {
                parsed = parseIlst(buf, res.payloadStart, res.payloadEnd);
            } catch (e) {
                console.warn("parseIlst failed:", e);
            }
            if (parsed && Object.keys(parsed).length) break;
        }
    }

    if (parsed && Object.keys(parsed).length) {
        metadata.raw.MP4 = parsed;

        // Normalize and map common MP4 ilst keys into distinct buckets without losing any raw data.
        // Rules:
        //  - Keep everything in metadata.raw.MP4 (already done) and mirror normalized keys to metadata.raw.<key>
        //  - Detect encoder/tool fields (Lavf / ffmpeg / etc.) and store under metadata.raw.encoder (do not promote)
        //  - 'workflow' → metadata.raw.workflow (full ComfyUI workflow JSON)
        //  - 'cmt' (often reduced ComfyUI inputs JSON) → extract inner "prompt" and set metadata.raw.prompt (do NOT set metadata.raw.parameters)
        //  - 'prompt' → metadata.raw.prompt (do NOT set metadata.raw.parameters)
        //  - 'parameters' (A1111 style) → metadata.raw.parameters and call extractAIGenerationParameters (or fallback)
        //  - Never set metadata.raw.parameters from a 'prompt' mapping; keep them separate.

        const encoderRE = /\b(lavf|lavc|ffmpeg|libav|handbrake|x264|x265|encoder)\b/i;
        const containsPromptKeywords = /parameters|workflow|prompt|comfyui|cliptextencode|inputs|nodes/i;
        const looksLikeJSON = (s) => {
            if (!s) return false;
            const t = String(s).trim();
            return t.startsWith('{') || t.startsWith('[');
        };

        for (const k of Object.keys(parsed)) {
            const rawVal = parsed[k];
            const kl = k.toLowerCase();
            // Mirror raw value for convenience
            metadata.raw[kl] = rawVal;

            // Encoder/tool detection — keep but never promote as prompt/parameters
            if (encoderRE.test(String(rawVal || ''))) {
                metadata.raw.encoder = metadata.raw.encoder || [];
                metadata.raw.encoder.push({ key: kl, value: rawVal });
                continue;
            }

            // 1) Full workflow boxes
            if (kl === 'workflow' || kl === 'comfyui' || kl === 'workflowjson') {
                metadata.raw.workflow = rawVal;
                // If it's JSON, also expose parsed form for downstream use
                if (looksLikeJSON(rawVal)) {
                    try { metadata.raw.workflow_json = JSON.parse(rawVal); } catch {}
                }
                continue;
            }

            // 2) cmt -> reduced ComfyUI inputs JSON which commonly contains an inner "prompt" field.
            if (kl === 'cmt' || kl === 'cmtjson' || kl.includes('cmt')) {
                if (looksLikeJSON(rawVal)) {
                    try {
                        const parsedJson = JSON.parse(rawVal);
                        let foundKey = false;
                        // my test WEBM/MP4 files had both the "prompt" AND the "workflow" embedded in the'cmt' box
                        ['prompt', 'Prompt', 'workflow', 'Workflow'].forEach(key => {
                            // If it contains an inner "prompt" AND also a "workflow" key, extract it as the canonical prompt and workflow
                            if (parsedJson && typeof parsedJson === 'object' && (parsedJson[key])) {
                                foundKey = true;
                                let inner = parsedJson[key];;
                                // Normalize inner to string
                                if (typeof inner === 'object') {
                                    metadata.raw[key] = JSON.stringify(inner);
                                } else {
                                    metadata.raw[key]= String(inner);
                                }
                                // Do NOT set metadata.raw.parameters here (per request)
                                // await
                                MetadataExtractor.extractParsedMetadata(key, metadata.raw[key], metadata)
                                    .then().catch(e => {
                                        console.warn("extractParsedMetadata failed on MP4 cmt->prompt or cmt->workflow:", e);
                                });
                            }
                        });

                        if (!foundKey) {
                            // Not containing inner prompt/workflow — treat as possible workflow or keep raw
                            metadata.raw.cmt_json = parsedJson;
                            // don't promote to parameters
                        }
                        else {
                            // keep parsed cmt JSON for debugging
                            metadata.raw.cmt_json = parsedJson;
                        }

                        continue;
                    } catch (e) {
                        // not valid JSON — fall through
                    }

                    continue;
                }

                // If not JSON but contains prompt/workflow keywords or is long, promote to prompt (not parameters)
                if (containsPromptKeywords.test(String(rawVal || '')) || (typeof rawVal === 'string' && rawVal.length > 128)) {
                    metadata.raw.prompt = rawVal;
                    try {
                        await MetadataExtractor.extractParsedMetadata("prompt", metadata.raw.prompt, metadata);
                    } catch (e) {
                        console.warn("extractParsedMetadata failed on MP4 cmt heuristic:", e);
                    }
                }
                continue;
            }

            // 3) Direct 'prompt' key -> map to metadata.raw.prompt (do NOT set parameters)
            if (kl === 'prompt') {
                if (looksLikeJSON(rawVal)) {
                    try {
                        const pObj = JSON.parse(rawVal);
                        metadata.raw.prompt = typeof pObj === 'string' ? pObj : JSON.stringify(pObj);
                    } catch {
                        metadata.raw.prompt = rawVal;
                    }
                } else {
                    metadata.raw.prompt = rawVal;
                }
                try {
                    await MetadataExtractor.extractParsedMetadata("prompt", metadata.raw.prompt, metadata);
                } catch (e) {
                    console.warn("extractParsedMetadata failed on direct MP4 prompt:", e);
                }
                continue;
            }

            // 4) parameters-like keys -> metadata.raw.parameters and call extractAIGenerationParameters
            if (kl === 'parameters' || kl === 'description' || kl === 'comment' || kl === 'usercomment' || kl === 'xpcomment') {
                metadata.raw.parameters = rawVal;
                try {
                    if (typeof MetadataExtractor.extractAIGenerationParameters === 'function') {
                        await MetadataExtractor.extractAIGenerationParameters(rawVal, metadata);
                    } else {
                        await MetadataExtractor.extractParsedMetadata("parameters", rawVal, metadata);
                    }
                } catch (e) {
                    console.warn("extractAIGenerationParameters / extractParsedMetadata failed on MP4 parameters:", e);
                }
                continue;
            }

            // 5) Fallback: if value looks like big JSON or contains prompt/workflow keywords, treat as prompt (but do NOT set parameters)
            if (!metadata.raw.prompt && (looksLikeJSON(rawVal) || containsPromptKeywords.test(String(rawVal || '')) || (typeof rawVal === 'string' && rawVal.length > 256))) {
                metadata.raw.prompt = looksLikeJSON(rawVal) ? (typeof rawVal === 'string' ? rawVal : JSON.stringify(rawVal)) : String(rawVal);
                try {
                    await MetadataExtractor.extractParsedMetadata("prompt", metadata.raw.prompt, metadata);
                } catch (e) {
                    console.warn("extractParsedMetadata failed on MP4 fallback:", e);
                }
                continue;
            }

            // otherwise: keep mirrored raw key and move on
        }
    }

    return metadata;
}

static async parseWEBMMetadata(file, metadata) {
    const buf = new Uint8Array(await file.arrayBuffer());

    // Quick MP4 detection (ftyp at offset 4)
    const isMP4 = buf.length >= 12 &&
        buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70; // "ftyp"

    if (isMP4) {
        return await this.parseMP4Metadata(file, metadata);
    }

    // Fallback to EBML walker for true WEBM/Matroska files (existing logic)
    function readEbmlId(b, offset) {
        const first = b[offset];
        let mask = 0x80, length = 1;
        while ((first & mask) === 0) { mask >>= 1; length++; if (length > 4) break; }
        let value = 0;
        for (let i = 0; i < length; i++) value = (value << 8) | b[offset + i];
        return { value, length };
    }
    function readVintInfo(b, offset) {
        const first = b[offset];
        let mask = 0x80, length = 1;
        while ((first & mask) === 0) { mask >>= 1; length++; if (length > 8) break; }
        let value = first & (mask - 1);
        for (let i = 1; i < length; i++) value = (value << 8) | b[offset + i];
        return { value, length };
    }

    const decoder = new TextDecoder("utf-8", { fatal: false });

    async function walk(b, start, end, depth) {
        let off = start;
        let found = false;
        while (off < end) {
            try {
                const { value: idVal, length: idLen } = readEbmlId(b, off); off += idLen;
                const { value: dataLen, length: sizeLen } = readVintInfo(b, off); off += sizeLen;
                const payloadStart = off, payloadEnd = payloadStart + dataLen;
                if (payloadEnd > end) break;

                // 🔍 new: sniff into *all* small payloads, not just Tags
                const MAX_SNIFF = 4096;
                if (dataLen > 0 && dataLen <= MAX_SNIFF) {
                    const snippet = decoder.decode(b.subarray(payloadStart, payloadEnd));
                    if (/parameters|workflow|prompt/i.test(snippet)) {
                        metadata.raw = metadata.raw || {};
                        if (!metadata.raw.WEBM_textSnippets) metadata.raw.WEBM_textSnippets = [];
                        metadata.raw.WEBM_textSnippets.push(snippet);

                        metadata.raw.parameters = snippet;
                        await MetadataExtractor.extractParsedMetadata("parameters", snippet, metadata);
                        found = true;
                    }
                }

                // Always recurse into containers (heuristic: big payloads)
                if (dataLen > 0 && (idVal === 0x1254C367 || idVal === 0x18538067 || dataLen > 64)) {
                    const ok = await walk(b, payloadStart, payloadEnd, depth + 1);
                    if (ok) found = true;
                }

                off = payloadEnd;
            } catch {
                break;
            }
        }
        return found;
    }

    try {
        const found = await walk(buf, 0, buf.length, 0);
        if (found) return metadata;
    } catch (e) {
        console.warn("WEBM EBML walker failed:", e);
    }

    // fallback: plain 1MB sniff
    await this.fallbackTextSearchFromBuffer(buf, metadata);
    return metadata;
}


// END of class MetadataParsers

} // END of class MetadataParsers

// Make MetadataParsers available globally
window.MetadataParsers = MetadataParsers;