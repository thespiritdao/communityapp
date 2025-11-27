import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { HatsCoreService, getHatsCoreService } from './hatsCoreService';

// Mock the Hats SDK modules
vi.mock('@hatsprotocol/sdk-v1-core', () => ({
  HatsClient: vi.fn().mockImplementation(() => ({
    createHat: vi.fn(),
    isWearerOfHat: vi.fn(),
    isActive: vi.fn(),
  })),
}));

vi.mock('@hatsprotocol/sdk-v1-subgraph', () => ({
  HatsSubgraphClient: vi.fn().mockImplementation(() => ({
    getHat: vi.fn(),
    getWearer: vi.fn(),
    getTree: vi.fn(),
  })),
}));

describe('HatsCoreService', () => {
  let publicClient: any;
  let service: HatsCoreService;

  beforeEach(() => {
    publicClient = createPublicClient({
      chain: base,
      transport: http(),
    });

    service = getHatsCoreService(publicClient);
  });

  it('should create service instance', () => {
    expect(service).toBeInstanceOf(HatsCoreService);
  });

  it('should initialize without errors', async () => {
    await expect(service.initialize()).resolves.not.toThrow();
  });

  it('should generate hat image URL correctly', () => {
    const imageUrl = service.generateHatImageUrl('Test Pod', true);
    expect(imageUrl).toContain('Test%20Pod');
    expect(imageUrl).toContain('background=bfe7c6'); // Management hat color
  });

  it('should calculate hat levels', () => {
    const level = service.getHatLevel('123456789');
    expect(level).toBe(1); // Default level for now
  });

  it('should calculate admin hat ID', () => {
    const adminId = service.getAdminHatId('100');
    expect(adminId).toBe('99'); // baseId - 1
  });

  it('should calculate next child hat ID', () => {
    const nextId = service.getNextChildHatId('100');
    expect(nextId).toBe('101'); // baseId + 1
  });
});
