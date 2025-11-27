// src/app/privacy/page.tsx
'use client';

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto bg-white shadow-sm rounded-lg p-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Privacy Policy
        </h1>
        <p className="text-sm text-gray-600 mb-8">
          Last Updated: November 25, 2025
        </p>

        {/* Introduction */}
        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            1. Introduction
          </h2>
          <p className="text-gray-700 mb-4">
            Welcome to SpiritDAO, a 501(c)(3) religious organization based in
            the United States. SpiritDAO ("we," "our," or "us") operates as a
            decentralized autonomous organization serving as a platform for
            communities and members to collaborate, govern, and participate in
            various activities.
          </p>
          <p className="text-gray-700 mb-4">
            This Privacy Policy explains how we collect, use, disclose, and
            safeguard your information when you use our platform, including our
            web application, smart contracts, and related services
            (collectively, the "Platform"). Please read this Privacy Policy
            carefully.
          </p>
          <p className="text-gray-700 font-medium">
            BY USING THE PLATFORM, YOU AGREE TO THE COLLECTION AND USE OF
            INFORMATION IN ACCORDANCE WITH THIS POLICY.
          </p>
        </section>

        {/* Information We Collect */}
        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            2. Information We Collect
          </h2>

          <h3 className="text-xl font-semibold text-gray-800 mb-3">
            2.1 Blockchain Data
          </h3>
          <p className="text-gray-700 mb-4">
            As a decentralized platform built on blockchain technology, certain
            information is inherently public and recorded on the blockchain,
            including:
          </p>
          <ul className="list-disc pl-6 mb-4 text-gray-700">
            <li>Wallet addresses you connect to the Platform</li>
            <li>Transaction history and smart contract interactions</li>
            <li>Token holdings ($SYSTEM and $SELF tokens)</li>
            <li>Voting records and governance participation</li>
            <li>Pod memberships and community affiliations</li>
            <li>NFT ownership and event attendance records</li>
          </ul>

          <h3 className="text-xl font-semibold text-gray-800 mb-3">
            2.2 Profile Information
          </h3>
          <p className="text-gray-700 mb-4">
            When you create or update your profile, we may collect:
          </p>
          <ul className="list-disc pl-6 mb-4 text-gray-700">
            <li>Full Names</li>
            <li>Profile pictures and avatars</li>
            <li>Bio and description text</li>
            <li>Social media links (optional)</li>
            <li>Skills and interests (optional)</li>
          </ul>

          <h3 className="text-xl font-semibold text-gray-800 mb-3">
            2.3 Usage Data
          </h3>
          <p className="text-gray-700 mb-4">
            We automatically collect certain information when you access the
            Platform:
          </p>
          <ul className="list-disc pl-6 mb-4 text-gray-700">
            <li>IP address and device information</li>
            <li>Browser type and version</li>
            <li>Pages visited and time spent on pages</li>
            <li>Referral sources</li>
            <li>Device identifiers and operating system</li>
          </ul>

          <h3 className="text-xl font-semibold text-gray-800 mb-3">
            2.4 Communications
          </h3>
          <p className="text-gray-700 mb-4">
            When you interact with the Platform, we may collect:
          </p>
          <ul className="list-disc pl-6 mb-4 text-gray-700">
            <li>Forum posts and comments</li>
            <li>Chat messages within pods</li>
            <li>Proposal descriptions and votes</li>
            <li>Bounty submissions and bids</li>
            <li>Support requests and feedback</li>
          </ul>

          <h3 className="text-xl font-semibold text-gray-800 mb-3">
            2.5 Event Participation
          </h3>
          <p className="text-gray-700 mb-4">
            When you register for or attend events:
          </p>
          <ul className="list-disc pl-6 mb-4 text-gray-700">
            <li>Event registration details</li>
            <li>Check-in records and attendance confirmations</li>
            <li>Event completion NFT ownership</li>
          </ul>
        </section>

        {/* How We Use Information */}
        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            3. How We Use Your Information
          </h2>
          <p className="text-gray-700 mb-4">
            We use the collected information for the following purposes:
          </p>
          <ul className="list-disc pl-6 mb-4 text-gray-700">
            <li>
              <strong>Platform Operations:</strong> To provide, maintain, and
              improve the Platform's functionality
            </li>
            <li>
              <strong>Identity Verification:</strong> To verify your identity
              through wallet connections and Basename
            </li>
            <li>
              <strong>Governance:</strong> To enable voting, proposal creation,
              and DAO participation
            </li>
            <li>
              <strong>Token Management:</strong> To facilitate $SYSTEM and $SELF
              token transactions and redemptions
            </li>
            <li>
              <strong>Community Features:</strong> To enable pod creation, forum
              discussions, chat, and events
            </li>
            <li>
              <strong>Bounty System:</strong> To manage bounty creation, bids,
              assignments, and payments
            </li>
            <li>
              <strong>Security:</strong> To detect and prevent fraud, abuse, and
              security incidents
            </li>
            <li>
              <strong>Analytics:</strong> To understand Platform usage and
              improve user experience
            </li>
            <li>
              <strong>Notifications:</strong> To send important updates about
              proposals, events, and platform changes
            </li>
            <li>
              <strong>Legal Compliance:</strong> To comply with applicable laws,
              regulations, and legal processes
            </li>
          </ul>
        </section>

        {/* Blockchain and Decentralization */}
        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            4. Blockchain and Decentralization
          </h2>
          <p className="text-gray-700 mb-4">
            <strong>Important:</strong> Blockchain data is public, permanent,
            and immutable. Once information is recorded on the blockchain, it
            cannot be deleted or modified, even if you delete your account or
            request data removal.
          </p>
          <p className="text-gray-700 mb-4">This includes:</p>
          <ul className="list-disc pl-6 mb-4 text-gray-700">
            <li>All transactions involving $SYSTEM and $SELF tokens</li>
            <li>Governance votes and proposal participation</li>
            <li>NFT minting and transfers (event attendance, memberships)</li>
            <li>Smart contract interactions</li>
            <li>Pod memberships and role assignments</li>
          </ul>
          <p className="text-gray-700">
            We have no ability to modify or delete blockchain records. This is
            an inherent characteristic of blockchain technology.
          </p>
        </section>

        {/* Token Privacy */}
        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            5. Token Privacy and Financial Information
          </h2>

          <h3 className="text-xl font-semibold text-gray-800 mb-3">
            5.1 $SYSTEM Token
          </h3>
          <p className="text-gray-700 mb-4">
            $SYSTEM is our primary governance and utility token with the
            following characteristics:
          </p>
          <ul className="list-disc pl-6 mb-4 text-gray-700">
            <li>
              <strong>Fiat-Backed:</strong> Tied to our organization's fiat bank
              account
            </li>
            <li>
              <strong>Redeemable:</strong> May be redeemed for cash in the
              future (subject to terms and availability)
            </li>
            <li>
              <strong>Transferrable:</strong> Can be transferred within the
              Platform to other users
            </li>
            <li>
              <strong>Public Ledger:</strong> All $SYSTEM transactions are
              visible on the blockchain
            </li>
            <li>
              <strong>Financial Record:</strong> Your $SYSTEM holdings and
              transactions may be used for financial reporting
            </li>
          </ul>

          <h3 className="text-xl font-semibold text-gray-800 mb-3">
            5.2 $SELF Token
          </h3>
          <p className="text-gray-700 mb-4">
            $SELF is our time-bound community token with these characteristics:
          </p>
          <ul className="list-disc pl-6 mb-4 text-gray-700">
            <li>
              <strong>Time-Bound:</strong> Expires after a specified period
            </li>
            <li>
              <strong>No Exchange Value:</strong> Cannot be redeemed for cash or
              exchanged for other tokens
            </li>
            <li>
              <strong>Non-Transferrable:</strong> Cannot be transferred to other
              users
            </li>
            <li>
              <strong>Utility Only:</strong> Used solely for platform features
              and community participation
            </li>
            <li>
              <strong>Public Record:</strong> Holdings and usage are visible on
              the blockchain
            </li>
          </ul>

          <h3 className="text-xl font-semibold text-gray-800 mb-3">
            5.3 Redemption Data
          </h3>
          <p className="text-gray-700 mb-4">
            If you choose to redeem $SYSTEM tokens for fiat currency in the
            future, we may collect:
          </p>
          <ul className="list-disc pl-6 mb-4 text-gray-700">
            <li>Banking information for redemption transfers</li>
            <li>Identity verification documents (KYC/AML compliance)</li>
            <li>Tax identification information as required by law</li>
            <li>Transaction records for financial reporting</li>
          </ul>
        </section>

        {/* Data Sharing */}
        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            6. How We Share Your Information
          </h2>

          <h3 className="text-xl font-semibold text-gray-800 mb-3">
            6.1 Public Information
          </h3>
          <p className="text-gray-700 mb-4">
            The following information is public by default:
          </p>
          <ul className="list-disc pl-6 mb-4 text-gray-700">
            <li>All blockchain transactions and smart contract interactions</li>
            <li>Profile information (unless you choose private settings)</li>
            <li>Forum posts and governance proposals</li>
            <li>Voting records and participation</li>
            <li>Pod memberships and community affiliations</li>
            <li>Event attendance (NFT ownership)</li>
          </ul>

          <h3 className="text-xl font-semibold text-gray-800 mb-3">
            6.2 Service Providers
          </h3>
          <p className="text-gray-700 mb-4">
            We share information with third-party service providers who assist
            in:
          </p>
          <ul className="list-disc pl-6 mb-4 text-gray-700">
            <li>
              <strong>Hosting:</strong> Supabase (database), Vercel/cloud
              hosting
            </li>
            <li>
              <strong>Blockchain Infrastructure:</strong> Coinbase, Infura, Base
              network
            </li>
            <li>
              <strong>Analytics:</strong> Usage analytics and performance
              monitoring
            </li>
            <li>
              <strong>AI Services:</strong> OpenAI, Anthropic, Pinecone for AI
              features
            </li>
            <li>
              <strong>Communication:</strong> Email delivery services
            </li>
            <li>
              <strong>Payment Processing:</strong> For $SYSTEM redemption
              (future)
            </li>
          </ul>

          <h3 className="text-xl font-semibold text-gray-800 mb-3">
            6.3 Legal Requirements
          </h3>
          <p className="text-gray-700 mb-4">
            We may disclose your information if required by law or to:
          </p>
          <ul className="list-disc pl-6 mb-4 text-gray-700">
            <li>
              Comply with legal obligations, court orders, or government
              requests
            </li>
            <li>Enforce our Terms of Service</li>
            <li>Protect our rights, property, or safety</li>
            <li>Prevent fraud or illegal activities</li>
            <li>Comply with tax and financial reporting requirements</li>
          </ul>

          <h3 className="text-xl font-semibold text-gray-800 mb-3">
            6.4 Community Members
          </h3>
          <p className="text-gray-700 mb-4">
            Within pods and communities, certain information is shared with
            other members:
          </p>
          <ul className="list-disc pl-6 mb-4 text-gray-700">
            <li>Chat messages within pod channels</li>
            <li>Bounty submissions and bids</li>
            <li>Event attendance records</li>
            <li>Treasury and financial activities (for pod members)</li>
          </ul>
        </section>

        {/* Data Security */}
        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            7. Data Security
          </h2>
          <p className="text-gray-700 mb-4">
            We implement reasonable security measures to protect your
            information, including:
          </p>
          <ul className="list-disc pl-6 mb-4 text-gray-700">
            <li>Encrypted data transmission (HTTPS/TLS)</li>
            <li>Secure database storage with access controls</li>
            <li>Regular security audits and updates</li>
            <li>Rate limiting and DDoS protection</li>
            <li>Smart contract security audits (for critical contracts)</li>
          </ul>
          <p className="text-gray-700 mb-4">
            However, no method of transmission or storage is 100% secure. You
            acknowledge that:
          </p>
          <ul className="list-disc pl-6 mb-4 text-gray-700">
            <li>Blockchain transactions are irreversible and permanent</li>
            <li>
              You are solely responsible for securing your wallet private keys
            </li>
            <li>Lost or stolen private keys cannot be recovered</li>
            <li>We cannot reverse or refund blockchain transactions</li>
          </ul>
        </section>

        {/* User Rights */}
        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            8. Your Privacy Rights
          </h2>

          <h3 className="text-xl font-semibold text-gray-800 mb-3">
            8.1 Access and Correction
          </h3>
          <p className="text-gray-700 mb-4">
            You may access and update your profile information through the
            Platform. However, blockchain data cannot be modified or deleted.
          </p>

          <h3 className="text-xl font-semibold text-gray-800 mb-3">
            8.2 Data Deletion Requests
          </h3>
          <p className="text-gray-700 mb-4">
            You may request deletion of off-chain data (profile info, chat
            messages) by contacting us. Please note:
          </p>
          <ul className="list-disc pl-6 mb-4 text-gray-700">
            <li>Blockchain data cannot be deleted (permanent public record)</li>
            <li>Some data may be retained for legal/compliance requirements</li>
            <li>Deletion may limit or prevent Platform access</li>
            <li>
              Community content (forum posts) may be anonymized instead of
              deleted
            </li>
          </ul>

          <h3 className="text-xl font-semibold text-gray-800 mb-3">
            8.3 Opt-Out Rights
          </h3>
          <p className="text-gray-700 mb-4">You may opt out of:</p>
          <ul className="list-disc pl-6 mb-4 text-gray-700">
            <li>Email notifications (via account settings)</li>
            <li>Analytics cookies (via browser settings)</li>
            <li>Public profile visibility (via privacy settings)</li>
          </ul>

          <h3 className="text-xl font-semibold text-gray-800 mb-3">
            8.4 State-Specific Rights
          </h3>
          <p className="text-gray-700 mb-4">
            Residents of certain states (California, Virginia, Colorado, etc.)
            may have additional rights under state privacy laws. Contact us to
            exercise these rights.
          </p>
        </section>

        {/* Children's Privacy */}
        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            9. Children's Privacy
          </h2>
          <p className="text-gray-700 mb-4">
            The Platform is not intended for users under 18 years of age. We do
            not knowingly collect information from children. If you are under
            18, do not use the Platform or provide any information.
          </p>
          <p className="text-gray-700">
            If we discover that we have collected information from a child under
            18, we will delete it promptly (except blockchain data, which cannot
            be deleted).
          </p>
        </section>

        {/* International Users */}
        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            10. International Users
          </h2>
          <p className="text-gray-700 mb-4">
            SpiritDAO is based in the United States. Your information may be
            transferred to and processed in the United States, where privacy
            laws may differ from your country.
          </p>
          <p className="text-gray-700">
            By using the Platform, you consent to the transfer of your
            information to the United States and other jurisdictions as
            necessary for Platform operations.
          </p>
        </section>

        {/* Third-Party Links */}
        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            11. Third-Party Links and Services
          </h2>
          <p className="text-gray-700 mb-4">
            The Platform may contain links to third-party websites, wallets, or
            services. We are not responsible for the privacy practices of these
            third parties. We encourage you to review their privacy policies.
          </p>
          <p className="text-gray-700">Third-party services include:</p>
          <ul className="list-disc pl-6 mb-4 text-gray-700">
            <li>Wallet providers (Coinbase Wallet, MetaMask, etc.)</li>
            <li>Blockchain explorers (Basescan, etc.)</li>
            <li>Social media platforms</li>
            <li>External websites linked in forum posts</li>
          </ul>
        </section>

        {/* Changes to Policy */}
        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            12. Changes to This Privacy Policy
          </h2>
          <p className="text-gray-700 mb-4">
            We may update this Privacy Policy from time to time. Changes will be
            posted on this page with an updated "Last Updated" date.
          </p>
          <p className="text-gray-700 mb-4">For material changes, we will:</p>
          <ul className="list-disc pl-6 mb-4 text-gray-700">
            <li>Post a notice on the Platform</li>
            <li>Send an email notification (if you've provided an email)</li>
            <li>
              Require acceptance before continued use (for significant changes)
            </li>
          </ul>
          <p className="text-gray-700">
            Your continued use of the Platform after changes indicates
            acceptance of the updated policy.
          </p>
        </section>

        {/* Contact */}
        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            13. Contact Us
          </h2>
          <p className="text-gray-700 mb-4">
            If you have questions about this Privacy Policy or wish to exercise
            your privacy rights, please contact us:
          </p>
          <div className="bg-gray-50 p-4 rounded-md">
            <p className="text-gray-700">
              <strong>SpiritDAO</strong>
            </p>
            <p className="text-gray-700">501(c)(3) Religious Organization</p>
            <p className="text-gray-700 mt-2">Email: tech@spiritdao.org</p>
            <p className="text-gray-700">
              Support: Through Platform contact forum
            </p>
          </div>
        </section>

        {/* Disclaimer */}
        <section className="mb-8">
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
            <h3 className="text-lg font-semibold text-yellow-800 mb-2">
              Important Disclaimer
            </h3>
            <p className="text-sm text-yellow-700">
              This Privacy Policy describes our data practices but does not
              create contractual obligations. SpiritDAO, as a 501(c)(3)
              religious organization serving as a platform for multiple
              communities, does not assume liability for user actions or data
              breaches resulting from user negligence (such as sharing private
              keys).
            </p>
            <p className="text-sm text-yellow-700 mt-2">
              <strong>Users are personally responsible for:</strong>
            </p>
            <ul className="list-disc pl-6 mt-1 text-sm text-yellow-700">
              <li>Securing their wallet private keys</li>
              <li>Verifying transaction details before signing</li>
              <li>Understanding blockchain's permanent and public nature</li>
              <li>Compliance with applicable laws in their jurisdiction</li>
              <li>Their own tax reporting and financial obligations</li>
            </ul>
          </div>
        </section>

        {/* Acknowledgment */}
        <section>
          <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
            <p className="text-sm text-blue-800">
              <strong>
                By using SpiritDAO, you acknowledge that you have read,
                understood, and agree to this Privacy Policy.
              </strong>
            </p>
            <p className="text-sm text-blue-700 mt-2">
              You understand that blockchain data is public and permanent, and
              that you are personally responsible for securing your wallet and
              verifying all transactions.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
