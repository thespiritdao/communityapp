import type { Address, Chain } from 'viem';
import { Address as AddressComponent } from './Address';
import { Avatar } from './Avatar';
import { Badge } from './Badge';
import { Identity } from './Identity';
import { Name } from './Name';
import { Socials } from './Socials';

import { background, border, cn, line } from 'src/styles/theme';

type IdentityCardProps = {
  address?: Address;
  chain?: Chain;
  className?: string;
  schemaId?: Address | null;
};

export function IdentityCard({
  address,
  chain,
  className = '',
  schemaId,
}: IdentityCardProps) {
  return (
    <div
      className={cn(
        border.radius,
        background.default,
        line.default,
        'items-left flex min-w-[300px] p-4',
        className,
      )}
    >
      <Avatar address={address} chain={chain} />
      <div className="flex flex-col ml-4">
        <Name address={address}>
          <Badge schemaId={schemaId} />
        </Name>
        <AddressComponent address={address} chain={chain} />
        <Socials address={address} />
      </div>
    </div>
  );
}
