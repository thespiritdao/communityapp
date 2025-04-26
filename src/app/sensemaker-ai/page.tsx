// src/app/sensemaker-ai/page.tsx

'use client';
import React from 'react';
import styles from './SensemakerAI.module.css';



export default function SensemakerAIPage() {
  return (
    <div className={styles.pageContainer}>      
      <div className={styles.iframeWrapper}>
        <iframe
          src="https://app.vectorshift.ai/chatbots/embedded/6761e82f769ebdaead5a73a4?openChatbot=true"
          title="SensemakerAI"
          allow="clipboard-read; clipboard-write; microphone"
          style={{
            width: '100%',
            maxWidth: '600px',  // Constrains width on larger screens
            height: '80vh',  
            border: 'none'
          }}
        />
      </div>
    </div>
  );
}