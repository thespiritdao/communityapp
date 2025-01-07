// src/identity/components/ProfileEditForm.tsx
import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { supabase } from '../utils/supabaseClient';

type ProfileData = {
  wallet_address?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  profile_picture?: string | null;
  date_of_birth?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  bio?: string | null;
  interests?: string | null; // comma-separated
  seeking?: string | null;   // comma-separated
  occupation?: string | null;
  skills_expertise?: string | null; // now superpowers, just label changed
  workplace_organization?: string | null;
  projects_or_initiatives?: string | null;
  linkedin?: string | null;
  twitter?: string | null;
  instagram?: string | null;
  facebook?: string | null;
  tiktok?: string | null;
  discord?: string | null;
  github?: string | null;
  youtube?: string | null;
  twitch?: string | null;
  website?: string | null;
  // identity_verification, notification_preferences, badges, reputation removed
  open_to_connect?: string | null; // single select
  desired_involvement?: string | null; // comma-separated
};

const interestsOptions = [
  { label: "Health and Wellness", value: "health_and_wellness", color: "#FFC0CB" },
  { label: "Spirituality, Personal Development & Religion", value: "spirituality", color: "#E6E6FA" },
  { label: "Justice, Sovereignty, & Governance", value: "justice", color: "#FAFAD2" },
  { label: "Science, Tech, Energy", value: "science_tech_energy", color: "#D3F9D8" },
  { label: "Housing, infrastructure, transport", value: "housing_infrastructure", color: "#AEDFF7" },
  { label: "Indigenous and Ancient Wisdom", value: "indigenous_wisdom", color: "#FFE4B5" },
  { label: "Arts, Culture, and Music", value: "arts_culture_music", color: "#FFDAB9" },
  { label: "Resource Sharing, Economics, and Trade", value: "resource_sharing", color: "#B0E0E6" },
  { label: "Learning and Education", value: "learning_education", color: "#F5DEB3" },
  { label: "Media and Communication", value: "media_communication", color: "#E0FFFF" },
  { label: "Food, Environment, and Wildlife", value: "food_environment", color: "#98FB98" },
  { label: "Love and Sexuality", value: "love_sexuality", color: "#FFB6C1" },
];

const seekingOptions = [
  { label: "Like-minded peers", value: "like_minded_peers", color: "#FFC0CB" },
  { label: "Education", value: "education", color: "#E6E6FA" },
  { label: "Expert Knowledge", value: "expert_knowledge", color: "#FAFAD2" },
  { label: "New friends", value: "new_friends", color: "#D3F9D8" },
  { label: "Partners for my project", value: "partners_project", color: "#AEDFF7" },
  { label: "Team members for my project", value: "team_members_project", color: "#FFE4B5" },
  { label: "Inspiring Projects", value: "inspiring_projects", color: "#FFDAB9" },
  { label: "Inspiring Content", value: "inspiring_content", color: "#B0E0E6" },
  { label: "Belonging to the Tribe", value: "belonging_tribe", color: "#F5DEB3" },
  { label: "Hope", value: "hope", color: "#E0FFFF" },
  { label: "Other", value: "other", color: "#98FB98" },
];

const opennessOptions = [
  { label: "Low / limited", value: "low_limited" },
  { label: "Open / Available", value: "open_available" },
  { label: "Actively looking to collaborate", value: "actively_collaborate" },
];

const involvementOptions = [
  { label: "Active Contributor (to community platform)", value: "contributor_platform", color: "#E6E6FA" },
  { label: "Active contributor (to the organization)", value: "contributor_organization", color: "#FAFAD2" },
  { label: "Ambassador", value: "ambassador", color: "#FFDAB9" },
  { label: "Investor / Guardian", value: "investor_guardian", color: "#B0E0E6" },
  { label: "Network Member", value: "network_member", color: "#F5DEB3" },
  { label: "Support with Community and Matchmaking", value: "support_community", color: "#E0FFFF" },
  { label: "Receive support for my project", value: "receive_support", color: "#98FB98" },
];

interface ProfileEditFormProps {
  initialData: ProfileData;
  onSave: (data: ProfileData) => Promise<void>;
  onCancel: () => void;
  refetch?: () => Promise<void>;
}

