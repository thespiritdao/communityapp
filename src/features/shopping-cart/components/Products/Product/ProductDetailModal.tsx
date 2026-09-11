// src/features/shopping-cart/components/Products/Product/ProductDetailModal.tsx
//
// Full view of one artifact. The storefront card truncates the description and
// shows nothing else, so this is where the long description, both prices,
// availability, sizes and catalogue details live. Opened by clicking the
// card's image or title; "Add to Cart" hands back to the card's existing
// size-selection flow so there is one code path for adding.

'use client';

import { useEffect } from 'react';
import type { IProduct } from '../../../models';

interface Props {
  product: IProduct;
  isOpen: boolean;
  isAccessible: boolean;
  onClose: () => void;
  onAddToCart: () => void;
  addLabel: string;
}

const overlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 1000,
  background: 'rgba(0,0,0,0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '1rem',
};

const sheet: React.CSSProperties = {
  background: '#fff',
  borderRadius: 16,
  maxWidth: 560,
  width: '100%',
  maxHeight: '90vh',
  overflowY: 'auto',
  boxShadow: '0 10px 40px rgba(0,0,0,0.25)',
};

const label: React.CSSProperties = {
  fontSize: '0.72rem',
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: '#8FA09A',
};

export default function ProductDetailModal({
  product,
  isOpen,
  isAccessible,
  onClose,
  onAddToCart,
  addLabel,
}: Props) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sizes: string[] =
    (product as any).available_sizes || (product as any).availableSizes || [];
  const meaningfulSizes = sizes.filter((s) => s && s !== 'One Size');
  const units = (product as any).units_available;
  const sku = (product as any).sku;
  const style = (product as any).style;

  return (
    <div style={overlay} onClick={onClose} role="dialog" aria-modal="true" aria-label={product.name}>
      <div style={sheet} onClick={(e) => e.stopPropagation()}>
        {product.image_url && (
          <img
            src={product.image_url}
            alt={product.name}
            style={{
              width: '100%',
              maxHeight: 320,
              objectFit: 'contain',
              background: '#F4F6F5',
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              display: 'block',
            }}
          />
        )}

        <div style={{ padding: '1.25rem 1.35rem 1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start' }}>
            <h3 style={{ margin: 0, fontSize: '1.35rem', lineHeight: 1.2 }}>{product.name}</h3>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              style={{ border: 'none', background: 'transparent', fontSize: '1.5rem', lineHeight: 1, cursor: 'pointer', color: '#8FA09A' }}
            >
              ×
            </button>
          </div>

          <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.9rem' }}>
            <div>
              <div style={label}>$SYSTEM</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>{product.price_system}</div>
            </div>
            <div>
              <div style={label}>$SELF</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>{product.price_self}</div>
            </div>
            {typeof units === 'number' && (
              <div>
                <div style={label}>Available</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 600, color: units > 0 ? '#1F453A' : '#B42318' }}>
                  {units > 0 ? units : 'Sold out'}
                </div>
              </div>
            )}
          </div>

          {product.description && (
            <>
              <div style={{ ...label, marginTop: '1.1rem' }}>About this artifact</div>
              <p style={{ margin: '0.35rem 0 0', whiteSpace: 'pre-wrap', lineHeight: 1.55, color: '#2f3a36' }}>
                {product.description}
              </p>
            </>
          )}

          {meaningfulSizes.length > 0 && (
            <>
              <div style={{ ...label, marginTop: '1.1rem' }}>Sizes</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.35rem' }}>
                {meaningfulSizes.map((s) => (
                  <span
                    key={s}
                    style={{ border: '1px solid #D7DDE4', borderRadius: 999, padding: '0.2rem 0.7rem', fontSize: '0.85rem' }}
                  >
                    {s}
                  </span>
                ))}
              </div>
            </>
          )}

          {(sku || (style && style !== 'default')) && (
            <div style={{ marginTop: '1rem', fontSize: '0.8rem', color: '#8FA09A' }}>
              {style && style !== 'default' ? `Style: ${style}` : ''}
              {style && style !== 'default' && sku ? ' · ' : ''}
              {sku ? `SKU: ${sku}` : ''}
            </div>
          )}

          <button
            type="button"
            disabled={!isAccessible || units === 0}
            onClick={() => {
              onAddToCart();
              onClose();
            }}
            style={{
              marginTop: '1.35rem',
              width: '100%',
              padding: '0.8rem 1rem',
              borderRadius: 10,
              border: 'none',
              cursor: !isAccessible || units === 0 ? 'not-allowed' : 'pointer',
              background: !isAccessible || units === 0 ? '#C9D2CE' : '#1F453A',
              color: '#fff',
              fontSize: '1rem',
              fontWeight: 600,
            }}
          >
            {units === 0 ? 'Sold out' : isAccessible ? addLabel : 'Add to Cart (Token Required)'}
          </button>
        </div>
      </div>
    </div>
  );
}
