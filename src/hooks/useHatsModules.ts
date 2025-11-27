'use client';

import { useState, useEffect, useCallback, } from 'react';
import { usePublicClient, useWalletClient, useAccount } from 'wagmi';
import { type HatsModulesService, getHatsModulesService, type PodCreationConfig, type ModuleInstance } from '../services/hatsModulesService';
import { useToast } from '../components/ui/use-toast';

interface UseHatsModulesReturn {
  service: HatsModulesService | null;
  isInitialized: boolean;
  isInitializing: boolean;
  error: string | null;
  availableModules: any[];
  
  // Pod creation methods
  createModularPod: (config: PodCreationConfig) => Promise<{
    podId: string;
    managementHat: string;
    membershipHat: string;
    modules: ModuleInstance[];
  }>;
  
  // Module management methods
  isModuleDeployed: (moduleId: string, hatId: string, immutableArgs: any) => Promise<boolean>;
  getInstanceParameters: (moduleId: string, instanceAddress: string) => Promise<any>;
  callInstanceWriteFunction: (
    moduleId: string,
    instanceAddress: string,
    functionName: string,
    functionArgs: any[]
  ) => Promise<any>;
  
  // Utility methods
  checkHatBalance: (address: string, hatId: string) => Promise<number>;
  refreshModules: () => Promise<void>;
}

/**
 * Custom hook for managing HATS Protocol modules integration
 * Provides easy access to module creation, management, and interaction
 */
export const useHatsModules = (): UseHatsModulesReturn => {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { toast } = useToast();

  const [service, setService] = useState<HatsModulesService | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableModules, setAvailableModules] = useState<any[]>([]);

  // Initialize the service when clients are available
  useEffect(() => {
    const initializeService = async () => {
      if (!publicClient || !walletClient || isInitializing || isInitialized) {
        return;
      }

      try {
        setIsInitializing(true);
        setError(null);
        
        console.log('🎩 Initializing HATS Modules hook...');
        
        const hatsService = getHatsModulesService(publicClient, walletClient);
        await hatsService.initialize();
        
        const modules = await hatsService.getAvailableModules();
        
        setService(hatsService);
        setAvailableModules(modules);
        setIsInitialized(true);
        
        console.log('✅ HATS Modules hook initialized successfully');
        
        toast({
          title: "HATS Modules Ready",
          description: `Loaded ${modules.length} available modules`,
        });

      } catch (error) {
        console.error('❌ Failed to initialize HATS Modules hook:', error);
        setError(error instanceof Error ? error.message : 'Failed to initialize HATS Modules');
        
        toast({
          title: "HATS Modules Error",
          description: "Failed to initialize modules. Some features may not work.",
          variant: "destructive"
        });
      } finally {
        setIsInitializing(false);
      }
    };

    initializeService();
  }, [publicClient, walletClient, isInitializing, isInitialized, toast]);

  // Create modular pod
  const createModularPod = useCallback(async (config: PodCreationConfig) => {
    if (!service || !isInitialized) {
      throw new Error('HATS Modules service not initialized');
    }

    try {
      console.log('🏗️ Creating modular pod via hook:', config.name);
      
      const result = await service.createModularPod(config);
      
      toast({
        title: "Pod Created Successfully",
        description: `"${config.name}" pod created with ${result.modules.length} modules`,
      });

      return result;

    } catch (error) {
      console.error('❌ Failed to create modular pod:', error);
      const message = error instanceof Error ? error.message : 'Failed to create pod';
      
      toast({
        title: "Pod Creation Failed",
        description: message,
        variant: "destructive"
      });
      
      throw error;
    }
  }, [service, isInitialized, toast]);

  // Check if module is deployed
  const isModuleDeployed = useCallback(async (
    moduleId: string, 
    hatId: string, 
    immutableArgs: any
  ): Promise<boolean> => {
    if (!service || !isInitialized) {
      throw new Error('HATS Modules service not initialized');
    }

    return await service.isModuleDeployed(moduleId, hatId, immutableArgs);
  }, [service, isInitialized]);

  // Get instance parameters
  const getInstanceParameters = useCallback(async (
    moduleId: string, 
    instanceAddress: string
  ): Promise<any> => {
    if (!service || !isInitialized) {
      throw new Error('HATS Modules service not initialized');
    }

    return await service.getInstanceParameters(moduleId, instanceAddress);
  }, [service, isInitialized]);

  // Call instance write function
  const callInstanceWriteFunction = useCallback(async (
    moduleId: string,
    instanceAddress: string,
    functionName: string,
    functionArgs: any[]
  ): Promise<any> => {
    if (!service || !isInitialized) {
      throw new Error('HATS Modules service not initialized');
    }

    try {
      const result = await service.callInstanceWriteFunction(
        moduleId,
        instanceAddress,
        functionName,
        functionArgs
      );

      toast({
        title: "Module Function Called",
        description: `Successfully called ${functionName} on module instance`,
      });

      return result;

    } catch (error) {
      console.error('❌ Failed to call module function:', error);
      const message = error instanceof Error ? error.message : 'Failed to call function';
      
      toast({
        title: "Module Call Failed",
        description: message,
        variant: "destructive"
      });
      
      throw error;
    }
  }, [service, isInitialized, toast]);

  // Check HAT balance (utility function)
  const checkHatBalance = useCallback(async (
    userAddress: string, 
    hatId: string
  ): Promise<number> => {
    if (!publicClient) {
      throw new Error('Public client not available');
    }

    try {
      const balance = await publicClient.readContract({
        address: process.env.NEXT_PUBLIC_HATS_CONTRACT as `0x${string}`,
        abi: [
          {
            name: 'balanceOf',
            type: 'function',
            inputs: [
              { name: 'account', type: 'address' },
              { name: 'hatId', type: 'uint256' }
            ],
            outputs: [{ name: '', type: 'uint256' }],
            stateMutability: 'view'
          }
        ],
        functionName: 'balanceOf',
        args: [userAddress as `0x${string}`, BigInt(hatId)]
      });

      return Number(balance);

    } catch (error) {
      console.error('❌ Failed to check HAT balance:', error);
      return 0;
    }
  }, [publicClient]);

  // Refresh available modules
  const refreshModules = useCallback(async () => {
    if (!service || !isInitialized) {
      return;
    }

    try {
      const modules = await service.getAvailableModules();
      setAvailableModules(modules);
      
      toast({
        title: "Modules Refreshed",
        description: `Updated ${modules.length} available modules`,
      });

    } catch (error) {
      console.error('❌ Failed to refresh modules:', error);
      
      toast({
        title: "Refresh Failed",
        description: "Failed to refresh available modules",
        variant: "destructive"
      });
    }
  }, [service, isInitialized, toast]);

  return {
    service,
    isInitialized,
    isInitializing,
    error,
    availableModules,
    
    // Methods
    createModularPod,
    isModuleDeployed,
    getInstanceParameters,
    callInstanceWriteFunction,
    
    // Utilities
    checkHatBalance,
    refreshModules,
  };
};

export default useHatsModules;