export function ProfileEditForm({ initialData, onSave, onCancel }: ProfileEditFormProps) {
  const initialInterests = initialData.interests ? initialData.interests.split(',') : [];
  const initialSeeking = initialData.seeking ? initialData.seeking.split(',') : [];
  const initialInvolvement = initialData.desired_involvement ? initialData.desired_involvement.split(',') : [];

  const [selectedInterests, setSelectedInterests] = useState<string[]>(initialInterests);
  const [selectedSeeking, setSelectedSeeking] = useState<string[]>(initialSeeking);
  const [selectedInvolvement, setSelectedInvolvement] = useState<string[]>(initialInvolvement);
  const [selectedOpenness, setSelectedOpenness] = useState<string>(initialData.open_to_connect || '');

  const { register, handleSubmit } = useForm<ProfileData>({
    defaultValues: initialData
  });

  const [selectedProfileImage, setSelectedProfileImage] = useState<File | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [profileImagePreview, setProfileImagePreview] = useState<string | null>(initialData.profile_picture || null);

  const handleCheckboxChange = (
    value: string,
    selectedArray: string[],
    setSelected: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    if (selectedArray.includes(value)) {
      setSelected(selectedArray.filter(v => v !== value));
    } else {
      setSelected([...selectedArray, value]);
    }
  };

  const handleRadioChange = (value: string) => {
    setSelectedOpenness(value);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setSelectedProfileImage(file);
    if (file) {
      // Show preview
      const reader = new FileReader();
      reader.onload = (evt) => {
        if (evt.target?.result) {
          setProfileImagePreview(evt.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    } else {
      setProfileImagePreview(null);
    }
  };

  const onSubmit = async (data: ProfileData) => {
    data.interests = selectedInterests.join(',');
    data.seeking = selectedSeeking.join(',');
    data.desired_involvement = selectedInvolvement.join(',');
    data.open_to_connect = selectedOpenness;

    // Fields we decided not to use
    delete data.identity_verification;
    delete data.notification_preferences;
    delete data.badges;
    delete data.reputation;

    // If a new file is selected, upload it to Supabase from 'profile_images' bucket
    if (selectedProfileImage) {
      setUploadingImage(true);
      const fileName = `${data.wallet_address || 'user'}-${Date.now()}-${selectedProfileImage.name}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('profile_images')
        .upload(fileName, selectedProfileImage, {
          upsert: true
        });

      setUploadingImage(false);

      if (uploadError) {
        console.error('Error uploading image:', uploadError);
        // Handle error gracefully (e.g., show a toast)
      } else if (uploadData) {
        // Get public URL from 'profile_images' bucket
        const { data: publicURLData } = supabase.storage
          .from('profile_images')
          .getPublicUrl(fileName);

        if (publicURLData) {
          data.profile_picture = publicURLData.publicUrl;
        }
      }
    }

    await onSave(data);
	refetch();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col">
      {/* Basic Information Section */}
      <div className="form-section">
        <h3 className="form-section-header">Basic Information</h3>
        <div className="form-group">
          <label>First Name</label>
          <input type="text" {...register('first_name')} className="input" />
        </div>

        <div className="form-group">
          <label>Last Name</label>
          <input type="text" {...register('last_name')} className="input" />
        </div>

        <div className="form-group">
          <label>Profile Picture</label>
          <input
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="input"
            style={{ marginTop: '0.5rem' }}
          />
          {profileImagePreview && (
            <div style={{ marginTop: '0.5rem' }}>
              <img src={profileImagePreview} alt="Preview" style={{ maxWidth: '150px', borderRadius: '8px' }} />
            </div>
          )}
          {uploadingImage && <p>Uploading image, please wait...</p>}
        </div>

        <div className="form-group">
          <label>Date of Birth</label>
          <input type="date" {...register('date_of_birth')} className="input" style={{ marginTop: '0.5rem' }} />
        </div>
      </div>

      {/* Contact Information Section */}
      <div className="form-section">
        <h3 className="form-section-header">Contact Information</h3>
        <div className="form-group">
          <label>Email</label>
          <input type="email" {...register('email')} className="input" />
        </div>

        <div className="form-group">
          <label>Phone</label>
          <input type="tel" {...register('phone')} className="input" style={{ marginTop: '0.5rem' }} />
        </div>

        <div className="form-group">
          <label>Address</label>
          <input type="text" {...register('address')} className="input" />
        </div>

        <div className="form-group">
          <label>Website</label>
          <input type="url" {...register('website')} className="input" style={{ marginTop: '0.5rem' }} placeholder="https://yourwebsite.com" />
          <small style={{ fontSize: '0.85rem', color: '#555' }}>Please include https://</small>
        </div>
      </div>

      {/* Profile Details Section */}
      <div className="form-section">
        <h3 className="form-section-header">Profile Details & Preferences</h3>
        <div className="form-group">
          <label>Bio</label>
          <textarea {...register('bio')} className="input" style={{ height: '150px', marginTop: '0.5rem' }}></textarea>
        </div>

        <div className="form-group">
          <label>Occupation</label>
          <input type="text" {...register('occupation')} className="input" />
        </div>

        <div className="form-group">
          <label>Superpowers (formerly Skills/Expertise)</label>
          <textarea {...register('skills_expertise')} className="input" style={{ height: '150px', marginTop: '0.5rem' }}></textarea>
        </div>

        <div className="form-group">
          <label>Workplace/Organization</label>
          <input type="text" {...register('workplace_organization')} className="input" />
        </div>

        <div className="form-group">
          <label>Projects or Initiatives</label>
          <textarea {...register('projects_or_initiatives')} className="input" style={{ height: '150px', marginTop: '0.5rem' }}></textarea>
        </div>

        {/* Interests Section with Dropdown */}
        <div className="form-group">
          <details>
            <summary style={{ cursor: 'pointer', marginBottom: '0.5rem' }}>Interests</summary>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {interestsOptions.map(opt => (
                <label key={opt.value} style={{ backgroundColor: opt.color, padding: '4px', borderRadius: '4px' }}>
                  <input
                    type="checkbox"
                    checked={selectedInterests.includes(opt.value)}
                    onChange={() => handleCheckboxChange(opt.value, selectedInterests, setSelectedInterests)}
                    style={{ marginRight: '4px' }}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </details>
        </div>

        {/* Seeking Section with Dropdown */}
        <div className="form-group">
          <details>
            <summary style={{ cursor: 'pointer', marginBottom: '0.5rem' }}>Seeking</summary>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {seekingOptions.map(opt => (
                <label key={opt.value} style={{ backgroundColor: opt.color, padding: '4px', borderRadius: '4px' }}>
                  <input
                    type="checkbox"
                    checked={selectedSeeking.includes(opt.value)}
                    onChange={() => handleCheckboxChange(opt.value, selectedSeeking, setSelectedSeeking)}
                    style={{ marginRight: '4px' }}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </details>
        </div>

        {/* Openness to Connect dropdown (single choice) */}
        <div className="form-group">
          <details>
            <summary style={{ cursor: 'pointer', marginBottom: '0.5rem' }}>Openness to Connect</summary>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '0.5rem' }}>
              {opennessOptions.map(opt => (
                <label key={opt.value}>
                  <input
                    type="radio"
                    name="open_to_connect"
                    value={opt.value}
                    checked={selectedOpenness === opt.value}
                    onChange={() => handleRadioChange(opt.value)}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </details>
        </div>

        {/* Desired Involvement dropdown (multiple choice) */}
        <div className="form-group">
          <details>
            <summary style={{ cursor: 'pointer', marginBottom: '0.5rem' }}>Desired Involvement</summary>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '0.5rem' }}>
              {involvementOptions.map(opt => (
                <label key={opt.value} style={{ backgroundColor: opt.color, padding: '4px', borderRadius: '4px' }}>
                  <input
                    type="checkbox"
                    checked={selectedInvolvement.includes(opt.value)}
                    onChange={() => handleCheckboxChange(opt.value, selectedInvolvement, setSelectedInvolvement)}
                    style={{ marginRight: '4px' }}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </details>
        </div>
      </div>

      {/* Social Links Section */}
      <div className="form-section">
        <h3 className="form-section-header">Social Links</h3>
        <div className="form-group">
          <label>LinkedIn</label>
          <input type="text" {...register('linkedin')} className="input" />
        </div>
        <div className="form-group">
          <label>Twitter</label>
          <input type="text" {...register('twitter')} className="input" />
        </div>
        <div className="form-group">
          <label>Instagram</label>
          <input type="text" {...register('instagram')} className="input" />
        </div>
        <div className="form-group">
          <label>Facebook</label>
          <input type="text" {...register('facebook')} className="input" />
        </div>
        <div className="form-group">
          <label>TikTok</label>
          <input type="text" {...register('tiktok')} className="input" />
        </div>
        <div className="form-group">
          <label>Discord</label>
          <input type="text" {...register('discord')} className="input" />
        </div>
        <div className="form-group">
          <label>GitHub</label>
          <input type="text" {...register('github')} className="input" />
        </div>
        <div className="form-group">
          <label>YouTube</label>
          <input type="text" {...register('youtube')} className="input" />
        </div>
        <div className="form-group">
          <label>Twitch</label>
          <input type="text" {...register('twitch')} className="input" />
        </div>
      </div>

      {/* Additional Settings */}
      <div className="form-section">
        <h3 className="form-section-header">Additional Settings</h3>
      </div>

      <div className="flex justify-end space-x-2 mt-4">
        <button type="button" onClick={onCancel} className="button button-cancel">Cancel</button>
        <button type="submit" className="button button-enter">Save Changes</button>
      </div>
    </form>
  );
}
