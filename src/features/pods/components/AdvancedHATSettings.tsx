'use client';

import type React from 'react';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Settings,
  Users,
  Shield,
  Key,
  Plus,
  Minus,
  Save,
  RefreshCw,
  AlertCircle,
  Info,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

interface HATSettings {
  hatId: string;
  details: string;
  maxSupply: number;
  eligibilityAddress: string;
  toggleAddress: string;
  mutable: boolean;
  authorities: HATAuthority[];
  responsibilities: string[];
  eligibilityRules: EligibilityRule[];
  customMetadata: Record<string, any>;
}

interface HATAuthority {
  id: string;
  title: string;
  description: string;
  contractAddress?: string;
  functionSelector?: string;
  enabled: boolean;
}

interface EligibilityRule {
  id: string;
  type: 'token_balance' | 'nft_ownership' | 'membership' | 'custom';
  description: string;
  parameters: Record<string, any>;
  enabled: boolean;
}

interface AdvancedHATSettingsProps {
  hatId: string;
  hatType: 'management' | 'membership';
  onSettingsUpdated: () => void;
  disabled?: boolean;
}

export const AdvancedHATSettings: React.FC<AdvancedHATSettingsProps> = ({
  hatId,
  hatType,
  onSettingsUpdated,
  disabled = false,
}) => {
  const [settings, setSettings] = useState<HATSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const { toast } = useToast();

  // Initialize settings
  useEffect(() => {
    loadHATSettings();
  }, [hatId]);

  const loadHATSettings = async () => {
    try {
      setLoading(true);

      // Fetch current HAT settings from contract
      const currentSettings = await fetchHATDetailsFromContract(hatId);

      setSettings({
        hatId,
        details: currentSettings?.details || '',
        maxSupply: currentSettings?.maxSupply || 0,
        eligibilityAddress:
          currentSettings?.eligibility ||
          '0x0000000000000000000000000000000000000001',
        toggleAddress:
          currentSettings?.toggle ||
          '0x0000000000000000000000000000000000000001',
        mutable: currentSettings?.mutable || true,
        authorities: getDefaultAuthorities(hatType),
        responsibilities: getDefaultResponsibilities(hatType),
        eligibilityRules: getDefaultEligibilityRules(hatType),
        customMetadata: currentSettings?.metadata || {},
      });
    } catch (error) {
      console.error('Failed to load HAT settings:', error);
      toast({
        title: 'Error Loading Settings',
        description: 'Failed to load HAT settings. Using defaults.',
        variant: 'destructive',
      });

      // Use default settings if loading fails
      setSettings({
        hatId,
        details: `${hatType === 'management' ? 'Management' : 'Membership'} HAT`,
        maxSupply: hatType === 'management' ? 5 : 1000,
        eligibilityAddress: '0x0000000000000000000000000000000000000001',
        toggleAddress: '0x0000000000000000000000000000000000000001',
        mutable: true,
        authorities: getDefaultAuthorities(hatType),
        responsibilities: getDefaultResponsibilities(hatType),
        eligibilityRules: getDefaultEligibilityRules(hatType),
        customMetadata: {},
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchHATDetailsFromContract = async (hatId: string) => {
    // This would integrate with the HATs contract to fetch current settings
    // For now, return mock data structure
    return {
      details: '',
      maxSupply: 0,
      eligibility: '0x0000000000000000000000000000000000000001',
      toggle: '0x0000000000000000000000000000000000000001',
      mutable: true,
      metadata: {},
    };
  };

  const getDefaultAuthorities = (
    hatType: 'management' | 'membership',
  ): HATAuthority[] => {
    if (hatType === 'management') {
      return [
        {
          id: 'manage_members',
          title: 'Manage Members',
          description: 'Can add/remove members from the pod',
          enabled: true,
        },
        {
          id: 'manage_treasury',
          title: 'Treasury Management',
          description: 'Can approve treasury transactions',
          enabled: true,
        },
        {
          id: 'create_events',
          title: 'Event Creation',
          description: 'Can create and manage pod events',
          enabled: true,
        },
        {
          id: 'manage_bounties',
          title: 'Manage Bounties',
          description: 'Can create and manage bounties',
          enabled: true,
        },
        {
          id: 'forum_moderation',
          title: 'Forum Moderation',
          description: 'Can moderate pod forum discussions',
          enabled: false,
        },
      ];
    } else {
      return [
        {
          id: 'participate_events',
          title: 'Event Participation',
          description: 'Can participate in pod events',
          enabled: true,
        },
        {
          id: 'forum_participation',
          title: 'Forum Participation',
          description: 'Can participate in pod discussions',
          enabled: true,
        },
        {
          id: 'vote_proposals',
          title: 'Proposal Voting',
          description: 'Can vote on pod proposals',
          enabled: true,
        },
      ];
    }
  };

  const getDefaultResponsibilities = (
    hatType: 'management' | 'membership',
  ): string[] => {
    if (hatType === 'management') {
      return [
        'Lead pod operations and strategic direction',
        'Ensure compliance with DAO governance policies',
        'Manage pod treasury and resource allocation',
        'Foster community engagement and growth',
        'Report regularly to DAO executive leadership',
      ];
    } else {
      return [
        'Actively participate in pod activities and events',
        'Contribute to pod discussions and decision making',
        'Support pod mission and objectives',
        'Follow DAO community guidelines and terms of service',
      ];
    }
  };

  const getDefaultEligibilityRules = (
    hatType: 'management' | 'membership',
  ): EligibilityRule[] => {
    return [
      {
        id: 'base_membership',
        type: 'membership',
        description: 'Must be a DAO member in good standing',
        parameters: {
          requiresActiveStatus: true,
          minimumMembershipDays: 30,
        },
        enabled: true,
      },
      {
        id: 'token_balance',
        type: 'token_balance',
        description: 'Minimum token balance requirement',
        parameters: {
          tokenAddress: process.env.NEXT_PUBLIC_GOVERNANCE_TOKEN || '',
          minimumBalance: hatType === 'management' ? '1000' : '100',
        },
        enabled: false,
      },
    ];
  };

  const updateSettings = (updates: Partial<HATSettings>) => {
    setSettings((prev) => (prev ? { ...prev, ...updates } : null));
  };

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  const addAuthority = () => {
    if (!settings) return;

    // Generate stable ID based on existing authorities count
    const existingCustom = settings.authorities.filter((auth) =>
      auth.id.startsWith('custom_'),
    );
    const nextId = existingCustom.length + 1;

    const newAuthority: HATAuthority = {
      id: `custom_authority_${nextId}`,
      title: 'New Authority',
      description: 'Custom authority description',
      enabled: true,
    };

    updateSettings({
      authorities: [...settings.authorities, newAuthority],
    });
  };

  const updateAuthority = (id: string, updates: Partial<HATAuthority>) => {
    if (!settings) return;

    updateSettings({
      authorities: settings.authorities.map((auth) =>
        auth.id === id ? { ...auth, ...updates } : auth,
      ),
    });
  };

  const removeAuthority = (id: string) => {
    if (!settings) return;

    updateSettings({
      authorities: settings.authorities.filter((auth) => auth.id !== id),
    });
  };

  const addResponsibility = () => {
    if (!settings) return;

    updateSettings({
      responsibilities: [...settings.responsibilities, 'New responsibility'],
    });
  };

  const updateResponsibility = (index: number, value: string) => {
    if (!settings) return;

    const updated = [...settings.responsibilities];
    updated[index] = value;
    updateSettings({ responsibilities: updated });
  };

  const removeResponsibility = (index: number) => {
    if (!settings) return;

    updateSettings({
      responsibilities: settings.responsibilities.filter((_, i) => i !== index),
    });
  };

  const addEligibilityRule = () => {
    if (!settings) return;

    // Generate stable ID based on existing rules count
    const existingRules = settings.eligibilityRules.filter((rule) =>
      rule.id.startsWith('rule_'),
    );
    const nextId = existingRules.length + 1;

    const newRule: EligibilityRule = {
      id: `rule_${nextId}`,
      type: 'custom',
      description: 'Custom eligibility rule',
      parameters: {},
      enabled: true,
    };

    updateSettings({
      eligibilityRules: [...settings.eligibilityRules, newRule],
    });
  };

  const updateEligibilityRule = (
    id: string,
    updates: Partial<EligibilityRule>,
  ) => {
    if (!settings) return;

    updateSettings({
      eligibilityRules: settings.eligibilityRules.map((rule) =>
        rule.id === id ? { ...rule, ...updates } : rule,
      ),
    });
  };

  const removeEligibilityRule = (id: string) => {
    if (!settings) return;

    updateSettings({
      eligibilityRules: settings.eligibilityRules.filter(
        (rule) => rule.id !== id,
      ),
    });
  };

  const saveSettings = async () => {
    if (!settings) return;

    try {
      setSaving(true);

      // This would trigger the contract update transactions
      await updateHATSettings(settings);

      toast({
        title: 'Settings Updated',
        description: 'HAT settings have been successfully updated.',
      });

      onSettingsUpdated();
    } catch (error) {
      console.error('Failed to save HAT settings:', error);
      toast({
        title: 'Save Failed',
        description: 'Failed to update HAT settings. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const updateHATSettings = async (settings: HATSettings) => {
    // This would implement the actual contract calls to update HAT settings
    // For now, just simulate the operation
    await new Promise((resolve) => setTimeout(resolve, 2000));
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center space-x-2">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span>Loading HAT settings...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!settings) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center" style={{ color: '#8B3A3A' }}>
            <AlertCircle className="h-8 w-8 mx-auto mb-2" />
            <p>Failed to load HAT settings</p>
            <Button onClick={loadHATSettings} className="mt-2" size="sm">
              <RefreshCw className="h-3 w-3 mr-1" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Advanced {hatType === 'management' ? 'Management' : 'Membership'}{' '}
            HAT Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* General Settings Card */}
          <Card className="border-l-4 border-l-blue-500">
            <CardHeader
              className="cursor-pointer hover:bg-gray-50"
              onClick={() => toggleSection('general')}
            >
              <CardTitle className="flex items-center justify-between text-base">
                <div className="flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  General Settings
                </div>
                {expandedSection === 'general' ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </CardTitle>
            </CardHeader>
            {expandedSection === 'general' && (
              <CardContent className="pt-0">
                <div className="space-y-4">
                  <div>
                    <Label>HAT Description</Label>
                    <Textarea
                      value={settings.details}
                      onChange={(e) =>
                        updateSettings({ details: e.target.value })
                      }
                      placeholder="Enter HAT description..."
                      disabled={disabled}
                    />
                  </div>

                  <div>
                    <Label>Max Supply</Label>
                    <Input
                      type="number"
                      value={settings.maxSupply}
                      onChange={(e) =>
                        updateSettings({
                          maxSupply: Number.parseInt(e.target.value) || 0,
                        })
                      }
                      disabled={disabled}
                    />
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch
                      checked={settings.mutable}
                      onCheckedChange={(mutable) => updateSettings({ mutable })}
                      disabled={disabled}
                    />
                    <Label>Mutable (can be modified later)</Label>
                  </div>

                  <div className="space-y-3">
                    <Label>Responsibilities</Label>
                    {settings.responsibilities.map((responsibility, index) => (
                      <div key={index} className="flex items-center space-x-2">
                        <Input
                          value={responsibility}
                          onChange={(e) =>
                            updateResponsibility(index, e.target.value)
                          }
                          disabled={disabled}
                          className="flex-1"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => removeResponsibility(index)}
                          disabled={disabled}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={addResponsibility}
                      disabled={disabled}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add Responsibility
                    </Button>
                  </div>
                </div>
              </CardContent>
            )}
          </Card>

          {/* Authorities Card */}
          <Card className="border-l-4 border-l-green-500">
            <CardHeader
              className="cursor-pointer hover:bg-gray-50"
              onClick={() => toggleSection('authorities')}
            >
              <CardTitle className="flex items-center justify-between text-base">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  HAT Authorities
                </div>
                {expandedSection === 'authorities' ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </CardTitle>
            </CardHeader>
            {expandedSection === 'authorities' && (
              <CardContent className="pt-0">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium">Define Permissions</h3>
                      <p className="text-sm text-gray-600">
                        Control what actions this HAT can perform
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={addAuthority}
                      disabled={disabled}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add Authority
                    </Button>
                  </div>

                  {settings.authorities.map((authority) => (
                    <Card key={authority.id} className="border">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center space-x-2">
                            <Switch
                              checked={authority.enabled}
                              onCheckedChange={(enabled) =>
                                updateAuthority(authority.id, { enabled })
                              }
                              disabled={disabled}
                            />
                            <Badge
                              variant={
                                authority.enabled ? 'default' : 'secondary'
                              }
                            >
                              {authority.enabled ? 'Active' : 'Disabled'}
                            </Badge>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => removeAuthority(authority.id)}
                            disabled={disabled}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                        </div>

                        <div className="space-y-2">
                          <Input
                            value={authority.title}
                            onChange={(e) =>
                              updateAuthority(authority.id, {
                                title: e.target.value,
                              })
                            }
                            placeholder="Authority title..."
                            disabled={disabled}
                          />
                          <Textarea
                            value={authority.description}
                            onChange={(e) =>
                              updateAuthority(authority.id, {
                                description: e.target.value,
                              })
                            }
                            placeholder="Authority description..."
                            disabled={disabled}
                            className="min-h-[60px]"
                          />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>

          {/* Eligibility Rules Card */}
          <Card className="border-l-4 border-l-purple-500">
            <CardHeader
              className="cursor-pointer hover:bg-gray-50"
              onClick={() => toggleSection('eligibility')}
            >
              <CardTitle className="flex items-center justify-between text-base">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Eligibility Rules
                </div>
                {expandedSection === 'eligibility' ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </CardTitle>
            </CardHeader>
            {expandedSection === 'eligibility' && (
              <CardContent className="pt-0">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium">Access Requirements</h3>
                      <p className="text-sm text-gray-600">
                        Define who can receive this HAT
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={addEligibilityRule}
                      disabled={disabled}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add Rule
                    </Button>
                  </div>

                  {settings.eligibilityRules.map((rule) => (
                    <Card key={rule.id} className="border">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center space-x-2">
                            <Switch
                              checked={rule.enabled}
                              onCheckedChange={(enabled) =>
                                updateEligibilityRule(rule.id, { enabled })
                              }
                              disabled={disabled}
                            />
                            <Badge
                              variant={rule.enabled ? 'default' : 'secondary'}
                            >
                              {rule.type.replace('_', ' ')}
                            </Badge>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => removeEligibilityRule(rule.id)}
                            disabled={disabled}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                        </div>

                        <Textarea
                          value={rule.description}
                          onChange={(e) =>
                            updateEligibilityRule(rule.id, {
                              description: e.target.value,
                            })
                          }
                          placeholder="Eligibility rule description..."
                          disabled={disabled}
                          className="min-h-[60px]"
                        />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>

          {/* Metadata Card */}
          <Card className="border-l-4 border-l-orange-500">
            <CardHeader
              className="cursor-pointer hover:bg-gray-50"
              onClick={() => toggleSection('metadata')}
            >
              <CardTitle className="flex items-center justify-between text-base">
                <div className="flex items-center gap-2">
                  <Key className="h-4 w-4" />
                  Contract Configuration
                </div>
                {expandedSection === 'metadata' ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </CardTitle>
            </CardHeader>
            {expandedSection === 'metadata' && (
              <CardContent className="pt-0">
                <div className="space-y-4">
                  <div>
                    <h3 className="font-medium">Smart Contract Integration</h3>
                    <p className="text-sm text-gray-600">
                      Configure contract addresses and advanced settings
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Eligibility Contract Address</Label>
                    <Input
                      value={settings.eligibilityAddress}
                      onChange={(e) =>
                        updateSettings({ eligibilityAddress: e.target.value })
                      }
                      placeholder="0x..."
                      disabled={disabled}
                    />
                    <p className="text-xs text-gray-500">
                      Smart contract that determines eligibility
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Toggle Contract Address</Label>
                    <Input
                      value={settings.toggleAddress}
                      onChange={(e) =>
                        updateSettings({ toggleAddress: e.target.value })
                      }
                      placeholder="0x..."
                      disabled={disabled}
                    />
                    <p className="text-xs text-gray-500">
                      Smart contract that can enable/disable this HAT
                    </p>
                  </div>

                  <div
                    className="mt-4 p-3 rounded-lg"
                    style={{ backgroundColor: '#E8F1EE' }}
                  >
                    <div className="flex items-start space-x-2">
                      <Info
                        className="h-4 w-4 mt-0.5"
                        style={{ color: '#2F5D50' }}
                      />
                      <div className="text-sm" style={{ color: '#1F453A' }}>
                        <p className="font-medium">Advanced Configuration</p>
                        <p>
                          Custom contracts can be deployed to implement complex
                          eligibility and toggle logic. Contact development team
                          for assistance with custom implementations.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            )}
          </Card>

          {/* Save Button */}
          <div className="flex justify-end space-x-2 mt-6 pt-4 border-t">
            <Button
              variant="outline"
              onClick={loadHATSettings}
              disabled={disabled || saving}
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Reset
            </Button>
            <Button onClick={saveSettings} disabled={disabled || saving}>
              {saving ? (
                <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <Save className="h-3 w-3 mr-1" />
              )}
              Save Settings
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
