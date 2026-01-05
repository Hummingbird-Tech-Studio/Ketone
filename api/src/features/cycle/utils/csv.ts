import { type FastingFeeling } from '@ketone/shared';
import { type CycleRecord } from '../repositories/schemas';

type CycleWithFeelings = CycleRecord & { feelings: FastingFeeling[] };

/**
 * Escape CSV field value
 * - Wrap in quotes if contains comma, quote, or newline
 * - Double any existing quotes
 */
const escapeCsvField = (value: string | null): string => {
  if (value === null) return '';
  const stringValue = String(value);
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
};

/**
 * Format date to ISO string for CSV
 */
const formatDate = (date: Date): string => date.toISOString();

/**
 * Generate CSV content from cycles
 */
export const generateCsvContent = (cycles: CycleWithFeelings[]): string => {
  // CSV headers
  const headers = ['id', 'status', 'startDate', 'endDate', 'notes', 'feelings', 'createdAt', 'updatedAt'];

  // Generate CSV rows
  const rows = cycles.map((cycle) => [
    cycle.id,
    cycle.status,
    formatDate(cycle.startDate),
    formatDate(cycle.endDate),
    escapeCsvField(cycle.notes),
    escapeCsvField(cycle.feelings.join(';')), // Semicolon-separated feelings
    formatDate(cycle.createdAt),
    formatDate(cycle.updatedAt),
  ]);

  // Combine headers and rows
  const csvLines = [headers.join(','), ...rows.map((row) => row.join(','))];

  return csvLines.join('\n');
};
