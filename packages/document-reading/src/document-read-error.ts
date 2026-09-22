export class DocumentReadError extends Error {}
/** Temporary parser capacity, not an invalid document or missing business evidence. */
export class DocumentReadBusyError extends DocumentReadError {}
