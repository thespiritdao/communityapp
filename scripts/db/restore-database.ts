/**
 * Database Restore Script
 *
 * Restores a Supabase database from a backup directory
 * IMPORTANT: Test on staging environment first!
 *
 * Usage:
 *   npm run restore:database -- --backup ./backups/2025-11-25_14-30-00
 *   npm run restore:database -- --backup ./backups/2025-11-25_14-30-00 --staging
 *
 * Environment Variables Required:
 *   SUPABASE_DB_URL - PostgreSQL connection string (production)
 *   SUPABASE_STAGING_DB_URL - PostgreSQL connection string (staging, optional)
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import * as readline from 'readline';

dotenv.config();

const execAsync = promisify(exec);

interface RestoreOptions {
  backupDir: string;
  staging?: boolean;
  force?: boolean;
}

interface RestoreResult {
  success: boolean;
  backupDir: string;
  metadata?: any;
  error?: string;
}

/**
 * Restore database from backup
 */
async function restoreDatabase(
  options: RestoreOptions,
): Promise<RestoreResult> {
  const { backupDir, staging = false, force = false } = options;

  // Validate backup directory
  if (!fs.existsSync(backupDir)) {
    return {
      success: false,
      backupDir,
      error: `Backup directory not found: ${backupDir}`,
    };
  }

  // Load metadata
  const metadataFile = path.join(backupDir, 'metadata.json');
  if (!fs.existsSync(metadataFile)) {
    return {
      success: false,
      backupDir,
      error: 'Backup metadata not found. Invalid backup directory.',
    };
  }

  const metadata = JSON.parse(fs.readFileSync(metadataFile, 'utf-8'));

  // Validate backup files
  const requiredFiles = ['roles.sql', 'schema.sql', 'data.sql'];
  const missingFiles = requiredFiles.filter(
    (f) => !fs.existsSync(path.join(backupDir, f)),
  );

  if (missingFiles.length > 0) {
    return {
      success: false,
      backupDir,
      metadata,
      error: `Missing backup files: ${missingFiles.join(', ')}`,
    };
  }

  // Get connection string
  const dbUrl = staging
    ? process.env.SUPABASE_STAGING_DB_URL
    : process.env.SUPABASE_DB_URL;

  if (!dbUrl) {
    return {
      success: false,
      backupDir,
      metadata,
      error: staging
        ? 'SUPABASE_STAGING_DB_URL environment variable not set'
        : 'SUPABASE_DB_URL environment variable not set',
    };
  }

  console.log('');
  console.log('⚠️  DATABASE RESTORE WARNING');
  console.log('═'.repeat(60));
  console.log('');
  console.log('Target Environment:', staging ? 'STAGING' : 'PRODUCTION');
  console.log('Backup Date:', metadata.date);
  console.log('Backup Type:', metadata.type);
  console.log('Backup Location:', backupDir);
  console.log('');
  console.log('This will:');
  console.log('  1. DROP all existing tables');
  console.log('  2. Restore schema from backup');
  console.log('  3. Restore all data from backup');
  console.log('');
  console.log('⚠️  ALL CURRENT DATA WILL BE LOST!');
  console.log('');
  console.log('═'.repeat(60));
  console.log('');

  // Confirm restore (unless force flag is set)
  if (!force) {
    const confirmed = await confirmRestore();
    if (!confirmed) {
      console.log('❌ Restore cancelled by user');
      return {
        success: false,
        backupDir,
        metadata,
        error: 'Restore cancelled by user',
      };
    }
  }

  try {
    console.log('🔄 Starting database restore...');
    console.log('');

    // Create temporary psql script
    const psqlScript = `
-- Restore database from backup
-- Generated: ${new Date().toISOString()}

\\set ON_ERROR_STOP 1
\\set AUTOCOMMIT off

BEGIN;

-- Restore roles
\\echo '1/3 Restoring roles...'
\\i ${path.join(backupDir, 'roles.sql').replace(/\\/g, '/')}

-- Restore schema
\\echo '2/3 Restoring schema...'
\\i ${path.join(backupDir, 'schema.sql').replace(/\\/g, '/')}

-- Set session to replica to avoid RLS issues during restore
SET session_replication_role = replica;

-- Restore data
\\echo '3/3 Restoring data...'
\\i ${path.join(backupDir, 'data.sql').replace(/\\/g, '/')}

-- Reset session
RESET session_replication_role;

COMMIT;

\\echo 'Database restore completed successfully!'
`;

    const scriptFile = path.join(backupDir, 'restore_temp.sql');
    fs.writeFileSync(scriptFile, psqlScript);

    // Execute restore
    console.log('Executing restore...');
    const { stdout, stderr } = await execAsync(
      `psql "${dbUrl}" -f "${scriptFile}"`,
      {
        maxBuffer: 1024 * 1024 * 100, // 100MB buffer for large databases
      },
    );

    if (stdout) console.log(stdout);
    if (stderr) console.error(stderr);

    // Cleanup temp script
    fs.unlinkSync(scriptFile);

    console.log('');
    console.log('✅ Database restore completed successfully!');
    console.log('');
    console.log('📊 Restore Summary:');
    console.log(`  Environment: ${staging ? 'Staging' : 'Production'}`);
    console.log(`  Backup Date: ${metadata.date}`);
    console.log(`  Backup Type: ${metadata.type}`);
    console.log('');
    console.log('⚠️  IMPORTANT: Verify your application is working correctly');
    console.log('');

    return {
      success: true,
      backupDir,
      metadata,
    };
  } catch (error) {
    console.error('');
    console.error('❌ Restore failed:', error);
    console.error('');
    console.error('The database may be in an inconsistent state.');
    console.error(
      'You should restore from a known good backup or rebuild from migrations.',
    );
    console.error('');

    return {
      success: false,
      backupDir,
      metadata,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Confirm restore action with user
 */
function confirmRestore(): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question('Type "CONFIRM" to proceed with restore: ', (answer) => {
      rl.close();
      resolve(answer.trim().toUpperCase() === 'CONFIRM');
    });
  });
}

