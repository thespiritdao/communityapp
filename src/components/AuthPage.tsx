import { ConnectWallet } from '@/wallet/components/ConnectWallet';

const AuthPage = () => {
  return (
    <div className="auth-page flex flex-col items-center justify-center h-full bg-gray-100 px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Welcome to SpiritDAO</h1>
      <p className="mb-4">To continue, please connect your wallet:</p>
      <ConnectWallet
        className="text-white px-4 py-2 rounded-md hover:bg-[#254A40]"
        style={{ backgroundColor: '#2F5D50' }}
      />
    </div>
  );
};

export default AuthPage;
