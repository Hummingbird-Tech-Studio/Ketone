import { ParseResult } from 'effect';
import type { ParseError } from 'effect/ParseResult';

/**
 * extractSchemaErrors
 *
 * Converts ParseError into a standardized Record<string, string[]> for UI display.
 * Each key is a dot-joined field path, each value is an array of error messages.
 * Uses Effect's built-in ArrayFormatter instead of manual AST traversal.
 */
export const extractSchemaErrors = (error: ParseError): Record<string, string[]> => {
  const issues = ParseResult.ArrayFormatter.formatErrorSync(error);
  const errors: Record<string, string[]> = {};
  for (const issue of issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '_general';
    if (!errors[key]) {
      errors[key] = [];
    }
    errors[key].push(issue.message);
  }
  return errors;
};
