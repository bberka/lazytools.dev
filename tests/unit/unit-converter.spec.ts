import { test, expect } from '@playwright/test';
import {
  UNIT_CATEGORIES,
  convertUnits,
  getUnitCategory,
  type UnitCategoryId,
} from '@/lib/tools/unit-converter';

const convert = (categoryId: UnitCategoryId, value: string, fromUnitId: string, toUnitId: string) =>
  convertUnits({ categoryId, value, fromUnitId, toUnitId });

test.describe('unit catalogue', () => {
  test('lists the eight categories in display order', () => {
    expect(UNIT_CATEGORIES.map((category) => category.id)).toEqual([
      'length',
      'weight',
      'temperature',
      'area',
      'volume',
      'speed',
      'time',
      'data',
    ]);
  });

  test('gives every category at least two units with unique ids', () => {
    for (const category of UNIT_CATEGORIES) {
      const ids = category.units.map((unit) => unit.id);

      expect(ids.length, category.id).toBeGreaterThanOrEqual(2);
      expect(new Set(ids).size, category.id).toBe(ids.length);
    }
  });

  test('looks a category up by id and falls back to the first one', () => {
    expect(getUnitCategory('data').baseLabel).toBe('byte');
    expect(getUnitCategory('nope').id).toBe('length');
  });
});

