/**
 * Tests for Hat ID Prediction Utilities
 */

import {
  predictChildHatId,
  predictAdminHatId,
  isValidHatId,
  getHatDepth,
  formatHatIdDebug,
} from './hatIdPrediction';

describe('Hat ID Prediction', () => {
  describe('predictChildHatId', () => {
    it('should predict first child correctly', () => {
      // Example: Management hat at level 2
      const parentId = BigInt(
        '0x0001000200000000000000000000000000000000000000000000000000000000',
      );
      const expectedChild = BigInt(
        '0x0001000200010000000000000000000000000000000000000000000000000000',
      );

      const result = predictChildHatId(parentId, 1);
      expect(result).toBe(expectedChild);
    });

    it('should predict second child correctly', () => {
      const parentId = BigInt(
        '0x0001000200000000000000000000000000000000000000000000000000000000',
      );
      const expectedChild = BigInt(
        '0x0001000200020000000000000000000000000000000000000000000000000000',
      );

      const result = predictChildHatId(parentId, 2);
      expect(result).toBe(expectedChild);
    });

    it('should predict child at deeper level', () => {
      // Parent at level 3
      const parentId = BigInt(
        '0x0001000200030000000000000000000000000000000000000000000000000000',
      );
      const expectedChild = BigInt(
        '0x0001000200030001000000000000000000000000000000000000000000000000',
      );

      const result = predictChildHatId(parentId, 1);
      expect(result).toBe(expectedChild);
    });

    it('should handle max child index (65535)', () => {
      const parentId = BigInt(
        '0x0001000200000000000000000000000000000000000000000000000000000000',
      );
      const maxChildIndex = 65535;

      const result = predictChildHatId(parentId, maxChildIndex);
      expect(result).toBeGreaterThan(parentId);
    });

    it('should throw error for invalid child index (0)', () => {
      const parentId = BigInt(
        '0x0001000200000000000000000000000000000000000000000000000000000000',
      );

      expect(() => {
        predictChildHatId(parentId, 0);
      }).toThrow('Child index must be between 1 and 65535');
    });

    it('should throw error for invalid child index (> 65535)', () => {
      const parentId = BigInt(
        '0x0001000200000000000000000000000000000000000000000000000000000000',
      );

      expect(() => {
        predictChildHatId(parentId, 65536);
      }).toThrow('Child index must be between 1 and 65535');
    });
  });

  describe('predictAdminHatId', () => {
    it('should predict admin hat as first child', () => {
      // Use properly formatted 16-level hat ID (3-level management hat)
      const managementId = BigInt(
        '0x0001000200030000000000000000000000000000000000000000000000000000',
      );
      const adminId = predictAdminHatId(managementId);

      // Admin hat should be greater than management hat
      expect(adminId).toBeGreaterThan(managementId);

      // Should be first child
      const manualPrediction = predictChildHatId(managementId, 1);
      expect(adminId).toBe(manualPrediction);
    });

    it('should work with different management hat IDs', () => {
      const managementIds = [
        BigInt(
          '0x0001000200000000000000000000000000000000000000000000000000000000',
        ),
        BigInt(
          '0x0005000300000000000000000000000000000000000000000000000000000000',
        ),
        BigInt(
          '0x0001000200030004000000000000000000000000000000000000000000000000',
        ), // 4-level hat
      ];

      managementIds.forEach((managementId) => {
        const adminId = predictAdminHatId(managementId);
        expect(adminId).toBeGreaterThan(managementId);
        expect(isValidHatId(adminId)).toBe(true);
      });
    });
  });

  describe('isValidHatId', () => {
    it('should validate correct hat IDs', () => {
      const validIds = [
        BigInt(
          '0x0001000000000000000000000000000000000000000000000000000000000000',
        ),
        BigInt(
          '0x0001000200000000000000000000000000000000000000000000000000000000',
        ),
        BigInt(
          '0x0001000200030004000000000000000000000000000000000000000000000000',
        ),
      ];

      validIds.forEach((id) => {
        expect(isValidHatId(id)).toBe(true);
      });
    });

    it('should reject invalid hat IDs', () => {
      const invalidIds = [
        BigInt(0), // Zero
        BigInt(-1), // Negative (will be converted to very large positive, but still invalid in context)
      ];

      // Zero should be invalid
      expect(isValidHatId(BigInt(0))).toBe(false);
    });

    it('should reject hat ID with all zeros', () => {
      const allZeros = BigInt(
        '0x0000000000000000000000000000000000000000000000000000000000000000',
      );
      expect(isValidHatId(allZeros)).toBe(false);
    });
  });

  describe('getHatDepth', () => {
    it('should return correct depth for single level', () => {
      const hatId = BigInt(
        '0x0001000000000000000000000000000000000000000000000000000000000000',
      );
      expect(getHatDepth(hatId)).toBe(0);
    });

    it('should return correct depth for two levels', () => {
      const hatId = BigInt(
        '0x0001000200000000000000000000000000000000000000000000000000000000',
      );
      expect(getHatDepth(hatId)).toBe(1);
    });

    it('should return correct depth for three levels', () => {
      const hatId = BigInt(
        '0x0001000200030000000000000000000000000000000000000000000000000000',
      );
      expect(getHatDepth(hatId)).toBe(2);
    });

    it('should return correct depth for deep hierarchy', () => {
      // Create a hat ID with 5 levels
      let hatId = BigInt(
        '0x0001000000000000000000000000000000000000000000000000000000000000',
      );
      hatId = hatId | (BigInt(2) << BigInt(16 * 14)); // Level 1
      hatId = hatId | (BigInt(3) << BigInt(16 * 13)); // Level 2
      hatId = hatId | (BigInt(4) << BigInt(16 * 12)); // Level 3
      hatId = hatId | (BigInt(5) << BigInt(16 * 11)); // Level 4

      expect(getHatDepth(hatId)).toBe(4);
    });
  });

  describe('formatHatIdDebug', () => {
    it('should format single level hat', () => {
      const hatId = BigInt(
        '0x0001000000000000000000000000000000000000000000000000000000000000',
      );
      const formatted = formatHatIdDebug(hatId);
      expect(formatted).toBe('Level 0: 1');
    });

    it('should format multi-level hat', () => {
      const hatId = BigInt(
        '0x0001000200030000000000000000000000000000000000000000000000000000',
      );
      const formatted = formatHatIdDebug(hatId);
      expect(formatted).toBe('Level 0: 1, Level 1: 2, Level 2: 3');
    });

    it('should handle zero hat ID', () => {
      const hatId = BigInt(0);
      const formatted = formatHatIdDebug(hatId);
      expect(formatted).toBe('Invalid hat ID');
    });
  });

  describe('Real-world scenarios', () => {
    it('should correctly predict for actual Hats Protocol hat IDs', () => {
      // Example of a typical 3-level management hat ID (similar to real Hats Protocol structure)
      const managementHatId = BigInt(
        '0x0001000200030000000000000000000000000000000000000000000000000000',
      );

      // Predict admin hat (first child)
      const adminHatId = predictAdminHatId(managementHatId);

      console.log('\n=== Real-world Hat ID Prediction ===');
      console.log('Management HAT ID:', managementHatId.toString());
      console.log(
        'Management HAT ID (hex):',
        '0x' + managementHatId.toString(16),
      );
      console.log('Predicted Admin HAT ID:', adminHatId.toString());
      console.log(
        'Predicted Admin HAT ID (hex):',
        '0x' + adminHatId.toString(16),
      );
      console.log('Management depth:', getHatDepth(managementHatId));
      console.log('Admin depth:', getHatDepth(adminHatId));
      console.log('Management structure:', formatHatIdDebug(managementHatId));
      console.log('Admin structure:', formatHatIdDebug(adminHatId));

      // Verify prediction
      expect(adminHatId).toBeGreaterThan(managementHatId);
      expect(isValidHatId(adminHatId)).toBe(true);
      expect(getHatDepth(adminHatId)).toBe(getHatDepth(managementHatId) + 1);
    });

    it('should match Hats Protocol createHat behavior', () => {
      // Simulate what Hats Protocol does when creating a child hat
      const parentHatId = BigInt(
        '0x0001000200000000000000000000000000000000000000000000000000000000',
      );

      // First child (index 1)
      const firstChild = predictChildHatId(parentHatId, 1);

      // Second child (index 2)
      const secondChild = predictChildHatId(parentHatId, 2);

      // Verify they're different
      expect(firstChild).not.toBe(secondChild);

      // Verify both are valid
      expect(isValidHatId(firstChild)).toBe(true);
      expect(isValidHatId(secondChild)).toBe(true);

      // Verify both are children of parent
      expect(firstChild).toBeGreaterThan(parentHatId);
      expect(secondChild).toBeGreaterThan(parentHatId);

      // Verify both have same depth (parent + 1)
      expect(getHatDepth(firstChild)).toBe(getHatDepth(parentHatId) + 1);
      expect(getHatDepth(secondChild)).toBe(getHatDepth(parentHatId) + 1);
    });
  });
});
