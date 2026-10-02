import type { WorkbookRange, WorkbookWorksheet } from './contracts.js';
import { assign, assignMembers, invoke, member } from './vendor-object.js';

function range(raw: unknown): WorkbookRange {
  return {
    setValues: (values): void => {
      assign(raw, 'values', values);
    },
    setNumberFormat: (format): void => {
      invoke(raw, 'setNumberFormat', [format]);
    },
    setFont: (font): void => {
      assignMembers(member(member(raw, 'format'), 'font'), font);
    },
    setFillColor: (color): void => {
      assign(member(member(raw, 'format'), 'fill'), 'color', color);
    },
    setFormat: (format): void => {
      assignMembers(member(raw, 'format'), format);
    },
    autofitColumns: (): void => {
      invoke(member(raw, 'format'), 'autofitColumns');
    },
  };
}
export function worksheet(raw: unknown): WorkbookWorksheet {
  return {
    range: (address) => range(invoke(raw, 'getRange', [address])),
    rangeByIndexes: (...indexes) => range(invoke(raw, 'getRangeByIndexes', indexes)),
    usedRange: () => range(invoke(raw, 'getUsedRange')),
    freezeRows: (count): void => {
      invoke(member(raw, 'freezePanes'), 'freezeRows', [count]);
    },
    freezeColumns: (count): void => {
      invoke(member(raw, 'freezePanes'), 'freezeColumns', [count]);
    },
    showGridLines: (visible): void => {
      assign(raw, 'showGridLines', visible);
    },
  };
}
