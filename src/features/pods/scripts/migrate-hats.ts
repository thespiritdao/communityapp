/**
 * One-time migration script to populate database with existing HATS
 * Run this once to set up your Pod system with existing HATS
 */

import { HatsMigrationService, EXISTING_HATS } from '../services/hatsMigrationService';

async function runMigration() {
  console.log('🚀 Starting HATS Migration Script');
  console.log('=====================================\n');

  // You'll need to replace this with your actual wallet address
  const CREATOR_ADDRESS = '0x12a0...0244'; // Replace with your executive wallet
  
  try {
    console.log('📋 Migration Plan:');
    console.log('- Executive Pod:', EXISTING_HATS.EXECUTIVE_POD);
    console.log('- Dev Pod:', EXISTING_HATS.DEV_POD);
    console.log('- Creator:', CREATOR_ADDRESS);
    console.log('\n🔄 Starting migration...\n');

    await HatsMigrationService.migrateExistingHats(CREATOR_ADDRESS);
    
    console.log('\n✅ Migration completed successfully!');
    console.log('\n📋 Next Steps:');
    console.log('1. Deploy treasury contracts for existing pods');
    console.log('2. Update pod form to use proper HAT IDs');
    console.log('3. Test event creation with pod treasury integration');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Export for use in your app
export { runMigration };

// If running directly
if (require.main === module) {
  runMigration();
}