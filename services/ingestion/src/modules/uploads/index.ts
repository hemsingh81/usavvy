export { registerUploadsRoutes, type UploadsRouteDeps } from "./routes.js";
export {
  uploadDocument,
  listUploadedDocuments,
  getPdfPageCount,
  SUPPORTED_FILE_EXTENSIONS,
  MAX_FILE_SIZE_BYTES,
  MAX_PAGES,
  MAX_FILES_PER_CUSTOM_COURSE,
} from "./service.js";