test.describe('convertUnits', () => {
  test('converts length', () => {
    expect(convert('length', '1', 'meter', 'foot')).toEqual({
      value: '3.2808399 ft',
      detail: '1 m = 3.2808399 ft',
      error: '',
    });
    expect(convert('length', '1', 'mile', 'kilometer').value).toBe('1.609344 km');
    expect(convert('length', '36', 'inch', 'yard').value).toBe('1 yd');
  });

  test('converts weight, area, volume, speed, time and data', () => {
    expect(convert('weight', '1', 'pound', 'kilogram').value).toBe('0.45359237 kg');
    expect(convert('area', '1', 'hectare', 'square-meter').value).toBe('10,000 m²');
    expect(convert('volume', '1', 'gallon', 'liter').value).toBe('3.78541178 L');
    expect(convert('speed', '100', 'kilometer-per-hour', 'mile-per-hour').value).toBe(
      '62.13711922 mph'
    );
    expect(convert('time', '1', 'week', 'hour').value).toBe('168 h');
    expect(convert('data', '1', 'gigabyte', 'mebibyte').value).toBe('953.67431641 MiB');
    expect(convert('data', '1', 'kibibyte', 'byte').value).toBe('1,024 B');
  });

  test('converts temperature in every direction', () => {
    expect(convert('temperature', '100', 'celsius', 'fahrenheit').value).toBe('212 °F');
    expect(convert('temperature', '32', 'fahrenheit', 'celsius').value).toBe('0 °C');
    expect(convert('temperature', '98.6', 'fahrenheit', 'celsius').value).toBe('37 °C');
    expect(convert('temperature', '-40', 'celsius', 'fahrenheit').value).toBe('-40 °F');
    expect(convert('temperature', '0', 'celsius', 'kelvin').value).toBe('273.15 K');
    expect(convert('temperature', '300', 'kelvin', 'fahrenheit').value).toBe('80.33 °F');
  });

  test('gives the value back when both units are the same', () => {
    expect(convert('length', '12.5', 'meter', 'meter').value).toBe('12.5 m');
  });

  test('converts negative values outside temperature', () => {
    expect(convert('length', '-2', 'kilometer', 'meter').value).toBe('-2,000 m');
  });

  test('reads thousands separators', () => {
    expect(convert('length', '1,500', 'meter', 'kilometer')).toEqual({
      value: '1.5 km',
      detail: '1,500 m = 1.5 km',
      error: '',
    });
  });

  test('prompts while the value is empty or a unit is unknown', () => {
    const prompt = { value: '', detail: 'Enter a number and choose units to convert.', error: '' };

    expect(convert('length', '', 'meter', 'foot')).toEqual(prompt);
    expect(convert('length', '  ', 'meter', 'foot')).toEqual(prompt);
    expect(convert('length', '-', 'meter', 'foot')).toEqual(prompt);
    // A unit of another category, as between a category change and its units.
    expect(convert('length', '1', 'meter', 'kelvin')).toEqual(prompt);
  });

  test('reports text that is not a number', () => {
    const invalid = {
      value: '',
      detail: '',
      error: 'Enter a plain number such as 1250 or 12.5.',
    };

    expect(convert('length', 'abc', 'meter', 'foot')).toEqual(invalid);
    expect(convert('length', '1 m', 'meter', 'foot')).toEqual(invalid);
  });

  // "1,5" used to be read as 15, giving 1,500 cm here.
  test('reads a decimal comma as a decimal', () => {
    expect(convert('length', '1,5', 'meter', 'centimeter')).toEqual({
      value: '150 cm',
      detail: '1.5 m = 150 cm',
      error: '',
    });
  });

  // Results were cut to eight decimals, so anything below 0.000000005 of the
  // target unit showed as "0".
  test('keeps a small result instead of rounding it to zero', () => {
    expect(convert('data', '1', 'byte', 'terabyte')).toEqual({
      value: '0.000000000001 TB',
      detail: '1 B = 0.000000000001 TB',
      error: '',
    });
    expect(convert('weight', '1', 'milligram', 'metric-ton').value).toBe('0.000000001 t');
    expect(convert('time', '1', 'millisecond', 'week').value).toBe('0.00000000165344 wk');
    // Two significant digits before ("0.00000062"), six now.
    expect(convert('length', '1', 'millimeter', 'mile').value).toBe('0.000000621371 mi');
  });

  test('leaves results that eight decimals already cover as they were', () => {
    expect(convert('length', '1', 'inch', 'foot').value).toBe('0.08333333 ft');
    expect(convert('length', '1', 'millimeter', 'kilometer').value).toBe('0.000001 km');
    expect(convert('weight', '1', 'ounce', 'kilogram').value).toBe('0.02834952 kg');
  });

  test('repeats a small typed value in full', () => {
    expect(convert('length', '0.000000001', 'kilometer', 'millimeter').detail).toBe(
      '0.000000001 km = 0.001 mm'
    );
  });

  // "-0" was echoed and converted as "-0".
  test('never shows a signed zero', () => {
    expect(convert('length', '-0', 'meter', 'foot')).toEqual({
      value: '0 ft',
      detail: '0 m = 0 ft',
      error: '',
    });
  });

  // -300 °C used to convert to -26.85 K.
  test('refuses temperatures below absolute zero', () => {
    const tooCold = {
      value: '',
      detail: '',
      error: 'That is below absolute zero (-273.15 °C, -459.67 °F, 0 K).',
    };

    expect(convert('temperature', '-300', 'celsius', 'kelvin')).toEqual(tooCold);
    expect(convert('temperature', '-500', 'fahrenheit', 'celsius')).toEqual(tooCold);
    expect(convert('temperature', '-1', 'kelvin', 'celsius')).toEqual(tooCold);
  });

  test('accepts absolute zero itself on every scale', () => {
    expect(convert('temperature', '0', 'kelvin', 'celsius').value).toBe('-273.15 °C');
    expect(convert('temperature', '0', 'kelvin', 'fahrenheit').value).toBe('-459.67 °F');
    expect(convert('temperature', '-273.15', 'celsius', 'kelvin').value).toBe('0 K');
    // The round trip through Celsius leaves -5.7e-14 K, which is zero.
    expect(convert('temperature', '-459.67', 'fahrenheit', 'kelvin').value).toBe('0 K');
  });

  test('writes a very large result in exponent form', () => {
    expect(convert('length', '1e30', 'meter', 'kilometer').value).toBe('1e+27 km');
  });

  test('reports a result too large to calculate', () => {
    expect(convert('length', '1e308', 'kilometer', 'millimeter')).toEqual({
      value: '',
      detail: '',
      error: 'The result is too large to calculate.',
    });
  });
});
