// Optimized barrel exports for identity feature
// Core OnChainKit Components
export { Address } from './components/Address';
export { Avatar } from './components/Avatar';
export { Badge } from './components/Badge';
export { EthBalance } from './components/EthBalance';
export { Identity } from './components/Identity';
export { Name } from './components/Name';
export { Socials } from './components/Socials';
export { IdentityCard } from './components/IdentityCard';

// Enhanced Profile Components
export { ProfileHeader } from './components/ProfileHeader';
export { ProfileEditForm } from './components/ProfileEditForm';
export { ProfileModal } from './components/ProfileModal';
export { ProfileSection } from './components/ProfileSection';
export { AuthProvider, useAuthContext } from './components/AuthProvider';

// Token & Balance Components
export { Balances } from './components/Balances';
export { DatabaseTokenGallery } from './components/DatabaseTokenGallery';
export { TokenGallery } from './components/TokenGallery';
export { TokenSection } from './components/TokenSection';
export { BalancesSection } from './components/BalancesSection';

// Optimized Hooks
export { useAddress } from './hooks/useAddress';
export { useAttestations } from './hooks/useAttestations';
export { useAvatar } from './hooks/useAvatar';
export { useName } from './hooks/useName';
export { useAuth } from './hooks/useAuth';
export { useUserProfile } from './hooks/useUserProfile';
export { useIdentityPage } from './hooks/useIdentityPage';

// Services
export { ProfileService } from './services/ProfileService';

// Utils
export { getAddress } from './utils/getAddress';
export { getAttestations } from './utils/getAttestations';
export { getAvatar } from './utils/getAvatar';
export { getName } from './utils/getName';
export { isBasename } from './utils/isBasename';
export { updateProfile } from './utils/updateProfile';
export { displayName } from './utils/displayName';
export { getCurrentSession, isAuthenticated, getCurrentUserId } from './utils/serverAuth';

// Types
export type {
  AddressReact,
  Attestation,
  AvatarReact,
  BadgeReact,
  BaseMainnetName,
  Basename,
  BaseSepoliaName,
  EASChainDefinition,
  EASSchemaUid,
  EthBalanceReact,
  GetAddress,
  GetAddressReturnType,
  GetAttestationsOptions,
  GetAvatar,
  GetAvatarReturnType,
  GetName,
  GetNameReturnType,
  IdentityContextType,
  IdentityReact,
  NameReact,
  UseAddressOptions,
  UseAvatarOptions,
  UseQueryOptions,
  UseNameOptions,
} from './types';
