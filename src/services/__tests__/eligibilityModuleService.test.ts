import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EligibilityModuleService } from '../eligibilityModuleService';

// Mock viem
vi.mock('viem', () => ({
  createPublicClient: vi.fn(() => ({
    readContract: vi.fn(),
  })),
  parseAbi: vi.fn(),
  http: vi.fn(),
}));

describe('EligibilityModuleService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('validateTimeRange', () => {
    it('should accept valid time ranges', () => {
      const now = new Date();
      const validFrom = new Date(now.getTime() + 24 * 60 * 60 * 1000); // Tomorrow
      const validUntil = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // Next week

      const result = EligibilityModuleService.validateTimeRange(
        validFrom,
        validUntil,
      );

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject invalid time ranges (from > until)', () => {
      const validFrom = new Date('2024-12-31');
      const validUntil = new Date('2024-01-01');

      const result = EligibilityModuleService.validateTimeRange(
        validFrom,
        validUntil,
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain(
        'Valid from date must be before valid until date',
      );
    });

    it('should reject past dates for validFrom', () => {
      const validFrom = new Date('2020-01-01'); // Past date
      const validUntil = new Date('2024-12-31');

      const result = EligibilityModuleService.validateTimeRange(
        validFrom,
        validUntil,
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Valid from date cannot be in the past');
    });

    it('should accept null values (no restrictions)', () => {
      const now = new Date();
      const futureDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // Next week

      const result1 = EligibilityModuleService.validateTimeRange(null, null);
      const result2 = EligibilityModuleService.validateTimeRange(
        futureDate,
        null,
      );
      const result3 = EligibilityModuleService.validateTimeRange(
        null,
        futureDate,
      );

      expect(result1.valid).toBe(true);
      expect(result2.valid).toBe(true);
      expect(result3.valid).toBe(true);
    });
  });

  describe('formatTimeCriterion', () => {
    it('should format complete time ranges', () => {
      const validFrom = new Date('2024-01-01');
      const validUntil = new Date('2024-01-31');

      const result = EligibilityModuleService.formatTimeCriterion(
        validFrom,
        validUntil,
      );

      expect(result).toContain('1/1/2024');
      expect(result).toContain('1/31/2024');
      expect(result).toContain('30 days'); // Should calculate duration
    });

    it('should handle partial time ranges', () => {
      const validFrom = new Date('2024-01-01');

      const result = EligibilityModuleService.formatTimeCriterion(
        validFrom,
        null,
      );

      expect(result).toContain('From: 1/1/2024');
      expect(result).toContain('Until: No end date');
    });

    it('should handle no restrictions', () => {
      const result = EligibilityModuleService.formatTimeCriterion(null, null);

      expect(result).toBe('No time restrictions');
    });
  });

  describe('generateTimeCriterionHash', () => {
    it('should generate consistent hashes for same inputs', () => {
      const validFrom = new Date('2024-01-01');
      const validUntil = new Date('2024-12-31');

      const hash1 = EligibilityModuleService.generateTimeCriterionHash(
        validFrom,
        validUntil,
      );
      const hash2 = EligibilityModuleService.generateTimeCriterionHash(
        validFrom,
        validUntil,
      );

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^0x[a-fA-F0-9]{64}$/); // Valid hex hash
    });

    it('should generate different hashes for different inputs', () => {
      const validFrom1 = new Date('2024-01-01');
      const validUntil1 = new Date('2024-12-31');
      const validFrom2 = new Date('2024-02-01');
      const validUntil2 = new Date('2024-11-30');

      const hash1 = EligibilityModuleService.generateTimeCriterionHash(
        validFrom1,
        validUntil1,
      );
      const hash2 = EligibilityModuleService.generateTimeCriterionHash(
        validFrom2,
        validUntil2,
      );

      expect(hash1).not.toBe(hash2);
    });
  });
});
