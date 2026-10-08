'use client';

// The card used for every "pick one" list in the community area: forum
// categories and chat groups. Same grid, same card, same header / description
// / footer rhythm, so the two lists read as one family.

import type React from 'react';
import Link from 'next/link';
import styles from './community.module.css';

export interface ListCardProps {
  title: string;
  description?: string | null;
  /** Lucide icon or similar, shown in the rounded tile. */
  icon?: React.ReactNode;
  /** Image for the tile instead of an icon (e.g. a pod's picture). */
  imageSrc?: string | null;
  /** Small pill after the title, e.g. the pod name. */
  badge?: string | null;
  /** Unread count shown at the end of the header row. */
  count?: number;
  /** Footer content; omitted when not given. */
  footer?: React.ReactNode;
  href?: string;
  onClick?: () => void;
}

export function ListGrid({ children }: { children: React.ReactNode }) {
  return <ul className={styles.listGrid}>{children}</ul>;
}

export function ListCard({
  title,
  description,
  icon,
  imageSrc,
  badge,
  count,
  footer,
  href,
  onClick,
}: ListCardProps) {
  const body = (
    <>
      <div className={styles.listCardHeader}>
        <div className={styles.listCardIcon} aria-hidden="true">
          {imageSrc ? <img src={imageSrc} alt="" loading="lazy" /> : icon}
        </div>
        <h3 className={styles.listCardTitle}>{title}</h3>
        {badge && <span className={styles.badge}>{badge}</span>}
        {count !== undefined && count > 0 && (
          <span className={styles.countBadge} aria-label={`${count} unread`}>
            {count > 99 ? '99+' : count}
          </span>
        )}
      </div>
      {description && <p className={styles.listCardDescription}>{description}</p>}
      {footer && (
        <div className={`${styles.listCardFooter} ${styles.listCardFooterRule}`}>{footer}</div>
      )}
    </>
  );

  return (
    <li style={{ display: 'flex' }}>
      {href ? (
        <Link href={href} className={styles.listCard}>
          {body}
        </Link>
      ) : (
        <button type="button" onClick={onClick} className={styles.listCard}>
          {body}
        </button>
      )}
    </li>
  );
}

export const listCardFooterItemClass = styles.listCardFooterItem;
export const listCardFooterStrongClass = styles.listCardFooterStrong;

export default ListCard;
