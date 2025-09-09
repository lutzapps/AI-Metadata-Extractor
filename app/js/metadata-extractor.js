class MetadataExtractor {
    static async extract(file) {
        // initialize data structures (and clear for this image drop)
        const metadata = {
            parameters: {}, // e.g. "prompt", "negative prompt", "CFG scale", etc. (comes from raw.parameters)
            comfyuiWorkflow: null, // validated full JSON WF (comes from raw.workflow)
            comfyuiPromptInputsWorkflow: null, // "reduced JSON WF with 'Inputs" nodes (comes from raw.prompt)
            resolvedModels: null, // enriched models after CivitAI lookups from the extracted Hashes
            raw: {} // extracted EXIF/XMP "parameters", "prompt", "workflow", and other like "Hashes", and the dumps from EXIF/XMP detections
        };
        
        window.storedParameters = {}; // AI parameters (for SAVE)
        window.storedArtefacts = {}; // workflow (for SAVE), hashes (for SAVE)
        window.storedPrompts = {}; // stored prompts (not used right now)
        window.storedFileName = null; // dropped image filename (with extension)

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
                await MetadataParsers.parseWEBMMetadata(file, metadata);
            } else { // generic video file (mp4, mpeg, avi, mov, etc.)
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
        
        // Extract model hashes for later resolution
        this.extractModelHashes(text, metadata);
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

    //TODO - this extractModelHashes() is redundant with the
    // function extractResources() which calles Style1-Style4 parsers
    static extractModelHashes(text, metadata) {
        // Initialize hashes object
        let hashes = {};
        
        // Look for model hashes in the parameters (existing pattern)
        const hashesMatch = text.match(/Hashes:\s*({[^}]+})/i);
        if (hashesMatch) {
            try {
                const parsedHashes = JSON.parse(hashesMatch[1]);
                hashes = {...hashes, ...parsedHashes};
            }
            catch (e) {
                // Not valid JSON, try to parse as key-value pairs
                const hashesText = hashesMatch[1];
                const hashPairs = hashesText.match(/"([^"]+)":"([^"]+)"/g);
                if (hashPairs) {
                    for (const pair of hashPairs) {
                        let [key, value] = pair.replace(/"/g, '').split(':');
                        let [type, name] = key.includes(":") ? key.split(":") : [key, ''];
                        type = type.toLowerCase(); // can have "lora:xxx" OR "LORA:yyy"
                        name = this.getFileName(name);
                        hashes[`${type}:${name}`] = value;
                    }
                }
            }
        }
        
        // Look for model hash pattern: Model hash: 217daae812
        const modelHashMatch = text.match(/Model hash:\s*([a-fA-F0-9]+)/i);
        if (modelHashMatch) {
            // Truncate 12-character hashes to 10 characters
            const modelHash = modelHashMatch[1].length === 12 ? modelHashMatch[1].substring(0, 10) : modelHashMatch[1];
            // Store with a key that indicates this is a Checkpoint

            // often Style1 also has a "Model: " entry right after it, e.g.
            // Model hash: 217daae812, Model: JANKUV5NSFWTrainedNoobai_v50, ...
            // the "Model" name can only enrich an existing "Model hash", but not be found alone (without a "Model hash")
            const matchModel = text.match(/Model:\s*([^,]+)/i);

            let key = (matchModel) ? "model:" + matchModel[1].trim() : "model";
            hashes[key] = modelHash;
        }
        
        // Look for Lora hashes pattern: Lora hashes: "name1: hash1, name2: hash2, ..."
        const loraHashesMatch = text.match(/Lora hashes:\s*"([^"]+)"/i);
        if (loraHashesMatch) {
            const loraHashesText = loraHashesMatch[1];
            // Parse the format "name1: hash1, name2: hash2, ..."
            // Split by comma and then parse each part
            const loraHashPairs = loraHashesText.split(',').map(pair => pair.trim());
            for (const pair of loraHashPairs) {
                const colonIndex = pair.lastIndexOf(':');
                if (colonIndex > 0) {
                    const name = pair.substring(0, colonIndex).trim();
                    const hash = pair.substring(colonIndex + 1).trim();
                    // Validate that hash is a valid hex string
                    if (/^[a-fA-F0-9]+$/.test(hash)) {
                        // For LORA hashes, keep the full 12-character hash (don't truncate)
                        const loraHash = hash; // Keep full 12-char hash for LORA
                        // Use a key that indicates this is a LORA
                        hashes[`lora:${name}`] = loraHash; //
                    }
                }
            }
        }
        
        // Look for TI hashes pattern: TI hashes: "name1: hash1, name2: hash2, ..."
        const tiHashesMatch = text.match(/TI hashes:\s*"([^"]+)"/i);
        if (tiHashesMatch) {
            const tiHashesText = tiHashesMatch[1];
            // Parse the format "name1: hash1, name2: hash2, ..."
            // Note: There can be duplicates, so we need to handle that
            const tiHashPairs = tiHashesText.split(',').map(pair => pair.trim());
            // Use a Set to track unique hashes and avoid duplicates
            const uniqueHashes = new Set();
            for (const pair of tiHashPairs) {
                const colonIndex = pair.lastIndexOf(':');
                if (colonIndex > 0) {
                    const name = pair.substring(0, colonIndex).trim();
                    const hash = pair.substring(colonIndex + 1).trim();
                    // Validate that hash is a valid hex string
                    if (/^[a-fA-F0-9]+$/.test(hash)) {
                        // For TI hashes, truncate 12-character hashes to 10 characters
                        const tiHash = hash.length === 12 ? hash.substring(0, 10) : hash;
                        // Check if we've already seen this hash
                        if (!uniqueHashes.has(tiHash)) {
                            // Add to our set of unique hashes
                            uniqueHashes.add(tiHash);
                            // Use a key that indicates this is a Textual Inversion
                            hashes[`embed:${name}`] = tiHash;
                        }
                    }
                }
            }
        }
//BUG: only extracts the 1st URN, fix and ut in parseAirURN() function
        // Look for "AIR" URNs (they are equally unique as a hash)
        const civitaiRegex = /Civitai resources:\s*(\[.*?\])(?:,|$)/is;
        // Civitai resources: → literal prefix
        // \s*          → allow spaces
        // (\[.*?\])    → capture the JSON array, non-greedy

        // use regex.exec(text), instead of text.match(regex), as it loops thru the arr, match() does only work for first arr instance
        //const match = metadataRawParameters.match(regex);
        const match = civitaiRegex.exec(text);
        if (match) {
            let arr = JSON.parse(match[1]); // get the AIR URN JSON array

            // loop thru the arr
            arr.map(r => {
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
                    //hashes[`${resourceType}:${modelId}@${modelVersionId}`] = airURN;
                    hashes[`${resourceType}:${r.modelName}@${r.versionName}`] = airURN;
                }
                else { // no AIR urn found
                    hashes[`${r.type}:${r.modelName}@${r.modelVersionName}`] = r.modelVersionId;
                }

                /*
                return {
                    type: // needs to by synced with the normalizeType() helper function
                    r.air?.includes(":lora:") ? "LORA" :
                    r.air?.includes(":embedding:") ? "TextualInversion" :
                    r.air?.includes(":checkpoint:") ? "Checkpoint" : airMatch?.[2],
                    name: r.modelName,
                    version: r.versionName,
                    weight: r.weight ?? 1.0, // default 1.0 if missing
                    airUrn: r.air,
                    modelType: airMatch?.[1], // e.g. "sdxl"
                    resourceType: airMatch?.[2], // e.g. "checkpoint", "lora", "embedding", ...
                    modelId: airMatch?.[3],
                    modelVersionId: airMatch?.[4],
                    source: "Style4"
                };
                */
            });
        }
        
        // store the Hashes dict into raw metadata
        // Only set hashes in metadata if we found some
        if (Object.keys(hashes).length > 0) {
            metadata.raw['hashes'] = hashes;
        }
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

        // AIR debugging:
        //const style4Res = this.parseStyle4(metadataRawParameters);
        //alert("Style4Res:\n" + UI.formatJSON(style4Res)); //FIX

        const resources = [
            ...this.parseStyle1(metadataRawParameters),
            ...this.parseStyle2(metadataRawParameters),
            ...this.parseStyle3(metadataRawParameters),
            ...this.parseStyle4(metadataRawParameters)
        ];

        return resources;
    }

    // *** helper function (used currently for Style2)
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


    /**
     * Style 1: "Model hash: 217daae812"
     */
    static parseStyle1(metadataRawParameters) {
        const regexModelHash = /Model hash:\s*([a-fA-F0-9]{10,12})/i;
        const matchModelHash = metadataRawParameters.match(regexModelHash);

        if (!matchModelHash) return [];

        // often Style1 also has a "Model: " entry right after it, e.g.
        // Model hash: 217daae812, Model: JANKUV5NSFWTrainedNoobai_v50, ...
        // the "Model" name can only enrich an existing "Model hash", but not be found alone (without a "Model hash")
        const regexModel = /Model:\s*([^,]+)/i;
        const matchModel = metadataRawParameters.match(regexModel);

        return [
            {
                displayType: this.normalizeType("Checkpoint", "model"), //displayTypeMap["Model hash"],
                type: "Checkpoint",
                prefix: "model",
                hash: (matchModelHash) ? matchModelHash[1].trim() : "Unknown",
                name: (matchModel) ? matchModel[1].trim() : "Unkown",
                source: "Style1"
            }
        ];
    }

    /**
     * Style 2: …, Hashes: {"embed:lazypos":"3086669265","embed:lazyneg":"ba21023c70","model":"217daae812”}, …
     */
    static parseStyle2(metadataRawParameters) {
        //const regex = /Hashes:\s*({.*?})(?:,|$)/i; // not always worked as there sometimes the comma is missing
        //const regex = /Hashes:\s*({.*?})(?:s*|,|$)/i; // fixed and added s*  - should work, but not really needed
        const regex = /Hashes:\s*({.*?})/i; // only match everything between the curly brackets {...}
        //const regex = /Hashes:\s*({[^}]+})/i; // seems also to work (but not consistant with Style3 regEx)
        const hashesMatch = metadataRawParameters.match(regex);

        if (!hashesMatch)
            return [];
        
        let parsed;

        try {
            parsed = JSON.parse(hashesMatch[1]);
        } catch {
            return [];
        }

        // sometimes Style2 "Hashes" also contain a 'model' hash (without a name),
        // and also has a "Model: " entry right after it, e.g.
        // Hashes: {"model": "59225eddc3", "lora:hololive_kaela_kovalskia_redebut": "11bc3bab82",
        //  "lora:Butterfly_Applique_Black_Silk_Chiffon_Party_Dress": "c555e1d0f1", ... }
        // the "Model" name can only enrich an existing "Model hash", or Hashes: {"model:"},
        // but is typically notfound alone (without a "Model hash", or "Hashes" dict)
        return Object.entries(parsed).map(([key, val]) => {
            let [type, name] = key.includes(":") ? key.split(":") : [key, ''];
            type = type.toLowerCase(); // can have "lora:xxx" OR "LORA:yyy"
            if (type === 'model' && name === '') {
                // try to get the missing 'name' from a separate "Model:" metadata property
                const regexModel = /Model:\s*([^,]+)/i;
                const matchModel = metadataRawParameters.match(regexModel);
                if (matchModel)
                    name = matchModel[1]; // update the empty name with found "Model"
            }
            //TODO - leave the 'embed' 12-char hashes unchanged
            // (even we know they mostly only work as 10-char "candidates")
            // for now leave that to the dedupeAndMergeResources() function

            // lora hashes can come in the following format:
            //  "LORA:pony/twilight_style" and should be stripped to "LORA:twilight_style"
            name = this.getFileName(name); // cut path prefix

            return {
                displayType: this.normalizeType(type, key), //displayTypeMap[type] || "Unknown",
                type: (type === 'model') ? 'Checkpoint' : (type === 'lora') ? 'LORA' : (type === 'embed') ? 'TextualInversion' : (type === 'adetailer') ? 'ADetailer' : type, // last fallback to 'unknown' type (but preserve it)
                prefix: type, // 'model', "lora", 'embed', 'adetailer'
                hash: val.trim(),
                name: name.trim(),
                source: "Style2"
            };
        });
    }

    /**
     * Style 3: Lora hashes / TI hashes
     * 
     * Example:
     * Lora hashes: "TrendCraft_The_Peoples_Style_Detailer-v2.4I-5_18_2025-Illustrious: 6a2b18d95a97, breasts_size_slider_illustrious_goofy: 419768fc16a7, pkmndiantha-illu-nvwls-v1: e45d18e63514”, …
     * 
     * Example (with duplicates):
     * TI hashes: "lazyneg: ba21023c7054, lazyhand: 3cc8f76aaf5a, lazyneg: ba21023c7054, lazyhand: 3cc8f76aaf5a", …
     */
    static parseStyle3(metadataRawParameters) {
        const results = [];
        const loraRegex = /Lora hashes:\s*"(.*?)"/i;
        const tiRegex = /TI hashes:\s*"(.*?)"/i; //TODO: "TI: " only

        const parsePairs = (str, prefix) =>
            str.split(/\s*,\s*/).map(pair => {
            const [name, hash] = pair.split(/\s*:\s*/);

            return {
                displayType: this.normalizeType(prefix, `${prefix}:${name}`), //displayTypeMap[prefix],
                type: (prefix === 'model') ? 'Checkpoint' : (prefix === 'lora') ? 'LORA' : (prefix === "embed") ? "TextualInversion" : prefix, //TODO
                prefix: prefix,
                hash: hash,
                name: name,
                source: "Style3"
            };
        });

        const loraMatch = metadataRawParameters.match(loraRegex);

        if (loraMatch)
            results.push(...parsePairs(loraMatch[1], "lora")); // "Lora hashes"

        const tiMatch = metadataRawParameters.match(tiRegex);
        if (tiMatch)
            results.push(...parsePairs(tiMatch[1], "embed")); // "TI hashes"

        // Deduplicate by hash
        return Array.from(new Map(results.map(r => [r.hash, r])).values());
    }

    /**
     * Style 4: Civitai resources: [ ... ]
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
    static parseStyle4(metadataRawParameters) {
        //const regex = /Civitai resources:\s*(\[.*?\])(?=[,}\]])/is;
        const civitaiRegex = /Civitai resources:\s*(\[.*?\])(?:,|$)/is;
        // Civitai resources: → literal prefix
        // \s*          → allow spaces
        // (\[.*?\])    → capture the JSON array, non-greedy
        // (?=[,}\]])   → lookahead: array must be followed by ,, }, or ] (so we stop cleanly)

        // use regex.exec(text), instead of text.match(regex), as it loops thru the arr, match() does only work for first arr instance
        //const match = metadataRawParameters.match(regex);
        const match = civitaiRegex.exec(metadataRawParameters);

        if (metadataRawParameters.includes("Civitai resources:") && !match) {
            const Style4Error = `Style4 Parser: 'Civitai resources' block found in 'raw' metadata, but cannot be parsed successfully with RegEx:\n${UI.formatJSON(metadataRawParameters)}`;
            console.log(Style4Error);

            return [];
        }

        let arr;
        try {
            arr = JSON.parse(match[1]); // get the AIR URN JSON array
        } catch {
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
                // as we cannot reliably expect always to have a 'modelId' in Style4,
                // it is better to avoid it at all, and let resolveByModelVersionId() resolve it
                modelId: (airMatch?.[3]) ? airMatch?.[3] : undefined, // pass the modelId as 'undefined' to trigger it
                modelVersionId: (airMatch?.[4]) ? airMatch?.[4] : r.modelVersionId,
                source: "Style4"
            };
        });
    }

    /**
     * Deduplicate (and merge) resources across all styles
     * 
     * Merge resources with style priority and debug tracing.
     * Preference order: Style4 > Style3 > Style2 > Style1
     * - Style4 (CivitAI resources / air URNs) → already has modelName, versionName, weight.
     * - Style3 (Lora hashes / TI hashes) → at least differentiates LoRA vs Embedding.
     * - Style2 (Hashes map) → contains different resource types, but only hash + type.
     * - Style1 (Model hash) → minimal info, just the raw checkpoint hash.
     * 
     * Priority-based Merge:
     * - If the same model (by hash, air, or id) shows up in multiple styles, keep the one from the highest-preference style.
     * - That means Style4 overrides Style3/2/1, Style3 overrides 2/1, etc.
     * 
     * Merge-aware deduplication of properties:
     * - Each extracted resource should carry a style property (1, 2, 3, 4) so we know where it came from.
     * - Deduplication picks the best version of a model reference based on your preference.
     * - Style priority decides which entry is the base.
     * - Any missing fields (like hash, weight, trainedWords) are pulled from lower-priority duplicates.
     * - That way, if Style4 doesn’t include a hash but Style2 does → we keep both.
     * 
     * - wired in some per-field debug tracing so you can later see exactly which Style contributed which property.
     */
    static dedupeAndMergeResources(resources, { debug = true } = {}) {
        const stylePriority = { 4: 4, 3: 3, 2: 2, 1: 1 };
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

            Style2::
            LoRAs with 10-char WRONG Style2 “Hashes”:
            Hashes: {"model": "59225eddc3", "lora:hololive_kaela_kovalskia_redebut": "11bc3bab82", "lora:Butterfly_Applique_Black_Silk_Chiffon_Party_Dress": "c555e1d0f1", "lora:USNR_STYLE_ILL": "44586d0587", "lora:WSSKX_WAI": "e6b4013103", "lora:TRT_IL": "4f993f5458", "lora:DynamicPoseIL2att_alpha1_rank4_noxattn_900steps": "629144e9d8", "lora:Smooth_Booster_v3": "61d7ee6c08",

            New hash type: ‘adetailer’ hash (found in Style2 “Hashes”), but also found separately (see below):
            Hashes: {"model": "59225eddc3", "lora:hololive_kaela_kovalskia_redebut": "11bc3bab82", "lora:Butterfly_Applique_Black_Silk_Chiffon_Party_Dress": "c555e1d0f1", "lora:USNR_STYLE_ILL": "44586d0587", "lora:WSSKX_WAI": "e6b4013103", "lora:TRT_IL": "4f993f5458", "lora:DynamicPoseIL2att_alpha1_rank4_noxattn_900steps": "629144e9d8", "lora:Smooth_Booster_v3": "61d7ee6c08", "adetailer:face_yolov9c.pt": "d02fe493c3", "adetailer:hand_yolov9c.pt": "6f116f686e", "adetailer:foot_yolov8x_v2.pt": "9f39f32ab8", "embed:lazypos": "3086669265", "embed:lazyneg": "ba21023c70", "embed:lazyhand": "3cc8f76aaf"}

            Type “adetailer”:
            "adetailer:face_yolov9c.pt": "d02fe493c3", "adetailer:hand_yolov9c.pt": "6f116f686e", "adetailer:foot_yolov8x_v2.pt": "9f39f32ab8"
            
            “embed” (TI) with 10-char RIGHT (and without duplicates) found in Style2 “Hashes”:
            "embed:lazypos": "3086669265", "embed:lazyneg": "ba21023c70", "embed:lazyhand": "3cc8f76aaf"}

            Style3::
            But then later in the same metadata:
            Same LoRAs with 12-char RIGHT Style3 "Lora hashes":
            Lora hashes: "hololive_kaela_kovalskia_redebut: 11bc3bab8208, Butterfly_Applique_Black_Silk_Chiffon_Party_Dress: c555e1d0f1be, USNR_STYLE_ILL: 44586d05878a, WSSKX_WAI: e6b401310305, TRT_IL: 4f993f545850, DynamicPoseIL2att_alpha1_rank4_noxattn_900steps: 629144e9d885, Smooth_Booster_v3: 61d7ee6c08bd"

            TI with duplicates and 12-char WRONG (need 10-chars) Style3 "TI hashes":
            TI hashes: "lazypos: 30866692653c, lazypos: 30866692653c, lazyneg: ba21023c7054, lazyhand: 3cc8f76aaf5a, lazyneg: ba21023c7054, lazyhand: 3cc8f76aaf5a, lazypos: 30866692653c, lazypos: 30866692653c, lazyneg: ba21023c7054, lazyhand: 3cc8f76aaf5a, lazyneg: ba21023c7054, lazyhand: 3cc8f76aaf5a"

            ADetailer:
            "adetailer" hashes found in Style2 "Hashes" (3x for 'face_*', 'hand_*', and 'foot_*'),
            (see above in Style2, but additionally metadata keys for this 3 'adetailer' models can exist, like:
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
                "hash": "59225eddc3", <-- RIGHT "model" 10-char hash from Style2
                "name": "model", <-- here we LOOSE the name from Style1 for the "Hashes" dict
                "source": "Style2"
            },
            {
                "displayType": "LoRA",
                "type": "LORA",
                "prefix": "lora",
                "hash": "11bc3bab82", <-- WRONG "lora" 10-char hash from Style2
                "name": "hololive_kaela_kovalskia_redebut",
                "source": "Style2"
            },
            {
                "displayType": "LoRA",
                "type": "LORA",
                "prefix": "lora",
                "hash": "c555e1d0f1", <-- WRONG "lora" 10-char hash from Style2
                "name": "Butterfly_Applique_Black_Silk_Chiffon_Party_Dress",
                "source": "Style2"
            },
            {
                "displayType": "LoRA",
                "type": "LORA",
                "prefix": "lora",
                "hash": "44586d0587", <-- WRONG "lora" 10-char hash from Style2
                "name": "USNR_STYLE_ILL",
                "source": "Style2"
            },
            {
                "displayType": "LoRA",
                "type": "LORA",
                "prefix": "lora",
                "hash": "e6b4013103", <-- WRONG "lora" 10-char hash from Style2
                "name": "WSSKX_WAI",
                "source": "Style2"
            },
            {
                "displayType": "LoRA",
                "type": "LORA",
                "prefix": "lora",
                "hash": "4f993f5458", <-- WRONG "lora" 10-char hash from Style2
                "name": "TRT_IL",
                "source": "Style2"
            },
            {
                "displayType": "LoRA",
                "type": "LORA",
                "prefix": "lora",
                "hash": "629144e9d8", <-- WRONG "lora" 10-char hash from Style2
                "name": "DynamicPoseIL2att_alpha1_rank4_noxattn_900steps",
                "source": "Style2"
            },
            {
                "displayType": "LoRA",
                "type": "LORA",
                "prefix": "lora",
                "hash": "61d7ee6c08", <-- WRONG "lora" 10-char hash from Style2
                "name": "Smooth_Booster_v3",
                "source": "Style2"
            },
            {
                "displayType": "Unknown",
                "type": "adetailer",
                "prefix": "adetailer", <-- NEW "adetailer" type/prefix
                "hash": "d02fe493c3", <-- NEW 10-char hash from Style2
                "name": "face_yolov9c.pt",
                "source": "Style2"
            },
            {
                "displayType": "Unknown",
                "type": "adetailer",
                "prefix": "adetailer", <-- NEW "adetailer" type/prefix
                "hash": "6f116f686e", <-- NEW 10-char hash from Style2
                "name": "hand_yolov9c.pt",
                "source": "Style2"
            },
            {
                "displayType": "Unknown",
                "type": "adetailer",
                "prefix": "adetailer", <-- NEW "adetailer" type/prefix
                "hash": "9f39f32ab8", <-- NEW 10-char hash from Style2
                "name": "foot_yolov8x_v2.pt",
                "source": "Style2"
            },
            {
                "displayType": "Embedding",
                "type": "TextualInversion",
                "prefix": "embed",
                "hash": "3086669265", <-- RIGHT "embed" 10-char hash from Style2
                "name": "lazypos",
                "source": "Style2"
            },
            {
                "displayType": "Embedding",
                "type": "TextualInversion",
                "prefix": "embed",
                "hash": "ba21023c70", <-- RIGHT "embed" 10-char hash from Style2
                "name": "lazyneg",
                "source": "Style2"
            },
            {
                "displayType": "Embedding",
                "type": "TextualInversion",
                "prefix": "embed",
                "hash": "3cc8f76aaf", <-- RIGHT "embed" 10-char hash from Style2
                "name": "lazyhand",
                "source": "Style2"
            },
            {
                "displayType": "LoRA",
                "type": "LORA",
                "prefix": "lora",
                "hash": "11bc3bab8208", <-- RIGHT "lora" 12-char hash from Style3
                "name": "hololive_kaela_kovalskia_redebut",
                "source": "Style3"
            },
            {
                "displayType": "LoRA",
                "type": "LORA",
                "prefix": "lora",
                "hash": "c555e1d0f1be", <-- RIGHT "lora" 12-char hash from Style3
                "name": "Butterfly_Applique_Black_Silk_Chiffon_Party_Dress",
                "source": "Style3"
            },
            {
                "displayType": "LoRA",
                "type": "LORA",
                "prefix": "lora",
                "hash": "44586d05878a", <-- RIGHT "lora" 12-char hash from Style3
                "name": "USNR_STYLE_ILL",
                "source": "Style3"
            },
            {
                "displayType": "LoRA",
                "type": "LORA",
                "prefix": "lora",
                "hash": "e6b401310305", <-- RIGHT "lora" 12-char hash from Style3
                "name": "WSSKX_WAI",
                "source": "Style3"
            },
            {
                "displayType": "LoRA",
                "type": "LORA",
                "prefix": "lora",
                "hash": "4f993f545850", <-- RIGHT "lora" 12-char hash from Style3
                "name": "TRT_IL",
                "source": "Style3"
            },
            {
                "displayType": "LoRA",
                "type": "LORA",
                "prefix": "lora",
                "hash": "629144e9d885", <-- RIGHT "lora" 12-char hash from Style3
                "name": "DynamicPoseIL2att_alpha1_rank4_noxattn_900steps",
                "source": "Style3"
            },
            {
                "displayType": "LoRA",
                "type": "LORA",
                "prefix": "lora",
                "hash": "61d7ee6c08bd", <-- RIGHT "lora" 12-char hash from Style3
                "name": "Smooth_Booster_v3",
                "source": "Style3"
            },
            {
                "displayType": "Embedding",
                "type": "TextualInversion",
                "prefix": "embed",
                "hash": "30866692653c", <-- WRONG "embed" 12-char hash from Style3 (fallback)
                "name": "lazypos",
                "source": "Style3"
            },
            {
                "displayType": "Embedding",
                "type": "TextualInversion",
                "prefix": "embed",
                "hash": "ba21023c7054", <-- WRONG "embed" 12-char hash from Style3 (fallback)
                "name": "lazyneg",
                "source": "Style3"
            },
            {
                "displayType": "Embedding",
                "type": "TextualInversion",
                "prefix": "embed",
                "hash": "3cc8f76aaf5a", <-- WRONG "embed" 12-char hash from Style3 (fallback)
                "name": "lazyhand",
                "source": "Style3"
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
            // LoRAs (WRONG) 10-key hashes only come from Style2 "Hashes" and the (RIGHT) 12-key hashes from Style3 "Lora hashes" should win
            // Embeddings (WRONG) 12-key hashes only come from Style3 "TI hashes" and the (RIGHT) 10-key hashes from the lower Style2 "Hashes",
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
            
            if (!key) continue;

            // replace res.style with style in this function
            // as in the Resources we only have "source": "Style3"
            const styleName = res.source.trim(); // e.g. "Style3"
            const style = parseInt(styleName.substring(styleName.length - 1)); // e.g. 3

            // const stylePriority = { 4: 4, 3: 3, 2: 2, 1: 1 };
            //const currentRank = stylePriority[res.style] || 0;
            const currentRank = stylePriority[style] || 0;

            if (!seen.has(key)) {
                if (debug) {
                    console.log(`[dedupe] New entry → key=${key}, Style${style}`);
                }
                seen.set(key, { resource: { ...res }, styleRank: currentRank });
            } else {
                const existing = seen.get(key);

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

    // --- Core: resolveByAirUrn (Style4) ---
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
            : `${prefix}:${resolvedAutoV2Hash}`;

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
            name: model.name || version.model.name || resource.modelName || "Unknown",
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
        const name = resource.name; // Style1?, Style2 and Style3 have a name with the "hashes"
        const prefix = resource.prefix;
        const type = resource.type;
        const displayType = this.normalizeType(type, prefix);

        const key = (prefix === "model")
            ? "model" 
            : `${prefix}:${hash}`;

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
        if (this.debug)
            alert('resolveModelHashes() - metadata.raw["parameters"]:\n' + UI.formatJSON(metadata.raw["parameters"])); //FIX

        // support also the new AIR urns in "Civit resources" metadata
        // as e.g. in image "./Test Images/96537334.png"

        let resolvedModels = {};

        // Replace the IIFE with direct async/await
        try {
            if (this.debug)
                alert("metadata:\n" + UI.formatJSON(metadata)); //FIX
            resolvedModels = await this.enrichAllResources(metadata);
            console.log(UI.formatJSON(resolvedModels));
            if (this.debug)
                alert("Enriched All resolved models:\n" + UI.formatJSON(resolvedModels)); //FIX
        } catch (error) {
            console.error("Error enriching resources:", error);
            alert("Error enriching resources: " + error.message);
        }

        if (Object.keys(resolvedModels).length > 0) {
            metadata.resolvedModels = resolvedModels;
        }

        console.debug("resolveModelHashes() - metadata.raw.hashes\n", UI.formatJSON(metadata.raw.hashes));

        return metadata;
//TODO - below is "DEAD" code, we probably only "miss" metadata.raw.hashes from above code ??
// We ONLY miss the "hashes" dict from "simple" pics and from "96537334.png", which is a "Style4" AIR URN only resolver
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

        parameters['WF Consolidated Positive Prompt'] = wfConsolidatedPositivePrompt; //.slice(0, -2); // cut trailing ", "
        parameters['WF Consolidated Negative Prompt'] = wfConsolidatedNegativePrompt; //.slice(0, -2); // cut trailing ", "

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
        parameters["WF Consolidated Positive Prompt"] = wfConsolidatedPositivePrompt;
        parameters["WF Consolidated Negative Prompt"] = wfConsolidatedNegativePrompt;

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
                    typeof node.inputs.text === 'string') {
                    console.log("Found inputs.text in CLIPTextEncode:", node.inputs.text.substring(0, 200));
                    return `[${nodeTitle}:] ${node.inputs.text}`;
                }
                
                // Check for widgets_values (method 1 - fallback)
                if (node.widgets_values &&
                    Array.isArray(node.widgets_values) &&
                    node.widgets_values.length > 0 &&
                    typeof node.widgets_values[0] === 'string') {
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