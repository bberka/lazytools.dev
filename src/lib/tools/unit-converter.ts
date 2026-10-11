/**
 * Unit conversion for the Unit Converter: the catalogue of categories and
 * units, and the conversion from the text of the value field to the text of
 * the result.
 */

import { formatNumber, readNumber, type NumberStyle } from '@/lib/tools/calculator-numbers';

export type UnitCategoryId =
  | 'length'
  | 'weight'
  | 'temperature'
  | 'area'
  | 'volume'
  | 'speed'
  | 'time'
  | 'data';

export interface Unit {
  id: string;
  label: string;
  symbol: string;
}

export interface UnitCategory {
  id: UnitCategoryId;
  label: string;
  baseLabel: string;
  units: readonly Unit[];
}

// A unit is either a multiple of the category's base unit (`toBase`) or, for
// temperature scales that also shift the zero point, a pair of functions to
// and from Celsius.
type UnitDefinition = Unit & {
  toBase?: number;
  toCanonical?: (value: number) => number;
  fromCanonical?: (value: number) => number;
};

type CategoryDefinition = Omit<UnitCategory, 'units'> & {
  units: readonly UnitDefinition[];
};

const CATEGORY_DEFINITIONS: readonly CategoryDefinition[] = [
  {
    id: 'length',
    label: 'Length',
    baseLabel: 'meter',
    units: [
      { id: 'millimeter', label: 'Millimeter', symbol: 'mm', toBase: 0.001 },
      { id: 'centimeter', label: 'Centimeter', symbol: 'cm', toBase: 0.01 },
      { id: 'meter', label: 'Meter', symbol: 'm', toBase: 1 },
      { id: 'kilometer', label: 'Kilometer', symbol: 'km', toBase: 1000 },
      { id: 'inch', label: 'Inch', symbol: 'in', toBase: 0.0254 },
      { id: 'foot', label: 'Foot', symbol: 'ft', toBase: 0.3048 },
      { id: 'yard', label: 'Yard', symbol: 'yd', toBase: 0.9144 },
      { id: 'mile', label: 'Mile', symbol: 'mi', toBase: 1609.344 },
    ],
  },
  {
    id: 'weight',
    label: 'Weight',
    baseLabel: 'kilogram',
    units: [
      { id: 'milligram', label: 'Milligram', symbol: 'mg', toBase: 0.000001 },
      { id: 'gram', label: 'Gram', symbol: 'g', toBase: 0.001 },
      { id: 'kilogram', label: 'Kilogram', symbol: 'kg', toBase: 1 },
      { id: 'metric-ton', label: 'Metric Ton', symbol: 't', toBase: 1000 },
      { id: 'ounce', label: 'Ounce', symbol: 'oz', toBase: 0.028349523125 },
      { id: 'pound', label: 'Pound', symbol: 'lb', toBase: 0.45359237 },
      { id: 'stone', label: 'Stone', symbol: 'st', toBase: 6.35029318 },
    ],
  },
  {
    id: 'temperature',
    label: 'Temperature',
    baseLabel: 'celsius',
    units: [
      {
        id: 'celsius',
        label: 'Celsius',
        symbol: '°C',
        toCanonical: (value) => value,
        fromCanonical: (value) => value,
      },
      {
        id: 'fahrenheit',
        label: 'Fahrenheit',
        symbol: '°F',
        toCanonical: (value) => ((value - 32) * 5) / 9,
        fromCanonical: (value) => (value * 9) / 5 + 32,
      },
      {
        id: 'kelvin',
        label: 'Kelvin',
        symbol: 'K',
        toCanonical: (value) => value - 273.15,
        fromCanonical: (value) => value + 273.15,
      },
    ],
  },
  {
    id: 'area',
    label: 'Area',
    baseLabel: 'square meter',
    units: [
      { id: 'square-meter', label: 'Square Meter', symbol: 'm²', toBase: 1 },
      { id: 'square-kilometer', label: 'Square Kilometer', symbol: 'km²', toBase: 1_000_000 },
      { id: 'square-foot', label: 'Square Foot', symbol: 'ft²', toBase: 0.09290304 },
      { id: 'square-yard', label: 'Square Yard', symbol: 'yd²', toBase: 0.83612736 },
      { id: 'acre', label: 'Acre', symbol: 'ac', toBase: 4046.8564224 },
      { id: 'hectare', label: 'Hectare', symbol: 'ha', toBase: 10_000 },
    ],
  },
  {
    id: 'volume',
    label: 'Volume',
    baseLabel: 'liter',
    units: [
      { id: 'milliliter', label: 'Milliliter', symbol: 'mL', toBase: 0.001 },
      { id: 'liter', label: 'Liter', symbol: 'L', toBase: 1 },
      { id: 'cubic-meter', label: 'Cubic Meter', symbol: 'm³', toBase: 1000 },
      { id: 'teaspoon', label: 'Teaspoon', symbol: 'tsp', toBase: 0.00492892159375 },
      { id: 'tablespoon', label: 'Tablespoon', symbol: 'tbsp', toBase: 0.01478676478125 },
      { id: 'cup', label: 'Cup', symbol: 'cup', toBase: 0.2365882365 },
      { id: 'pint', label: 'Pint', symbol: 'pt', toBase: 0.473176473 },
      { id: 'gallon', label: 'Gallon', symbol: 'gal', toBase: 3.785411784 },
    ],
  },
  {
    id: 'speed',
    label: 'Speed',
    baseLabel: 'meter per second',
    units: [
      { id: 'meter-per-second', label: 'Meter / Second', symbol: 'm/s', toBase: 1 },
      { id: 'kilometer-per-hour', label: 'Kilometer / Hour', symbol: 'km/h', toBase: 0.2777777777777778 },
      { id: 'mile-per-hour', label: 'Mile / Hour', symbol: 'mph', toBase: 0.44704 },
      { id: 'foot-per-second', label: 'Foot / Second', symbol: 'ft/s', toBase: 0.3048 },
      { id: 'knot', label: 'Knot', symbol: 'kn', toBase: 0.5144444444444445 },
    ],
  },
  {
    id: 'time',
    label: 'Time',
    baseLabel: 'second',
    units: [
      { id: 'millisecond', label: 'Millisecond', symbol: 'ms', toBase: 0.001 },
      { id: 'second', label: 'Second', symbol: 's', toBase: 1 },
      { id: 'minute', label: 'Minute', symbol: 'min', toBase: 60 },
      { id: 'hour', label: 'Hour', symbol: 'h', toBase: 3600 },
      { id: 'day', label: 'Day', symbol: 'd', toBase: 86400 },
      { id: 'week', label: 'Week', symbol: 'wk', toBase: 604800 },
    ],
  },
  {
    id: 'data',
    label: 'Data',
    baseLabel: 'byte',
    units: [
      { id: 'byte', label: 'Byte', symbol: 'B', toBase: 1 },
      { id: 'kilobyte', label: 'Kilobyte', symbol: 'KB', toBase: 1000 },
      { id: 'megabyte', label: 'Megabyte', symbol: 'MB', toBase: 1000 * 1000 },
      { id: 'gigabyte', label: 'Gigabyte', symbol: 'GB', toBase: 1000 * 1000 * 1000 },
      { id: 'terabyte', label: 'Terabyte', symbol: 'TB', toBase: 1000 * 1000 * 1000 * 1000 },
      { id: 'kibibyte', label: 'Kibibyte', symbol: 'KiB', toBase: 1024 },
      { id: 'mebibyte', label: 'Mebibyte', symbol: 'MiB', toBase: 1024 * 1024 },
      { id: 'gibibyte', label: 'Gibibyte', symbol: 'GiB', toBase: 1024 * 1024 * 1024 },
    ],
  },
];

