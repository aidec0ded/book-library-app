export const SEASONAL_NAMES: Record<string, string> = {
  "1-early": "Longest Nights",
  "1-mid": "Deep Winter",
  "1-late": "Deep Winter",
  "2-early": "Deep Winter",
  "2-mid": "Winter's End",
  "2-late": "Winter's End",
  "3-early": "First Thaw",
  "3-mid": "First Thaw",
  "3-late": "Spring Awakening",
  "4-early": "Spring Awakening",
  "4-mid": "April Showers",
  "4-late": "Full Bloom",
  "5-early": "Full Bloom",
  "5-mid": "Late Spring",
  "5-late": "Almost Summer",
  "6-early": "Early Summer",
  "6-mid": "Longest Days",
  "6-late": "Midsummer",
  "7-early": "High Summer",
  "7-mid": "Dog Days",
  "7-late": "Dog Days",
  "8-early": "Dog Days",
  "8-mid": "Summer's End",
  "8-late": "Summer's End",
  "9-early": "Early Autumn",
  "9-mid": "Harvest Moon",
  "9-late": "Harvest Moon",
  "10-early": "Golden Autumn",
  "10-mid": "October Dusk",
  "10-late": "Hallow's Eve",
  "11-early": "All Souls",
  "11-mid": "November Grey",
  "11-late": "First Frost",
  "12-early": "Advent",
  "12-mid": "Winter Solstice",
  "12-late": "Longest Nights",
};

export const SEASONAL_FALLBACKS: Record<number, string> = {
  1: "Deep Winter",
  2: "Winter's End",
  3: "First Thaw",
  4: "Spring Awakening",
  5: "Late Spring",
  6: "Midsummer",
  7: "High Summer",
  8: "Dog Days",
  9: "Harvest Moon",
  10: "October Dusk",
  11: "November Grey",
  12: "Winter Solstice",
};

export function getSeasonalName(
  month: number,
  position?: string | null,
): string {
  if (position) {
    return (
      SEASONAL_NAMES[`${month}-${position}`] ?? SEASONAL_FALLBACKS[month]
    );
  }
  return SEASONAL_FALLBACKS[month];
}
