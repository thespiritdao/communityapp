// src/app/features/forum/components/ForumContainer.tsx
import React from 'react';

interface ForumContainerProps {
  children: React.ReactNode;
}

const ForumContainer: React.FC<ForumContainerProps> = ({ children }) => {
  return (
    <div className="max-w-6xl mx-auto px-4 py-8 mb-16">
      {children}
    </div>
  );
};

export default ForumContainer;
