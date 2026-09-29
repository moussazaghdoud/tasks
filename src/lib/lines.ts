/**
 * A thought can hold line breaks ("new line" when dictating). Places that take
 * one line only — an email subject, a calendar event's title — get the first,
 * and the rest goes where the details go.
 */
export const firstLine = (text: string): string => text.split('\n')[0].trim();

export const afterFirstLine = (text: string): string => text.split('\n').slice(1).join('\n').trim();
