import { useState, useEffect } from 'react';
import { getUserProfile, updateUserProfile } from '../../api/userProfile';
import { useAccount } from 'wagmi';

export default function EditProfileForm() {
  const { address } = useAccount();
  const [profile, setProfile] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (address) {
      getUserProfile(address).then(data => {
        setProfile(data);
        setLoading(false);
      }).catch(error => {
        console.error('Error fetching profile:', error);
        setLoading(false);
      });
    }
  }, [address]);

  const handleChange = (e) => {
    setProfile({
      ...profile,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await updateUserProfile(address, profile);
      alert('Profile updated successfully');
    } catch (error) {
      console.error('Error updating profile:', error);
    }
  };

  if (loading) return <div>Loading...</div>;

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        name="first_name"
        value={profile.first_name || ''}
        onChange={handleChange}
        placeholder="First Name"
      />
      <input
        type="text"
        name="last_name"
        value={profile.last_name || ''}
        onChange={handleChange}
        placeholder="Last Name"
      />
      <input
        type="email"
        name="email"
        value={profile.email || ''}
        onChange={handleChange}
        placeholder="Email"
      />
      {/* Add inputs for all other fields */}
      <button type="submit">Save Changes</button>
    </form>
  );
}
