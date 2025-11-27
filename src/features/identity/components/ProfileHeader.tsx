

type ProfileHeaderProps = {
  // The user's data, including the profile_picture URL
  profile?: {
    first_name?: string;
    last_name?: string;
    profile_picture?: string | null;
    wallet_address?: string;
  };
  address?: string; // Wallet address from useAccount hook
  showCopy?: boolean; // For backwards compatibility
  className?: string;
};

export function ProfileHeader({ profile, address, showCopy, className }: ProfileHeaderProps) {
  if (!profile) {
    return null; // or some fallback
  }

  // Use address from props if profile doesn't have wallet_address
  const walletAddress = profile.wallet_address || address;

  return (
    <div className={`profile-header ${className}`}>
      {/* Profile Image */}
      <div className="profile-image-container">
        <img
          src={
            profile.profile_picture
              ? profile.profile_picture
              : '/images/symbolobinfin.png'
          }
          alt={`${profile.first_name || ''} ${profile.last_name || ''}`}
          className="profile-image"
        />
      </div>

      {/* Basic Name / Address Info */}
      <div style={{ marginTop: '10px' }}>
        <h3>
          <strong>{profile.first_name}</strong> <strong>{profile.last_name}</strong>
        </h3>
        
        {/* Formatted wallet address with ellipsis */}
        <p className="wallet-address">
          {walletAddress && (
            `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
          )}
        </p>
      </div>
    </div>
  );
}