/**
 * List available backups
 */
function listBackups(
  backupsDir: string = path.join(__dirname, '..', '..', 'backups'),
): void {
  if (!fs.existsSync(backupsDir)) {
    console.log('No backups directory found');
    return;
  }

  const backups = fs
    .readdirSync(backupsDir)
    .filter((dir) => {
      const metadataFile = path.join(backupsDir, dir, 'metadata.json');
      return fs.existsSync(metadataFile);
    })
    .map((dir) => {
      const metadataFile = path.join(backupsDir, dir, 'metadata.json');
      const metadata = JSON.parse(fs.readFileSync(metadataFile, 'utf-8'));
      return {
        dir,
        path: path.join(backupsDir, dir),
        ...metadata,
      };
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (backups.length === 0) {
    console.log('No backups found');
    return;
  }

  console.log('');
  console.log('Available Backups:');
  console.log('═'.repeat(80));
  backups.forEach((backup, i) => {
    console.log('');
    console.log(`${i + 1}. ${backup.dir}`);
    console.log(`   Date: ${new Date(backup.date).toLocaleString()}`);
    console.log(`   Type: ${backup.type}`);
    console.log(`   Size: ${formatBytes(backup.totalSize || 0)}`);
    console.log(`   Path: ${backup.path}`);
  });
  console.log('');
}

/**
 * Format bytes to human-readable format
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

// Run restore if executed directly
if (require.main === module) {
  const args = process.argv.slice(2);

  // List backups if requested
  if (args.includes('--list')) {
    const backupsDir =
      args.find((arg, i) => args[i - 1] === '--backups-dir') || undefined;
    listBackups(backupsDir);
    process.exit(0);
  }

  // Parse restore options
  const backupDirIndex = args.indexOf('--backup');
  if (backupDirIndex === -1 || !args[backupDirIndex + 1]) {
    console.error('Error: --backup [DIRECTORY] required');
    console.error('');
    console.error('Usage:');
    console.error(
      '  npm run restore:database -- --backup ./backups/2025-11-25_14-30-00',
    );
    console.error(
      '  npm run restore:database -- --backup ./backups/2025-11-25_14-30-00 --staging',
    );
    console.error('  npm run restore:database -- --list');
    console.error('');
    process.exit(1);
  }

  const options: RestoreOptions = {
    backupDir: args[backupDirIndex + 1],
    staging: args.includes('--staging'),
    force: args.includes('--force'),
  };

  restoreDatabase(options)
    .then((result) => {
      process.exit(result.success ? 0 : 1);
    })
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export { restoreDatabase, RestoreOptions, RestoreResult, listBackups };
