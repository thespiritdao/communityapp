/**
 * Manual Database Backup Script
 *
 * Creates a backup of the Supabase database to local filesystem
 * Can be run manually or scheduled via cron
 *
 * Usage:
 *   npm run backup:database
 *   npm run backup:database -- --output ./backups/manual
 *
 * Environment Variables Required:
 *   SUPABASE_DB_URL - PostgreSQL connection string
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

const execAsync = promisify(exec);

interface BackupOptions {
  outputDir?: string;
  compress?: boolean;
  uploadToS3?: boolean;
}

interface BackupResult {
  success: boolean;
  timestamp: string;
  backupDir: string;
  files: string[];
  error?: string;
}

/**
 * Create a timestamped backup of the database
 */
async function backupDatabase(
  options: BackupOptions = {},
): Promise<BackupResult> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const outputDir = options.outputDir || path.join(__dirname, '..', '..', 'backups');
  const backupDir = path.join(outputDir, timestamp);

  // Create backup directory
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const dbUrl = process.env.SUPABASE_DB_URL;

  if (!dbUrl) {
    return {
      success: false,
      timestamp,
      backupDir,
      files: [],
      error: 'SUPABASE_DB_URL environment variable not set',
    };
  }

  const files: string[] = [];

  try {
    console.log('🔄 Starting database backup...');
    console.log(`📁 Backup directory: ${backupDir}`);
    console.log('');

    // Backup roles
    console.log('1/4 Backing up roles...');
    const rolesFile = path.join(backupDir, 'roles.sql');
    await execAsync(
      `npx supabase db dump --db-url "${dbUrl}" -f "${rolesFile}" --role-only`,
    );
    files.push(rolesFile);
    console.log('✅ Roles backed up');

    // Backup schema
    console.log('2/4 Backing up schema...');
    const schemaFile = path.join(backupDir, 'schema.sql');
    await execAsync(
      `npx supabase db dump --db-url "${dbUrl}" -f "${schemaFile}"`,
    );
    files.push(schemaFile);
    console.log('✅ Schema backed up');

    // Backup data
    console.log('3/4 Backing up data...');
    const dataFile = path.join(backupDir, 'data.sql');
    await execAsync(
      `npx supabase db dump --db-url "${dbUrl}" -f "${dataFile}" --use-copy --data-only`,
    );
    files.push(dataFile);
    console.log('✅ Data backed up');

    // Create metadata
    console.log('4/4 Creating metadata...');
    const metadata = {
      timestamp,
      date: new Date().toISOString(),
      type: 'manual',
      files: files.map((f) => path.basename(f)),
      totalSize: files.reduce((acc, f) => acc + fs.statSync(f).size, 0),
    };

    const metadataFile = path.join(backupDir, 'metadata.json');
    fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2));
    files.push(metadataFile);
    console.log('✅ Metadata created');

    // Create restore script
    const restoreScript = `#!/bin/bash
# Automated Restore Script for Supabase Database
# Generated: ${new Date().toISOString()}

set -e

if [ -z "$1" ]; then
  echo "Error: Connection string required"
  echo "Usage: $0 [CONNECTION_STRING]"
  exit 1
fi

CONNECTION_STRING="$1"

echo "⚠️  WARNING: This will restore the database to the backup from:"
cat metadata.json | grep -E "date|type" | sed 's/^/  /'
echo ""
echo "Press Ctrl+C to cancel, or press Enter to continue..."
read -r

echo "🔄 Starting database restore..."

psql \\
  --single-transaction \\
  --variable ON_ERROR_STOP=1 \\
  --file roles.sql \\
  --file schema.sql \\
  --command 'SET session_replication_role = replica' \\
  --file data.sql \\
  --dbname "\${CONNECTION_STRING}"

echo "✅ Database restore completed successfully!"
`;

    const restoreScriptFile = path.join(backupDir, 'restore.sh');
    fs.writeFileSync(restoreScriptFile, restoreScript);
    fs.chmodSync(restoreScriptFile, 0o755);
    files.push(restoreScriptFile);

    // Create Windows restore script
    const restoreScriptWin = `@echo off
REM Automated Restore Script for Supabase Database
REM Generated: ${new Date().toISOString()}

if "%1"=="" (
  echo Error: Connection string required
  echo Usage: %0 [CONNECTION_STRING]
  exit /b 1
)

set CONNECTION_STRING=%1

echo WARNING: This will restore the database to the backup from:
type metadata.json | findstr "date type"
echo.
echo Press Ctrl+C to cancel, or press any key to continue...
pause >nul

echo Starting database restore...

psql ^
  --single-transaction ^
  --variable ON_ERROR_STOP=1 ^
  --file roles.sql ^
  --file schema.sql ^
  --command "SET session_replication_role = replica" ^
  --file data.sql ^
  --dbname "%CONNECTION_STRING%"

echo Database restore completed successfully!
`;

    const restoreScriptWinFile = path.join(backupDir, 'restore.bat');
    fs.writeFileSync(restoreScriptWinFile, restoreScriptWin);
    files.push(restoreScriptWinFile);

    console.log('');
    console.log('✅ Backup completed successfully!');
    console.log('');
    console.log('📊 Backup Summary:');
    console.log(`  Timestamp: ${timestamp}`);
    console.log(`  Location: ${backupDir}`);
    console.log(`  Files: ${files.length}`);
    console.log(`  Total Size: ${formatBytes(metadata.totalSize)}`);
    console.log('');
    console.log('📝 To restore this backup:');
    console.log(
      `  Linux/Mac: cd "${backupDir}" && ./restore.sh "[CONNECTION_STRING]"`,
    );
    console.log(
      `  Windows:   cd "${backupDir}" && restore.bat "[CONNECTION_STRING]"`,
    );
    console.log('');

    return {
      success: true,
      timestamp,
      backupDir,
      files,
    };
  } catch (error) {
    console.error('❌ Backup failed:', error);

    return {
      success: false,
      timestamp,
      backupDir,
      files,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
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

// Run backup if executed directly
if (require.main === module) {
  const args = process.argv.slice(2);
  const options: BackupOptions = {};

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--output' && args[i + 1]) {
      options.outputDir = args[i + 1];
      i++;
    } else if (args[i] === '--compress') {
      options.compress = true;
    }
  }

  backupDatabase(options)
    .then((result) => {
      process.exit(result.success ? 0 : 1);
    })
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export { backupDatabase, BackupOptions, BackupResult };
