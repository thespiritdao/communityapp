// src/features/identity/utils/formatProfileValues.ts
export const mapStoredValuesToLabels = (
  csvString: string | null,
  options: { label: string; value: string }[]
): string[] => {
  if (!csvString) return [];
  const values = csvString.split(',').map((v) => v.trim());
  return values.map((value) => {
    const match = options.find((opt) => opt.value === value);
    return match ? match.label : value; // fallback to raw if no match
  });
};
