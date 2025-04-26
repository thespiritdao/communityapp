// src/features/identity/components/ProfileEditForm.tsx
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

export const interestsOptions = [
  { label: "Temporal Naturalism and Philosophy", value: "temporal_naturalism_philosophy", color: "#e8fcff" },
  { label: "Community Building and Collective Action", value: "community_building_collective_action", color: "#e9f9ec" },
  { label: "Decentralized Governance and Equity", value: "decentralized_governance_equity", color: "#e8fcff" },
  { label: "Spiritual Growth and Individual Actualization", value: "spiritual_growth_self_actualization", color: "#e9f9ec" },
  { label: "Environmental Stewardship and Sustainability", value: "environmental_stewardship_sustainability", color: "#e8fcff" },
  { label: "Indigenous Wisdom and Cultural Heritage", value: "indigenous_wisdom_cultural_heritage", color: "#e9f9ec" },
  { label: "Arts, Creativity, and Cultural Expression", value: "arts_creativity_cultural_expression", color: "#e8fcff" },
  { label: "Innovative Technology for Social Good", value: "innovative_technology_social_good", color: "#e9f9ec" },
  { label: "Collaborative Economics and Resource Sharing", value: "collaborative_economics_resource_sharing", color: "#e8fcff" },
  { label: "Holistic Health and Wellbeing", value: "holistic_health_wellbeing", color: "#e9f9ec" },
  { label: "Education, Knowledge, and Lifelong Learning", value: "education_knowledge_lifelong_learning", color: "#e8fcff" },
  { label: "Conscious Communication and Media", value: "conscious_communication_media", color: "#e9f9ec" },
];



export const seekingOptions = [
  { label: "Community Connection", value: "collaborative_community_connections", color: "#e8fcff" },
  { label: "Mentorship and Wisdom Sharing", value: "mentorship_wisdom_sharing", color: "#e9f9ec" },
  { label: "Contributing towards Collective Initiatives", value: "team_members_collective_initiatives", color: "#e8fcff" },
  { label: "Inspiration and Innovative Ideas", value: "inspiration_innovative_ideas", color: "#e9f9ec" },
  { label: "Educational Opportunities and Workshops", value: "educational_opportunities_workshops", color: "#e8fcff" },
  { label: "Access to Community Resources and Tools", value: "access_community_resources_tools", color: "#e9f9ec" },
  { label: "Belonging and Purposeful Engagement", value: "belonging_purposeful_engagement", color: "#e8fcff" },
  { label: "Supportive Networks and Friendships", value: "supportive_networks_friendships", color: "#e9f9ec" },
  { label: "Hope and Vision for the Future", value: "hope_vision_future", color: "#e8fcff" },
  { label: "Spiritual and Personal Growth Opportunities", value: "spiritual_personal_growth_opportunities", color: "#e9f9ec" },
  { label: "Other (please specify)", value: "other", color: "#e8fcff" },
];




const opennessOptions = [
  { label: "Low / limited", value: "low_limited" },
  { label: "Open / Available", value: "open_available" },
  { label: "Actively looking to collaborate", value: "actively_collaborate" },
];

export const involvementOptions = [
  { label: "Ambassador", value: "ambassador", color: "#e8fcff" },
  { label: "Builder / Contributor", value: "builder_contributor", color: "#e9f9ec" },
  { label: "Donor", value: "financial_support", color: "#e8fcff" },
  { label: "Eight Dignities", value: "eight_dignities", color: "#e9f9ec" },
  { label: "Events", value: "events", color: "#e8fcff" },
  { label: "Governance", value: "governance", color: "#e9f9ec" },
  { label: "Local Chapters", value: "local_chapter", color: "#e8fcff" },
  { label: "Member Onboarding", value: "member_onboarding", color: "#e9f9ec" },
  { label: "Message Spread", value: "message_spread", color: "#e8fcff" },
  { label: "Rituals", value: "rituals", color: "#e9f9ec" },
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
	  
	  // Set a file size limit (e.g., 5 MB)
	  const fileSizeLimit = 5 * 1024 * 1024; // 5 MB in bytes
	  if (selectedProfileImage.size > fileSizeLimit) {
		alert("Profile image is too large. Maximum allowed size is 5 MB.");
		return null;
	  }
	  
	  try {
		setUploadingImage(true);
		// Sanitize the file name: remove spaces and non-url-safe characters
		const sanitizedFileName = selectedProfileImage.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_.-]/g, '');
		const fileName = `${walletAddress}-${Date.now()}-${sanitizedFileName}`;
		
		// Upload the file to Supabase Storage in the public "profile_images" bucket
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
		
		// Retrieve the permanent public URL using getPublicUrl
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
              src={profileImagePreview || '/images/spiritdaosymbol.png'}
              alt="Profile Preview"
            />
          </div>

          <form onSubmit={handleSubmit(onSubmit)}>
            {/*  Section: Basic Information  */}
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

            {/*  Section: Contact Info  */}
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
                  placeholder="https://spiritdao.org"
                />
                <small style={{ fontSize: '0.85rem', color: '#555' }}>
                  Please include https://
                </small>
              </div>
            </div>

            <hr className="section-divider" />

            {/*  Section: Profile Details  */}
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
                      style={{ backgroundColor: opt.color, padding: '4px', borderRadius: '4px', display: 'flex' }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedInterests.includes(opt.value)}
                        onChange={() =>
                          handleCheckboxChange(opt.value, selectedInterests, setSelectedInterests)
                        }
                        style={{ marginRight: '4px' }}
                      />
                      <span className="option-label">{opt.label}</span>
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
                      style={{ backgroundColor: opt.color, padding: '4px', borderRadius: '4px', display: 'flex' }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedSeeking.includes(opt.value)}
                        onChange={() =>
                          handleCheckboxChange(opt.value, selectedSeeking, setSelectedSeeking)
                        }
                        style={{ marginRight: '4px' }}
                      />
                      <span className="option-label">{opt.label}</span>
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
                      <span className="option-label">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Involvement */}
              <div className="form-group">
                <label style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>Desired Involvement</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>

                  {involvementOptions.map((opt) => (
                    <label
                      key={opt.value}
                      style={{ backgroundColor: opt.color, padding: '4px', borderRadius: '4px', display: 'flex' }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedInvolvement.includes(opt.value)}
                        onChange={() =>
                          handleCheckboxChange(opt.value, selectedInvolvement, setSelectedInvolvement)
                        }
                        style={{ marginRight: '4px' }}
                      />
                      <span className="option-label">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <hr className="section-divider" />

            {/*  Section: Social Links  */}
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

            {/*  Save / Cancel Buttons  */}
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