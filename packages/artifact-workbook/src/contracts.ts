/** Local workbook operations; no provider discovery, network, run files or business rules. */
export type WorkbookCell = string | number | boolean | null | Date;
export type WorkbookMatrix = readonly (readonly WorkbookCell[])[];
export interface WorkbookFont {
  readonly name?: string;
  readonly size?: number;
  readonly bold?: boolean;
  readonly color?: string;
}
export interface WorkbookRangeFormat {
  readonly wrapText?: boolean;
  readonly columnWidthPx?: number;
  readonly rowHeightPx?: number;
  readonly verticalAlignment?: 'top' | 'center' | 'bottom';
  readonly horizontalAlignment?: 'left' | 'center' | 'right';
  readonly borders?: {
    readonly preset: 'outside' | 'inside' | 'all' | 'none' | 'doubleBottom';
    readonly style: string;
    readonly color: string;
  };
}
export interface WorkbookRange {
  setValues(values: WorkbookMatrix): void;
  setNumberFormat(format: string): void;
  setFont(font: WorkbookFont): void;
  setFillColor(color: string): void;
  setFormat(format: WorkbookRangeFormat): void;
  autofitColumns(): void;
}
export interface WorkbookWorksheet {
  range(address: string): WorkbookRange;
  rangeByIndexes(row: number, column: number, rows: number, columns: number): WorkbookRange;
  usedRange(): WorkbookRange;
  freezeRows(count: number): void;
  freezeColumns(count: number): void;
  showGridLines(visible: boolean): void;
}
export interface WorkbookInspection {
  readonly kind: string;
  readonly sheetId?: string;
  readonly range?: string;
  readonly include?: string;
  readonly tableMaxRows?: number;
  readonly tableMaxCols?: number;
  readonly maxChars?: number;
  readonly searchTerm?: string;
  readonly options?: { readonly useRegex?: boolean; readonly maxResults?: number };
  readonly summary?: string;
}
export interface WorkbookRender {
  readonly sheetName: string;
  readonly range: string;
  readonly scale: number;
  readonly format: 'png';
}
export interface ArtifactWorkbook {
  addWorksheet(name: string): WorkbookWorksheet;
  worksheet(name: string): WorkbookWorksheet;
  inspect(request: WorkbookInspection): Promise<unknown>;
  render(request: WorkbookRender): Promise<Uint8Array>;
  saveXlsx(file: string): Promise<void>;
}
export interface ArtifactWorkbookProvider {
  create(): ArtifactWorkbook;
  openXlsx(file: string): Promise<ArtifactWorkbook>;
}
