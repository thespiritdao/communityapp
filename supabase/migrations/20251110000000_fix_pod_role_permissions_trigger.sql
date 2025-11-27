-- Fix pod_role_permissions trigger to use token_address instead of hat_id
-- Date: 2025-11-10
-- Issue: Trigger function still references NEW.hat_id and OLD.hat_id which no longer exist

-- First, check if pod_role_permissions_history table needs updating
-- (If this table also has hat_id column, it needs to be renamed too)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'pod_role_permissions_history'
    AND column_name = 'hat_id'
  ) THEN
    -- Rename the column in the history table
    ALTER TABLE pod_role_permissions_history
      RENAME COLUMN hat_id TO token_address;

    RAISE NOTICE 'Renamed pod_role_permissions_history.hat_id to token_address';
  END IF;
END $$;

-- Now update the trigger function to use token_address
CREATE OR REPLACE FUNCTION public.create_pod_role_permissions_history()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO pod_role_permissions_history (
      permission_id, pod_id, token_address, role_name,
      new_permissions, new_eligibility_criteria,
      change_type, changed_by
    ) VALUES (
      NEW.id, NEW.pod_id, NEW.token_address, NEW.role_name,
      NEW.permissions, NEW.eligibility_criteria,
      'created', NEW.created_by
    );
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO pod_role_permissions_history (
      permission_id, pod_id, token_address, role_name,
      old_permissions, new_permissions,
      old_eligibility_criteria, new_eligibility_criteria,
      change_type, changed_by
    ) VALUES (
      NEW.id, NEW.pod_id, NEW.token_address, NEW.role_name,
      OLD.permissions, NEW.permissions,
      OLD.eligibility_criteria, NEW.eligibility_criteria,
      CASE
        WHEN OLD.is_active <> NEW.is_active AND NEW.is_active THEN 'activated'
        WHEN OLD.is_active <> NEW.is_active AND NOT NEW.is_active THEN 'deactivated'
        ELSE 'updated'
      END,
      NEW.updated_by
    );
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO pod_role_permissions_history (
      permission_id, pod_id, token_address, role_name,
      old_permissions, old_eligibility_criteria,
      change_type, changed_by
    ) VALUES (
      OLD.id, OLD.pod_id, OLD.token_address, OLD.role_name,
      OLD.permissions, OLD.eligibility_criteria,
      'deleted', OLD.updated_by
    );
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$function$;

-- Add a comment to document the change
COMMENT ON FUNCTION public.create_pod_role_permissions_history() IS
  'Updated 2025-11-10: Changed from hat_id to token_address to match table schema';
