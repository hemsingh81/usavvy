export { registerUploadsRoutes, type UploadsRouteDeps } from "./routes.js";
export {
  uploadDocument,
  importPastedText,
  importFromUrl,
  listUploadedDocuments,
  getPdfPageCount,
  stripHtmlToReadableText,
  SUPPORTED_FILE_EXTENSIONS,
  MAX_FILE_SIZE_BYTES,
  MAX_PAGES,
  MAX_FILES_PER_CUSTOM_COURSE,
  MIN_PASTED_TEXT_WORDS,
} from "./service.js";
