import { describe, it, expect } from 'vitest';
import {
  formatDate,
  formatNumber,
  formatStatus,
  truncateText,
  getInitials,
} from './formatters';

describe('formatters', () => {
  describe('formatDate', () => {
    it('should format a date without time', () => {
      const date = new Date('2024-03-15');
      const result = formatDate(date);
      expect(result).toContain('Mar');
      expect(result).toContain('15');
      expect(result).toContain('2024');
    });

    it('should format a date with time', () => {
      const date = new Date('2024-03-15T10:30:00');
      const result = formatDate(date, true);
      expect(result).toContain('10:30');
    });
  });

  describe('formatNumber', () => {
    it('should format number with thousand separators', () => {
      expect(formatNumber(1000)).toBe('1,000');
      expect(formatNumber(1000000)).toBe('10,00,000');
    });
  });

  describe('formatStatus', () => {
    it('should capitalize status', () => {
      expect(formatStatus('pending')).toBe('Pending');
      expect(formatStatus('in-progress')).toBe('In Progress');
    });
  });

  describe('truncateText', () => {
    it('should truncate long text', () => {
      const text = 'This is a very long text that needs to be truncated';
      expect(truncateText(text, 20)).toBe('This is a very long ...');
    });

    it('should not truncate short text', () => {
      const text = 'Short text';
      expect(truncateText(text, 20)).toBe('Short text');
    });
  });

  describe('getInitials', () => {
    it('should get initials from name', () => {
      expect(getInitials('John Doe')).toBe('JD');
      expect(getInitials('Alice Bob Charlie')).toBe('AB');
    });
  });
});
