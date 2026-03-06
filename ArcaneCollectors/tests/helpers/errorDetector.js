/**
 * errorDetector.js
 * Utility for detecting error patterns in logs
 * QAT-LOG-1 helper
 */

export const ERROR_PATTERNS = [
  /TypeError/i,
  /ReferenceError/i,
  /NaN/,
  /undefined is not/i,
  /null is not/i,
  /Cannot read properties of/i,
  /Cannot read property/i,
  /is not a function/i,
  /is not defined/i,
  /Unexpected token/i,
  /SyntaxError/i,
  /RangeError/i,
  /Maximum call stack/i,
];

/**
 * Scan log entries for known error patterns
 * @param {Array} logEntries - Array of log entry objects
 * @returns {Array} - Array of detected errors
 */
export function detectErrorPatterns(logEntries) {
  const errors = [];

  logEntries.forEach((entry, index) => {
    const message = entry.message || '';
    const data = entry.data ? JSON.stringify(entry.data) : '';
    const fullText = `${message} ${data}`;

    ERROR_PATTERNS.forEach(pattern => {
      if (pattern.test(fullText)) {
        errors.push({
          index,
          pattern: pattern.source,
          entry,
          matchedText: fullText.match(pattern)?.[0]
        });
      }
    });
  });

  return errors;
}

/**
 * Assertion helper: throw if errors are found in logs
 * @param {Array} logEntries - Array of log entry objects
 * @throws {Error} - If error patterns are detected
 */
export function assertNoErrors(logEntries) {
  const errors = detectErrorPatterns(logEntries);

  if (errors.length > 0) {
    const errorMessages = errors.map(e =>
      `${e.pattern} at index ${e.index}: ${e.matchedText}`
    ).join('\n');

    throw new Error(`Error patterns detected in logs:\n${errorMessages}`);
  }
}

/**
 * Get summary of error patterns in logs
 * @param {Array} logEntries - Array of log entry objects
 * @returns {Object} - Summary object
 */
export function getErrorSummary(logEntries) {
  const errors = detectErrorPatterns(logEntries);
  const byPattern = {};

  errors.forEach(error => {
    if (!byPattern[error.pattern]) {
      byPattern[error.pattern] = 0;
    }
    byPattern[error.pattern]++;
  });

  return {
    totalErrors: errors.length,
    byPattern,
    errors
  };
}
