import { describe, expect, it } from "vitest";
import {
  MAX_CHART_POINTS,
  MAX_CHART_SERIES,
  MAX_FORM_FIELDS,
  MAX_TABLE_COLUMNS,
  MAX_TABLE_ROWS,
} from "./limits";
import { clampToLimit } from "./presentation-limits";

describe("clampToLimit", () => {
  it("truncates table rows and columns to presentation maxima", () => {
    const rows = Array.from({ length: MAX_TABLE_ROWS + 5 }, (_, index) => ({ id: index }));
    const columns = Array.from({ length: MAX_TABLE_COLUMNS + 3 }, (_, index) => `col_${index}`);
    expect(clampToLimit(rows, MAX_TABLE_ROWS)).toHaveLength(MAX_TABLE_ROWS);
    expect(clampToLimit(columns, MAX_TABLE_COLUMNS)).toHaveLength(MAX_TABLE_COLUMNS);
    expect(clampToLimit(rows, MAX_TABLE_ROWS)[0]).toEqual({ id: 0 });
  });

  it("truncates chart series and points", () => {
    const series = Array.from({ length: MAX_CHART_SERIES + 2 }, (_, index) => ({
      key: `s${index}`,
      label: `Series ${index}`,
    }));
    const points = Array.from({ length: MAX_CHART_POINTS + 10 }, (_, index) => ({ x: index }));
    expect(clampToLimit(series, MAX_CHART_SERIES)).toHaveLength(MAX_CHART_SERIES);
    expect(clampToLimit(points, MAX_CHART_POINTS)).toHaveLength(MAX_CHART_POINTS);
  });

  it("truncates form fields to the presentation max", () => {
    const fields = Array.from({ length: MAX_FORM_FIELDS + 4 }, (_, index) => ({ id: `f${index}` }));
    expect(clampToLimit(fields, MAX_FORM_FIELDS)).toHaveLength(MAX_FORM_FIELDS);
  });

  it("returns an empty array when input is empty", () => {
    expect(clampToLimit([], MAX_TABLE_ROWS)).toEqual([]);
  });

  it("does not mutate the source array", () => {
    const source = [1, 2, 3, 4, 5];
    const clamped = clampToLimit(source, 2);
    expect(clamped).toEqual([1, 2]);
    expect(source).toEqual([1, 2, 3, 4, 5]);
  });
});