/** Every category with its units, in display order. */
export const UNIT_CATEGORIES: readonly UnitCategory[] = CATEGORY_DEFINITIONS;

/** The category with this id; an unknown id falls back to the first one. */
export function getUnitCategory(id: string): UnitCategory {
  return UNIT_CATEGORIES.find((category) => category.id === id) ?? UNIT_CATEGORIES[0];
}

export interface UnitConversionRequest {
  categoryId: UnitCategoryId;
  /** The value field as typed. */
  value: string;
  fromUnitId: string;
  toUnitId: string;
}

export interface UnitConversion {
  /** The converted value with its unit symbol. Empty when there is none. */
  value: string;
  /** The conversion written out, or a prompt while the value field is empty. */
  detail: string;
  /** Why there is no result. Empty when there is one or the field is still empty. */
  error: string;
}

// Eight decimals for ordinary values. Scale factors span many orders of
// magnitude (a byte is 0.000000000001 TB), so a small result keeps six
// significant digits instead of rounding to 0.
const SCALED_STYLE: NumberStyle = { maxFractionDigits: 8, minSignificantDigits: 6 };

// Temperature scales shift the zero point, and that subtraction leaves
// floating-point noise where the answer is zero (-459.67 °F is 0 K), so a
// tiny result here is rounded away rather than kept.
const SHIFTED_STYLE: NumberStyle = { maxFractionDigits: 8 };

// The typed value is repeated as it was typed, up to the most fraction digits
// a number can be written with, so a long entry is not cut to eight decimals.
const TYPED_STYLE: NumberStyle = { maxFractionDigits: 20, minSignificantDigits: 6 };

const ABSOLUTE_ZERO_CELSIUS = -273.15;
// Slack for the rounding in converting to Celsius.
const ABSOLUTE_ZERO_TOLERANCE = 1e-9;

const failure = (error: string): UnitConversion => ({ value: '', detail: '', error });

/** Converts the typed value between two units of one category. */
export function convertUnits(request: UnitConversionRequest): UnitConversion {
  const category = CATEGORY_DEFINITIONS.find((item) => item.id === request.categoryId);
  const fromUnit = category?.units.find((unit) => unit.id === request.fromUnitId);
  const toUnit = category?.units.find((unit) => unit.id === request.toUnitId);
  const field = readNumber(request.value);

  if (field.kind === 'invalid') {
    return failure('Enter a plain number such as 1250 or 12.5.');
  }

  if (field.kind === 'empty' || !fromUnit || !toUnit) {
    return {
      value: '',
      detail: 'Enter a number and choose units to convert.',
      error: '',
    };
  }

  let converted: number;
  let style: NumberStyle;

  if (fromUnit.toCanonical && toUnit.fromCanonical) {
    const celsius = fromUnit.toCanonical(field.value);

    if (celsius < ABSOLUTE_ZERO_CELSIUS - ABSOLUTE_ZERO_TOLERANCE) {
      return failure('That is below absolute zero (-273.15 °C, -459.67 °F, 0 K).');
    }

    converted = toUnit.fromCanonical(celsius);
    style = SHIFTED_STYLE;
  } else {
    converted = (field.value * (fromUnit.toBase ?? 1)) / (toUnit.toBase ?? 1);
    style = SCALED_STYLE;
  }

  if (!Number.isFinite(converted)) {
    return failure('The result is too large to calculate.');
  }

  const result = `${formatNumber(converted, style)} ${toUnit.symbol}`;

  return {
    value: result,
    // The typed value carries no noise, so it is always repeated in full.
    detail: `${formatNumber(field.value, TYPED_STYLE)} ${fromUnit.symbol} = ${result}`,
    error: '',
  };
}
