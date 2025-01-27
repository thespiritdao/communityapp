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
  skills_expertise?: string | null; // "superpowers" - label changed
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
  initialData: ProfileData; // Typed object for the user's profile data
  walletAddress: string; // The user's wallet address
  onSave: (data: ProfileData) => Promise<void>; // Function that handles saving the updated profile
  onCancel: () => void; // Function that cancels editing the profile
}


export function ProfileEditForm({
  initialData,
  onSave,
  onCancel,
  walletAddress,
}: ProfileEditFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ProfileData>({
    defaultValues: initialData,
  });

  // Split out existing comma-separated fields
  const [selectedInterests, setSelectedInterests] = useState<string[]>(
    initialData.interests ? initialData.interests.split(',') : []
  );
  const [selectedSeeking, setSelectedSeeking] = useState<string[]>(
    initialData.seeking ? initialData.seeking.split(',') : []
  );
  const [selectedInvolvement, setSelectedInvolvement] = useState<string[]>(
    initialData.desired_involvement ? initialData.desired_involvement.split(',') : []
  );
  const [selectedOpenness, setSelectedOpenness] = useState<string>(
    initialData.open_to_connect || ''
  );
  const [profileImagePreview, setProfileImagePreview] = useState<string | null>(
    initialData.profile_picture || null
  );
  const [selectedProfileImage, setSelectedProfileImage] = useState<File | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  // Checkbox & radio handlers
  const handleCheckboxChange = (
    value: string,
    selectedArray: string[],
    setSelected: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    if (selectedArray.includes(value)) {
      setSelected(selectedArray.filter((v) => v !== value));
    } else {
      setSelected([...selectedArray, value]);
    }
  };

  const handleRadioChange = (value: string) => {
    setSelectedOpenness(value);
  };

  // Image upload
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setSelectedProfileImage(file);
    if (file) {
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

  const uploadProfileImage = async () => {
    if (!selectedProfileImage || !walletAddress) {
      console.warn("No file selected or wallet address missing.");
      return null;
    }
    try {
      setUploadingImage(true);
      const fileName = `${walletAddress}-${Date.now()}-${selectedProfileImage.name}`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from("profile_images")
        .upload(fileName, selectedProfileImage, {
          contentType: selectedProfileImage.type,
          upsert: true,
        });

      if (uploadError) {
        console.error("Error uploading image:", uploadError);
        return null;
      }

      // Get public URL
      const { data: publicUrlData, error: publicUrlError } = supabase.storage
        .from("profile_images")
        .getPublicUrl(fileName);

      if (publicUrlError) {
        console.error("Error fetching public URL:", publicUrlError);
        return null;
      }

      return publicUrlData?.publicUrl || null;
    } catch (err) {
      console.error("Unexpected error during image upload:", err);
      return null;
    } finally {
      setUploadingImage(false);
    }
  };

  // Handle final form submission
  const onSubmit = async (data: ProfileData) => {
    // Attempt to upload the profile image if one is selected
    const imageUrl = await uploadProfileImage();
    if (imageUrl) {
      data.profile_picture = imageUrl;
    }

    // Re-attach the wallet address
    data.wallet_address = walletAddress;

    // Convert checkboxes back into comma-separated strings
    data.interests = selectedInterests.join(',');
    data.seeking = selectedSeeking.join(',');
    data.desired_involvement = selectedInvolvement.join(',');
    data.open_to_connect = selectedOpenness;

    await onSave(data);
  };


  return (
    <div className="profile-modal-overlay">
      <div className="profile-modal-container">
        <button className="close-button" onClick={onCancel}>
          &times;
        </button>

        <div className="profile-content">
          {/* If you want a header avatar above the form: */}
          <div className="profile-image-container">
            <img
              className="profile-image"
              src={profileImagePreview || '/default-avatar.png'}
              alt="Profile Preview"
            />
          </div>

          <form onSubmit={handleSubmit(onSubmit)}>
            {/* ===================== Section: Basic Information ===================== */}
            <div className="profile-section">
              <h3>Basic Information</h3>
              
              <div className="form-group">
                <label>Profile Picture</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="input"
                />
                {profileImagePreview && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <img
                      src={profileImagePreview}
                      alt="Preview"
                      style={{ maxWidth: '150px', borderRadius: '8px' }}
                    />
                  </div>
                )}
                {uploadingImage && <p>Uploading image, please wait...</p>}
              </div>

              <div className="form-group">
                <label>First Name</label>
                <input
                  type="text"
                  className="input"
                  {...register('first_name', { required: "First name is required" })}
                />
                {errors.first_name && <p>{errors.first_name.message}</p>}
              </div>

              <div className="form-group">
                <label>Last Name</label>
                <input
                  type="text"
                  className="input"
                  {...register('last_name', { required: "Last name is required" })}
                />
                {errors.last_name && <p>{errors.last_name.message}</p>}
              </div>

              <div className="form-group">
                <label>Date of Birth</label>
                <input
                  type="date"
                  className="input"
                  {...register('date_of_birth')}
                />
              </div>
            </div>

            <hr className="section-divider" />

            {/* ===================== Section: Contact Info ===================== */}
            <div className="profile-section">
              <h3>Contact Information</h3>
              <div className="form-group">
                <label>Email</label>
                <input type="email" className="input" {...register('email')} />
              </div>

              <div className="form-group">
                <label>Phone</label>
                <input type="tel" className="input" {...register('phone')} />
              </div>

              <div className="form-group">
                <label>Address</label>
                <input type="text" className="input" {...register('address')} />
              </div>

              <div className="form-group">
                <label>Website</label>
                <input
                  type="url"
                  className="input"
                  {...register('website')}
                  placeholder="https://yourwebsite.com"
                />
                <small style={{ fontSize: '0.85rem', color: '#555' }}>
                  Please include https://
                </small>
              </div>
            </div>

            <hr className="section-divider" />

            {/* ===================== Section: Profile Details ===================== */}
            <div className="profile-section">
              <h3>Profile Details & Preferences</h3>

              <div className="form-group">
                <label>Bio</label>
                <textarea className="input" style={{ height: '100px' }} {...register('bio')} />
              </div>

              <div className="form-group">
                <label>Occupation</label>
                <input type="text" className="input" {...register('occupation')} />
              </div>

              <div className="form-group">
                <label>Superpowers (Skills/Expertise)</label>
                <textarea
                  className="input"
                  style={{ height: '80px' }}
                  {...register('skills_expertise')}
                />
              </div>

              <div className="form-group">
                <label>Workplace/Organization</label>
                <input
                  type="text"
                  className="input"
                  {...register('workplace_organization')}
                />
              </div>

              <div className="form-group">
                <label>Projects or Initiatives</label>
                <textarea
                  className="input"
                  style={{ height: '80px' }}
                  {...register('projects_or_initiatives')}
                />
              </div>

              {/* Interests */}
              <div className="form-group">
                <label style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>Interests</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {interestsOptions.map((opt) => (
                    <label
                      key={opt.value}
                      style={{ backgroundColor: opt.color, padding: '4px', borderRadius: '4px' }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedInterests.includes(opt.value)}
                        onChange={() =>
                          handleCheckboxChange(opt.value, selectedInterests, setSelectedInterests)
                        }
                        style={{ marginRight: '4px' }}
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>

              {/* Seeking */}
              <div className="form-group">
                <label style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>Seeking</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {seekingOptions.map((opt) => (
                    <label
                      key={opt.value}
                      style={{ backgroundColor: opt.color, padding: '4px', borderRadius: '4px' }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedSeeking.includes(opt.value)}
                        onChange={() =>
                          handleCheckboxChange(opt.value, selectedSeeking, setSelectedSeeking)
                        }
                        style={{ marginRight: '4px' }}
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>

              {/* Openness */}
              <div className="form-group">
                <label style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>Openness to Connect</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {opennessOptions.map((opt) => (
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
              </div>

              {/* Involvement */}
              <div className="form-group">
                <label style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>Desired Involvement</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {involvementOptions.map((opt) => (
                    <label
                      key={opt.value}
                      style={{ backgroundColor: opt.color, padding: '4px', borderRadius: '4px' }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedInvolvement.includes(opt.value)}
                        onChange={() =>
                          handleCheckboxChange(opt.value, selectedInvolvement, setSelectedInvolvement)
                        }
                        style={{ marginRight: '4px' }}
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <hr className="section-divider" />

            {/* ===================== Section: Social Links ===================== */}
            <div className="profile-section">
              <h3>Social Links</h3>
              <div className="form-group">
                <label>LinkedIn</label>
                <input type="text" className="input" {...register('linkedin')} />
              </div>
              <div className="form-group">
                <label>Twitter</label>
                <input type="text" className="input" {...register('twitter')} />
              </div>
              <div className="form-group">
                <label>Instagram</label>
                <input type="text" className="input" {...register('instagram')} />
              </div>
              <div className="form-group">
                <label>Facebook</label>
                <input type="text" className="input" {...register('facebook')} />
              </div>
              <div className="form-group">
                <label>TikTok</label>
                <input type="text" className="input" {...register('tiktok')} />
              </div>
              <div className="form-group">
                <label>Discord</label>
                <input type="text" className="input" {...register('discord')} />
              </div>
              <div className="form-group">
                <label>GitHub</label>
                <input type="text" className="input" {...register('github')} />
              </div>
              <div className="form-group">
                <label>YouTube</label>
                <input type="text" className="input" {...register('youtube')} />
              </div>
              <div className="form-group">
                <label>Twitch</label>
                <input type="text" className="input" {...register('twitch')} />
              </div>
            </div>

            <hr className="section-divider" />

            {/* ===================== Save / Cancel Buttons ===================== */}
            <div className="form-buttons">
              <button type="submit" disabled={uploadingImage}>
                Save
              </button>
              <button type="button" onClick={onCancel}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}