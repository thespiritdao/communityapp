'use client';
import React from 'react';
import { ConnectWallet, Wallet } from '@coinbase/onchainkit/wallet';
import { useConnect } from 'wagmi';
import './styles/walletStyles.css';
import App from '../App'; 

const WalletPage: React.FC = () => {
  // Accessing connectors to create a new wallet or connect
  const { connectors, connect } = useConnect();

  // Join (Create Wallet) button handler
  const handleCreateWallet = () => {
    const coinbaseWalletConnector = connectors.find(
      (connector) => connector.id === 'coinbaseWalletSDK'
    );
    if (coinbaseWalletConnector) {
      connect({ connector: coinbaseWalletConnector });
    }
  };

  // Login button handler using ConnectWallet from OnchainKit
  const handleLogin = () => {
    // Simply using the ConnectWallet component, which can be wrapped for login purposes
  };

  return (
    <div className="wallet-page">
      <div className="wallet-container">
        <h1 className="wallet-title">SpiritDAO Wallet Access</h1>
        <div className="wallet-buttons">
          <button
            className="wallet-button"
            onClick={handleCreateWallet}
          >
            Join
          </button>
          <button
            className="wallet-button secondary"
            onClick={handleLogin}
          >
            Login
          </button>
        </div>
      </div>
    </div>
  );
};

export default WalletPage;
