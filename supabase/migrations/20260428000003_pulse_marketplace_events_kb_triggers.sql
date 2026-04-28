-- Migration: Pulse triggers for marketplace, events, knowledge base,
-- profile, chat-channel-created
--
-- Same pattern as the forum and bounty/pod trigger migrations: writes that
-- happen client-side or via status UPDATEs get surfaced via DB triggers.
-- All trigger bodies are wrapped in EXCEPTION WHEN OTHERS THEN NULL so a
-- Pulse-write hiccup can never break the source insert/update.

-- ── marketplace_listing_created ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pulse_log_marketplace_listing_created()
RETURNS TRIGGER AS $$
BEGIN
  BEGIN
    INSERT INTO explorer_events (
      type, category, title, actor, pod_id, url, metadata, dedupe_key
    ) VALUES (
      'marketplace_listing_created',
      'marketplace',
      'New marketplace listing: ' || COALESCE(NEW.title, NEW.name, 'Untitled'),
      LOWER(COALESCE(NEW.creator_wallet, NEW.wallet_address, '')),
      NEW.pod_id,
      '/marketplace',
      jsonb_build_object(
        'product_id', NEW.id,
        'pod_id', NEW.pod_id,
        'gating_token', NEW.required_token,
        'price_system', NEW.price_system,
        'price_self', NEW.price_self
      ),
      'marketplace_listing_created:' || NEW.id::text
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_pulse_marketplace_listing_created ON products;
CREATE TRIGGER trg_pulse_marketplace_listing_created
  AFTER INSERT ON products
  FOR EACH ROW EXECUTE FUNCTION pulse_log_marketplace_listing_created();

-- ── marketplace_listing_updated ───────────────────────────────────────────────
-- Fires only when a user-visible field changes (price, description, image,
-- name, gating token, quantity). Background bookkeeping updates don't fire.
CREATE OR REPLACE FUNCTION pulse_log_marketplace_listing_updated()
RETURNS TRIGGER AS $$
DECLARE
  changed BOOLEAN := FALSE;
BEGIN
  IF (OLD.title IS DISTINCT FROM NEW.title) OR
     (OLD.name IS DISTINCT FROM NEW.name) OR
     (OLD.description IS DISTINCT FROM NEW.description) OR
     (OLD.price_system IS DISTINCT FROM NEW.price_system) OR
     (OLD.price_self IS DISTINCT FROM NEW.price_self) OR
     (OLD.image_url IS DISTINCT FROM NEW.image_url) OR
     (OLD.required_token IS DISTINCT FROM NEW.required_token) OR
     (OLD.units_available IS DISTINCT FROM NEW.units_available) THEN
    changed := TRUE;
  END IF;

  IF changed THEN
    BEGIN
      INSERT INTO explorer_events (
        type, category, title, actor, pod_id, url, metadata
      ) VALUES (
        'marketplace_listing_updated',
        'marketplace',
        'Listing updated: ' || COALESCE(NEW.title, NEW.name, 'Untitled'),
        LOWER(COALESCE(NEW.creator_wallet, NEW.wallet_address, '')),
        NEW.pod_id,
        '/marketplace',
        jsonb_build_object('product_id', NEW.id, 'pod_id', NEW.pod_id)
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_pulse_marketplace_listing_updated ON products;
CREATE TRIGGER trg_pulse_marketplace_listing_updated
  AFTER UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION pulse_log_marketplace_listing_updated();

-- ── marketplace_order status transitions ──────────────────────────────────────
-- Existing marketplace_purchase row is created at insert time (handled by
-- backfill + future writer). This trigger logs only status transitions.
CREATE OR REPLACE FUNCTION pulse_log_marketplace_order_status_change()
RETURNS TRIGGER AS $$
DECLARE
  evt TEXT;
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    BEGIN
      evt := CASE NEW.status
        WHEN 'fulfilled' THEN 'marketplace_order_fulfilled'
        WHEN 'shipped' THEN 'marketplace_order_shipped'
        WHEN 'refunded' THEN 'marketplace_order_refunded'
        WHEN 'cancelled' THEN 'marketplace_order_cancelled'
        ELSE NULL
      END;
      IF evt IS NOT NULL THEN
        INSERT INTO explorer_events (
          type, category, title, actor, recipient_address, url, metadata, dedupe_key
        ) VALUES (
          evt,
          'marketplace',
          'Order ' || NEW.status || ': ' || COALESCE(NEW.product_name, ''),
          LOWER(COALESCE(NEW.fulfillment_manager_address, NEW.buyer_address)),
          LOWER(NEW.buyer_address),
          '/marketplace/orders/' || NEW.id::text,
          jsonb_build_object(
            'order_id', NEW.id,
            'product_id', NEW.product_id,
            'tracking_number', NEW.tracking_number,
            'new_status', NEW.status
          ),
          evt || ':' || NEW.id::text
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_pulse_marketplace_order_status_change ON marketplace_orders;
CREATE TRIGGER trg_pulse_marketplace_order_status_change
  AFTER UPDATE OF status ON marketplace_orders
  FOR EACH ROW EXECUTE FUNCTION pulse_log_marketplace_order_status_change();

-- ── event_rsvp ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pulse_log_event_rsvp()
RETURNS TRIGGER AS $$
DECLARE
  ev_title TEXT;
  ev_pod_id UUID;
BEGIN
  BEGIN
    SELECT title, organizing_pod_id INTO ev_title, ev_pod_id
      FROM events WHERE id = NEW.event_id;

    INSERT INTO explorer_events (
      type, category, title, actor, pod_id, url, metadata, dedupe_key
    ) VALUES (
      'event_rsvp',
      'events',
      'RSVPed to ' || COALESCE(ev_title, 'an event'),
      LOWER(NEW.user_address),
      ev_pod_id,
      '/events',
      jsonb_build_object(
        'event_id', NEW.event_id,
        'registration_id', NEW.id,
        'payment_token', NEW.payment_token,
        'payment_amount', NEW.payment_amount
      ),
      'event_rsvp:' || NEW.id::text
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_pulse_event_rsvp ON event_registrations;
CREATE TRIGGER trg_pulse_event_rsvp
  AFTER INSERT ON event_registrations
  FOR EACH ROW EXECUTE FUNCTION pulse_log_event_rsvp();

-- ── event_escrow_held ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pulse_log_event_escrow_held()
RETURNS TRIGGER AS $$
DECLARE
  ev_title TEXT;
  ev_pod_id UUID;
BEGIN
  BEGIN
    SELECT title, organizing_pod_id INTO ev_title, ev_pod_id
      FROM events WHERE id = NEW.event_id;

    INSERT INTO explorer_events (
      type, category, title, pod_id, url, metadata, dedupe_key
    ) VALUES (
      'event_escrow_held',
      'events',
      'Escrow opened for ' || COALESCE(ev_title, 'an event'),
      ev_pod_id,
      '/events',
      jsonb_build_object(
        'event_id', NEW.event_id,
        'escrow_id', NEW.id,
        'total_self', NEW.total_self_amount,
        'total_system', NEW.total_system_amount,
        'escrow_address', NEW.escrow_account_address
      ),
      'event_escrow_held:' || NEW.id::text
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_pulse_event_escrow_held ON event_escrow;
CREATE TRIGGER trg_pulse_event_escrow_held
  AFTER INSERT ON event_escrow
  FOR EACH ROW EXECUTE FUNCTION pulse_log_event_escrow_held();

-- ── event_escrow_released (distributed flag transitions to true) ──────────────
CREATE OR REPLACE FUNCTION pulse_log_event_escrow_released()
RETURNS TRIGGER AS $$
DECLARE
  ev_title TEXT;
  ev_pod_id UUID;
BEGIN
  IF OLD.distributed IS DISTINCT FROM NEW.distributed AND NEW.distributed = TRUE THEN
    BEGIN
      SELECT title, organizing_pod_id INTO ev_title, ev_pod_id
        FROM events WHERE id = NEW.event_id;

      INSERT INTO explorer_events (
        type, category, title, pod_id, url, metadata, dedupe_key
      ) VALUES (
        'event_escrow_released',
        'events',
        'Escrow released for ' || COALESCE(ev_title, 'an event'),
        ev_pod_id,
        '/events',
        jsonb_build_object(
          'event_id', NEW.event_id,
          'escrow_id', NEW.id,
          'distribution_tx_hash', NEW.distribution_tx_hash
        ),
        'event_escrow_released:' || NEW.id::text
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_pulse_event_escrow_released ON event_escrow;
CREATE TRIGGER trg_pulse_event_escrow_released
  AFTER UPDATE ON event_escrow
  FOR EACH ROW EXECUTE FUNCTION pulse_log_event_escrow_released();

-- ── event_tokens_distributed (one row per token mint at distribution time) ────
-- event_tokens.minted_at is set when a token is distributed. Fire on insert
-- and dedupe per-row so retries don't double-count.
CREATE OR REPLACE FUNCTION pulse_log_event_tokens_distributed()
RETURNS TRIGGER AS $$
DECLARE
  ev_title TEXT;
  ev_pod_id UUID;
BEGIN
  BEGIN
    SELECT title, organizing_pod_id INTO ev_title, ev_pod_id
      FROM events WHERE id = NEW.event_id;

    INSERT INTO explorer_events (
      type, category, title, recipient_address, pod_id, url, metadata, dedupe_key
    ) VALUES (
      'event_tokens_distributed',
      'events',
      COALESCE(NEW.token_name, 'Event token') || ' distributed for ' || COALESCE(ev_title, 'an event'),
      LOWER(NEW.owner_address),
      ev_pod_id,
      '/events',
      jsonb_build_object(
        'event_id', NEW.event_id,
        'event_token_id', NEW.id,
        'token_type', NEW.token_type,
        'contract_address', NEW.contract_address
      ),
      'event_tokens_distributed:' || NEW.id::text
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_pulse_event_tokens_distributed ON event_tokens;
CREATE TRIGGER trg_pulse_event_tokens_distributed
  AFTER INSERT ON event_tokens
  FOR EACH ROW EXECUTE FUNCTION pulse_log_event_tokens_distributed();

-- ── knowledge_item_published / updated ────────────────────────────────────────
-- Insert with is_public=true → published. Insert with is_public=false →
-- draft, no event. Update setting is_public from false→true → published.
-- Other meaningful field changes while is_public=true → updated.
CREATE OR REPLACE FUNCTION pulse_log_knowledge_item_insert()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_public = TRUE THEN
    BEGIN
      INSERT INTO explorer_events (
        type, category, title, actor, pod_id, url, metadata, dedupe_key
      ) VALUES (
        'knowledge_item_published',
        'knowledge',
        'Knowledge item published: ' || COALESCE(NEW.title, 'Untitled'),
        LOWER(COALESCE(NEW.created_by, '')),
        NEW.pod_id,
        '/knowledge',
        jsonb_build_object(
          'item_id', NEW.id,
          'category_id', NEW.category_id,
          'content_type', NEW.content_type
        ),
        'knowledge_item_published:' || NEW.id::text
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_pulse_knowledge_item_insert ON knowledge_items;
CREATE TRIGGER trg_pulse_knowledge_item_insert
  AFTER INSERT ON knowledge_items
  FOR EACH ROW EXECUTE FUNCTION pulse_log_knowledge_item_insert();

CREATE OR REPLACE FUNCTION pulse_log_knowledge_item_update()
RETURNS TRIGGER AS $$
DECLARE
  meaningful BOOLEAN := FALSE;
BEGIN
  -- Draft → published
  IF OLD.is_public IS DISTINCT FROM NEW.is_public AND NEW.is_public = TRUE THEN
    BEGIN
      INSERT INTO explorer_events (
        type, category, title, actor, pod_id, url, metadata, dedupe_key
      ) VALUES (
        'knowledge_item_published',
        'knowledge',
        'Knowledge item published: ' || COALESCE(NEW.title, 'Untitled'),
        LOWER(COALESCE(NEW.created_by, '')),
        NEW.pod_id,
        '/knowledge',
        jsonb_build_object('item_id', NEW.id, 'category_id', NEW.category_id),
        'knowledge_item_published:' || NEW.id::text
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    RETURN NEW;
  END IF;

  -- Update of an already-published item with a meaningful change
  IF NEW.is_public = TRUE THEN
    IF (OLD.title IS DISTINCT FROM NEW.title) OR
       (OLD.description IS DISTINCT FROM NEW.description) OR
       (OLD.content_url IS DISTINCT FROM NEW.content_url) OR
       (OLD.content_text IS DISTINCT FROM NEW.content_text) OR
       (OLD.thumbnail_url IS DISTINCT FROM NEW.thumbnail_url) THEN
      meaningful := TRUE;
    END IF;
    IF meaningful THEN
      BEGIN
        INSERT INTO explorer_events (
          type, category, title, actor, pod_id, url, metadata
        ) VALUES (
          'knowledge_item_updated',
          'knowledge',
          'Knowledge item updated: ' || COALESCE(NEW.title, 'Untitled'),
          LOWER(COALESCE(NEW.created_by, '')),
          NEW.pod_id,
          '/knowledge',
          jsonb_build_object('item_id', NEW.id, 'category_id', NEW.category_id)
        );
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_pulse_knowledge_item_update ON knowledge_items;
CREATE TRIGGER trg_pulse_knowledge_item_update
  AFTER UPDATE ON knowledge_items
  FOR EACH ROW EXECUTE FUNCTION pulse_log_knowledge_item_update();

-- ── profile_updated (24h debounce per wallet) ─────────────────────────────────
-- Watches a curated set of user-visible columns. Skips if the same wallet
-- already has a profile_updated event in the last 24h. The throttle key is
-- the wallet itself; we look at the most recent profile_updated row.
CREATE OR REPLACE FUNCTION pulse_log_profile_updated()
RETURNS TRIGGER AS $$
DECLARE
  meaningful BOOLEAN := FALSE;
  recent_count INT;
  wallet TEXT;
BEGIN
  IF (OLD.first_name IS DISTINCT FROM NEW.first_name) OR
     (OLD.last_name IS DISTINCT FROM NEW.last_name) OR
     (OLD.profile_picture IS DISTINCT FROM NEW.profile_picture) OR
     (OLD.bio IS DISTINCT FROM NEW.bio) OR
     (OLD.occupation IS DISTINCT FROM NEW.occupation) OR
     (OLD.skills_expertise IS DISTINCT FROM NEW.skills_expertise) THEN
    meaningful := TRUE;
  END IF;

  -- Skip the very first time a name is set — that's already covered by the
  -- existing /api/explorer/member-introduced flow.
  IF OLD.first_name IS NULL AND NEW.first_name IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF meaningful THEN
    BEGIN
      wallet := LOWER(NEW.wallet_address);
      SELECT COUNT(*) INTO recent_count
        FROM explorer_events
        WHERE type = 'profile_updated'
          AND actor = wallet
          AND created_at > NOW() - INTERVAL '24 hours';

      IF recent_count = 0 THEN
        INSERT INTO explorer_events (
          type, category, title, actor, url, metadata
        ) VALUES (
          'profile_updated',
          'members',
          'Profile updated',
          wallet,
          '/members',
          jsonb_build_object(
            'changed_first_name', OLD.first_name IS DISTINCT FROM NEW.first_name,
            'changed_last_name', OLD.last_name IS DISTINCT FROM NEW.last_name,
            'changed_picture', OLD.profile_picture IS DISTINCT FROM NEW.profile_picture,
            'changed_bio', OLD.bio IS DISTINCT FROM NEW.bio
          )
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_pulse_profile_updated ON user_profiles;
CREATE TRIGGER trg_pulse_profile_updated
  AFTER UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION pulse_log_profile_updated();

-- ── chat_channel_created ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pulse_log_chat_channel_created()
RETURNS TRIGGER AS $$
BEGIN
  BEGIN
    INSERT INTO explorer_events (
      type, category, title, actor, pod_id, url, metadata, dedupe_key
    ) VALUES (
      'chat_channel_created',
      'members',
      'New chat channel: ' || COALESCE(NEW.title, 'Untitled'),
      LOWER(COALESCE(NEW.created_by_address, '')),
      NEW.pod_id,
      '/chat/' || NEW.id::text,
      jsonb_build_object(
        'channel_id', NEW.id,
        'access_level', NEW.access_level,
        'required_token', NEW.required_token
      ),
      'chat_channel_created:' || NEW.id::text
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_pulse_chat_channel_created ON chat_groups;
CREATE TRIGGER trg_pulse_chat_channel_created
  AFTER INSERT ON chat_groups
  FOR EACH ROW EXECUTE FUNCTION pulse_log_chat_channel_created();
