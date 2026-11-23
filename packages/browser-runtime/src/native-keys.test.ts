import { describe, expect, it } from 'vitest';

import { browserKeys } from './native-keys.js';
describe('native browser keyboard translation', () => {
  it('supports letter selection, ordinary shortcuts and exact key casing', () => {
    expect(browserKeys(['b'])).toEqual(['b']);
    expect(browserKeys(['CTRL', 'B'])).toEqual(['Control', 'B']);
    expect(browserKeys(['SHIFT', 'TAB'])).toEqual(['Shift', 'Tab']);
    expect(browserKeys(['Control', 'HOME'])).toEqual(['Control', 'Home']);
    expect(browserKeys(['Alt', 'ARROWDOWN'])).toEqual(['Alt', 'ArrowDown']);
    expect(browserKeys(['CMD', 'a'])).toEqual(['Meta', 'a']);
    expect(browserKeys(['9', '@', 'KeyZ', 'F12'])).toEqual(['9', '@', 'KeyZ', 'F12']);
  });
  it('rejects names the browser driver cannot represent', () => {
    expect(() => browserKeys(['invented-key'])).toThrow('Unsupported browser key');
  });
});
