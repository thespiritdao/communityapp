// Barrel exports for the identity feature.
// Only names that app code imports from '@/features/identity' are re-exported
// here. Other components are imported by path.
export { ProfileModal } from './components/ProfileModal';
export { AuthProvider, useAuthContext } from './components/AuthProvider';
export {
  getCurrentSession,
  isAuthenticated,
  getCurrentUserId,
} from './utils/serverAuth';
