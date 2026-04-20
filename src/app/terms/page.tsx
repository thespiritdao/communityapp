// src/app/terms/page.tsx
'use client';

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto bg-white shadow-sm rounded-lg p-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Terms of Service
        </h1>
        <p className="text-sm text-gray-600 mb-8">
          Last Updated: November 25, 2025
        </p>

        {/* Acceptance */}
        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            1. Acceptance of Terms
          </h2>
          <p className="text-gray-700 mb-4">
            Welcome to SpiritDAO. These Terms of Service ("Terms") govern your
            access to and use of the SpiritDAO platform ("Platform"), including
            our website, smart contracts, and related services operated by
            SpiritDAO, a 501(c)(3) religious organization incorporated in the
            United States ("SpiritDAO," "we," "us," or "our").
          </p>
          <p className="text-gray-700 mb-4">
            <strong>
              BY ACCESSING OR USING THE PLATFORM, YOU AGREE TO BE BOUND BY THESE
              TERMS.
            </strong>
            If you do not agree to these Terms, do not use the Platform.
          </p>
          <p className="text-gray-700">
            You represent that you are at least 18 years old and have the legal
            capacity to enter into these Terms.
          </p>
        </section>

        {/* Organization Status */}
        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            2. About SpiritDAO
          </h2>

          <h3 className="text-xl font-semibold text-gray-800 mb-3">
            2.1 Religious Organization
          </h3>
          <p className="text-gray-700 mb-4">
            SpiritDAO is a 501(c)(3) tax-exempt religious organization based in
            the United States. The Platform serves as a digital infrastructure
            for communities, members, and organizations to collaborate, govern,
            and participate in various activities.
          </p>

          <h3 className="text-xl font-semibold text-gray-800 mb-3">
            2.2 Platform Provider Role
          </h3>
          <p className="text-gray-700 mb-4">
            SpiritDAO operates as a <strong>platform provider</strong>, not as a
            direct service provider for individual communities or activities. We
            host multiple communities ("Pods"), each with their own members,
            leaders, and governance structures.
          </p>
          <p className="text-gray-700 mb-4">
            <strong>
              Important: SpiritDAO is not responsible for the actions,
              decisions, or activities of individual Pods or their members.
            </strong>{' '}
            Each user is personally and individually liable for their own
            actions on the Platform.
          </p>

          <h3 className="text-xl font-semibold text-gray-800 mb-3">
            2.3 Decentralized Governance
          </h3>
          <p className="text-gray-700 mb-4">
            The Platform utilizes decentralized autonomous organization (DAO)
            principles and blockchain technology. Governance decisions are made
            through community voting and smart contract execution, not
            unilateral control by SpiritDAO.
          </p>
        </section>

        {/* User Responsibilities */}
        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            3. User Responsibilities and Liability
          </h2>

          <h3 className="text-xl font-semibold text-gray-800 mb-3">
            3.1 Personal Liability
          </h3>
          <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-4">
            <p className="text-red-800 font-semibold mb-2">
              YOU ARE PERSONALLY AND SOLELY LIABLE FOR YOUR ACTIONS ON THE
              PLATFORM.
            </p>
            <p className="text-red-700 text-sm">
              SpiritDAO, as a platform provider for multiple communities, does
              not assume liability for user actions, transactions, or decisions.
              You agree to hold SpiritDAO harmless for any losses, damages, or
              legal issues arising from your use of the Platform.
            </p>
          </div>

          <h3 className="text-xl font-semibold text-gray-800 mb-3">
            3.2 You Are Responsible For:
          </h3>
          <ul className="list-disc pl-6 mb-4 text-gray-700">
            <li>
              <strong>Account Security:</strong> Safeguarding the authentication
              credentials (email, social login) you use to access your embedded
              wallet account
            </li>
            <li>
              <strong>Transaction Verification:</strong> Reviewing all
              transaction details before signing
            </li>
            <li>
              <strong>Financial Decisions:</strong> All token purchases,
              transfers, votes, and financial activities
            </li>
            <li>
              <strong>Tax Obligations:</strong> Reporting and paying taxes on
              token transactions and redemptions
            </li>
            <li>
              <strong>Legal Compliance:</strong> Ensuring your activities comply
              with applicable laws in your jurisdiction
            </li>
            <li>
              <strong>Content Posted:</strong> All forum posts, proposals,
              comments, and communications
            </li>
            <li>
              <strong>Pod Activities:</strong> Your participation in Pods and
              community governance
            </li>
            <li>
              <strong>Smart Contract Interactions:</strong> Understanding and
              accepting the risks of blockchain technology
            </li>
            <li>
              <strong>Account Security:</strong> Preventing unauthorized access
              to your account
            </li>
            <li>
              <strong>Due Diligence:</strong> Researching and verifying
              information before making decisions
            </li>
          </ul>

          <h3 className="text-xl font-semibold text-gray-800 mb-3">
            3.3 Prohibited Activities
          </h3>
          <p className="text-gray-700 mb-4">You agree NOT to:</p>
          <ul className="list-disc pl-6 mb-4 text-gray-700">
            <li>Violate any applicable laws or regulations</li>
            <li>Infringe on intellectual property rights</li>
            <li>Post harmful, offensive, or illegal content</li>
            <li>Engage in fraud, scams, or deceptive practices</li>
            <li>Manipulate voting or governance processes</li>
            <li>Attempt to hack, exploit, or compromise the Platform</li>
            <li>Create multiple accounts to circumvent restrictions</li>
            <li>Spam, harass, or abuse other users</li>
            <li>
              Use the Platform for money laundering or illegal financial
              activities
            </li>
            <li>Misrepresent your identity or affiliations</li>
            <li>Reverse engineer or copy Platform code without permission</li>
          </ul>

          <h3 className="text-xl font-semibold text-gray-800 mb-3">
            3.4 Consequences of Violations
          </h3>
          <p className="text-gray-700 mb-4">
            Violations of these Terms may result in:
          </p>
          <ul className="list-disc pl-6 mb-4 text-gray-700">
            <li>Account suspension or termination</li>
            <li>Removal of posted content</li>
            <li>Loss of Platform privileges</li>
            <li>Revocation of Pod memberships</li>
            <li>Legal action (if violations involve illegal activity)</li>
            <li>Reporting to law enforcement authorities</li>
          </ul>
        </section>

        {/* Platform Access */}
        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            4. Platform Access and Account
          </h2>

          <h3 className="text-xl font-semibold text-gray-800 mb-3">
            4.1 Wallet Account
          </h3>
          <p className="text-gray-700 mb-4">
            The Platform uses Coinbase-hosted embedded wallets provided through
            the Coinbase Developer Platform (CDP). When you sign up, a wallet
            is created and custodied by Coinbase and linked to the authentication
            credentials you provide (such as email or social login). You are
            solely responsible for:
          </p>
          <ul className="list-disc pl-6 mb-4 text-gray-700">
            <li>
              Maintaining the security of the authentication credentials you
              use to access your embedded wallet account
            </li>
            <li>Any transactions you authorize through the Platform</li>
            <li>
              Losses resulting from unauthorized access to your account
              credentials
            </li>
          </ul>
          <p className="text-gray-700 mb-4">
            Wallet custody, key management, and recovery are governed by
            Coinbase's own terms and policies.{' '}
            <strong>
              SPIRITDAO CANNOT REVERSE BLOCKCHAIN TRANSACTIONS AND DOES NOT
              HOLD OR RECOVER YOUR WALLET KEYS.
            </strong>
          </p>

          <h3 className="text-xl font-semibold text-gray-800 mb-3">
            4.2 Account Termination
          </h3>
          <p className="text-gray-700 mb-4">
            We reserve the right to suspend or terminate your access to the
            Platform at any time for:
          </p>
          <ul className="list-disc pl-6 mb-4 text-gray-700">
            <li>Violations of these Terms</li>
            <li>Illegal or fraudulent activity</li>
            <li>Threats to Platform security or integrity</li>
            <li>Abuse or harassment of other users</li>
            <li>Any reason we deem necessary for Platform operations</li>
          </ul>
          <p className="text-gray-700">
            <strong>Note:</strong> Account termination does not affect
            blockchain records, which are permanent and immutable.
          </p>

          <h3 className="text-xl font-semibold text-gray-800 mb-3">
            4.3 No Guarantee of Access
          </h3>
          <p className="text-gray-700 mb-4">
            We do not guarantee continuous, uninterrupted access to the
            Platform. The Platform may be unavailable due to:
          </p>
          <ul className="list-disc pl-6 mb-4 text-gray-700">
            <li>Maintenance and upgrades</li>
            <li>Technical issues or outages</li>
            <li>Blockchain network congestion or failures</li>
            <li>Third-party service disruptions</li>
            <li>Force majeure events</li>
          </ul>
        </section>

        {/* Tokens */}
        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            5. Tokens: $SYSTEM and $SELF
          </h2>

          <h3 className="text-xl font-semibold text-gray-800 mb-3">
            5.1 $SYSTEM Token
          </h3>
          <div className="bg-blue-50 border border-blue-200 rounded-md p-4 mb-4">
            <p className="text-blue-900 font-semibold mb-2">
              $SYSTEM Token Characteristics:
            </p>
            <ul className="list-disc pl-6 text-blue-800 text-sm space-y-1">
              <li>
                <strong>Type:</strong> Governance and utility token
              </li>
              <li>
                <strong>Backing:</strong> Tied to SpiritDAO's fiat bank account
              </li>
              <li>
                <strong>Redemption:</strong> May be redeemable for cash in the
                future (subject to availability and terms)
              </li>
              <li>
                <strong>Transferability:</strong> Can be transferred within the
                Platform to other users
              </li>
              <li>
                <strong>Blockchain:</strong> Deployed on Base network (Ethereum
                L2)
              </li>
              <li>
                <strong>Contract Address:</strong>{' '}
                0x1317Ae277266D38C4E492558f8693F14143a6A65
              </li>
            </ul>
          </div>

          <p className="text-gray-700 mb-4">
            <strong>Important Disclaimers for $SYSTEM:</strong>
          </p>
          <ul className="list-disc pl-6 mb-4 text-gray-700">
            <li>
              <strong>Not a Security:</strong> $SYSTEM is not intended to be an
              investment or security
            </li>
            <li>
              <strong>No Investment Advice:</strong> Nothing on the Platform
              constitutes financial or investment advice
            </li>
            <li>
              <strong>Redemption Not Guaranteed:</strong> Future cash redemption
              is subject to availability, terms, and may require KYC/AML
              verification
            </li>
            <li>
              <strong>Value May Fluctuate:</strong> The exchange value or
              redemption rate may change
            </li>
            <li>
              <strong>Tax Implications:</strong> You are responsible for all tax
              reporting and obligations
            </li>
            <li>
              <strong>Regulatory Changes:</strong> Future regulations may affect
              $SYSTEM's characteristics
            </li>
          </ul>

          <h3 className="text-xl font-semibold text-gray-800 mb-3">
            5.2 $SELF Token
          </h3>
          <div className="bg-green-50 border border-green-200 rounded-md p-4 mb-4">
            <p className="text-green-900 font-semibold mb-2">
              $SELF Token Characteristics:
            </p>
            <ul className="list-disc pl-6 text-green-800 text-sm space-y-1">
              <li>
                <strong>Type:</strong> Time-bound community utility token
              </li>
              <li>
                <strong>Value:</strong> No exchange value or cash redemption
              </li>
              <li>
                <strong>Transferability:</strong> NOT transferable to other
                users
              </li>
              <li>
                <strong>Expiration:</strong> Time-bound; expires after specified
                period
              </li>
              <li>
                <strong>Purpose:</strong> Platform features, voting, and
                community participation only
              </li>
              <li>
                <strong>Blockchain:</strong> Deployed on Base network (Ethereum
                L2)
              </li>
              <li>
                <strong>Contract Address:</strong>{' '}
                0xe9b4aB2eB9397fa41AC3223e96f9d988BeFF5D21
              </li>
            </ul>
          </div>

          <p className="text-gray-700 mb-4">
            <strong>Important Disclaimers for $SELF:</strong>
          </p>
          <ul className="list-disc pl-6 mb-4 text-gray-700">
            <li>
              <strong>No Financial Value:</strong> $SELF has no monetary value
              and cannot be redeemed for cash
            </li>
            <li>
              <strong>Utility Only:</strong> Used solely for Platform features
              and community participation
            </li>
            <li>
              <strong>Expiration:</strong> Tokens expire and become invalid
              after the time period
            </li>
            <li>
              <strong>Non-Transferable:</strong> Cannot be transferred, sold, or
              exchanged
            </li>
            <li>
              <strong>No Refunds:</strong> $SELF earned or received cannot be
              converted back to other tokens or money
            </li>
          </ul>

          <h3 className="text-xl font-semibold text-gray-800 mb-3">
            5.3 Token Acquisition
          </h3>
          <p className="text-gray-700 mb-4">Tokens may be acquired through:</p>
          <ul className="list-disc pl-6 mb-4 text-gray-700">
            <li>
              Participation in Platform activities (bounties, events,
              contributions)
            </li>
            <li>Governance rewards and airdrops</li>
            <li>Transfers from other users (SYSTEM only)</li>
            <li>Direct distribution from SpiritDAO</li>
            <li>Purchase mechanisms (if available, subject to terms)</li>
          </ul>

          <h3 className="text-xl font-semibold text-gray-800 mb-3">
            5.4 Token Risks
          </h3>
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
            <p className="text-yellow-800 font-semibold mb-2">
              You Acknowledge and Accept These Risks:
            </p>
            <ul className="list-disc pl-6 text-yellow-700 text-sm space-y-1">
              <li>
                Blockchain transactions are <strong>irreversible</strong> - once
                sent, tokens cannot be recovered
              </li>
              <li>
                Smart contract bugs or exploits could result in loss of tokens
              </li>
              <li>Network congestion may delay or prevent transactions</li>
              <li>
                Regulatory changes may affect token functionality or legality
              </li>
              <li>Token values may decrease or become zero</li>
              <li>
                Loss of access to your authentication credentials may result
                in loss of access to your wallet and tokens; recovery is
                subject to Coinbase's procedures
              </li>
              <li>
                No FDIC insurance or government protection for digital tokens
              </li>
            </ul>
          </div>

          <h3 className="text-xl font-semibold text-gray-800 mb-3">
            5.5 Future Redemption Process ($SYSTEM)
          </h3>
          <p className="text-gray-700 mb-4">
            If/when cash redemption becomes available for $SYSTEM, you
            acknowledge:
          </p>
          <ul className="list-disc pl-6 mb-4 text-gray-700">
            <li>
              Redemption will require identity verification (KYC/AML compliance)
            </li>
            <li>Processing times and fees may apply</li>
            <li>Redemption may be limited by liquidity constraints</li>
            <li>Tax reporting and withholding may be required</li>
            <li>Geographic restrictions may apply</li>
            <li>Minimum/maximum redemption amounts may be imposed</li>
          </ul>
        </section>

        {/* Pods and Communities */}
        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            6. Pods and Communities
          </h2>

          <h3 className="text-xl font-semibold text-gray-800 mb-3">
            6.1 Pod Structure
          </h3>
          <p className="text-gray-700 mb-4">
            The Platform enables creation of "Pods" - semi-autonomous
            communities with their own:
          </p>
          <ul className="list-disc pl-6 mb-4 text-gray-700">
            <li>Members and leadership roles</li>
            <li>Governance structures and voting mechanisms</li>
            <li>Treasury and financial management</li>
            <li>Bounties, events, and activities</li>
            <li>Forums and communication channels</li>
          </ul>

          <h3 className="text-xl font-semibold text-gray-800 mb-3">
            6.2 Pod Autonomy and Liability
          </h3>
          <p className="text-gray-700 mb-4">
            <strong>Pods operate semi-autonomously.</strong> SpiritDAO provides
            the technical infrastructure but does not control or assume
            liability for:
          </p>
          <ul className="list-disc pl-6 mb-4 text-gray-700">
            <li>Pod decisions, votes, or governance actions</li>
            <li>How Pod treasuries are managed or spent</li>
            <li>Bounties created, assigned, or paid by Pods</li>
            <li>Events organized or hosted by Pods</li>
            <li>Disputes between Pod members</li>
            <li>Content posted within Pod forums or channels</li>
          </ul>
          <p className="text-gray-700 mb-4">
            <strong>
              Pod members and leaders are personally liable for their Pod's
              activities and decisions.
            </strong>
          </p>

          <h3 className="text-xl font-semibold text-gray-800 mb-3">
            6.3 Pod Membership
          </h3>
          <p className="text-gray-700 mb-4">
            Pod membership is managed through:
          </p>
          <ul className="list-disc pl-6 mb-4 text-gray-700">
            <li>
              <strong>Hats Protocol:</strong> NFT-based role and permission
              system
            </li>
            <li>
              <strong>Eligibility Criteria:</strong> Token holdings, skills, or
              other requirements
            </li>
            <li>
              <strong>Time-Bound Roles:</strong> Memberships may expire after
              specified periods
            </li>
            <li>
              <strong>Revocation:</strong> Roles can be revoked by Pod
              leadership or governance
            </li>
          </ul>
          <p className="text-gray-700">
            You understand that Pod membership confers no ownership rights in
            SpiritDAO or the Platform.
          </p>

          <h3 className="text-xl font-semibold text-gray-800 mb-3">
            6.4 Pod Creation
          </h3>
          <p className="text-gray-700 mb-4">
            Users may create new Pods subject to:
          </p>
          <ul className="list-disc pl-6 mb-4 text-gray-700">
            <li>
              Meeting minimum requirements (token holdings, approvals, etc.)
            </li>
            <li>Compliance with Platform policies</li>
            <li>Payment of any required fees (if applicable)</li>
            <li>Acceptance of Pod creator responsibilities</li>
          </ul>
        </section>

        {/* Governance */}
        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            7. Governance and Voting
          </h2>

          <h3 className="text-xl font-semibold text-gray-800 mb-3">
            7.1 Decentralized Governance
          </h3>
          <p className="text-gray-700 mb-4">
            The Platform uses decentralized governance where token holders can:
          </p>
          <ul className="list-disc pl-6 mb-4 text-gray-700">
            <li>Create and vote on proposals</li>
            <li>Influence Platform development and policies</li>
            <li>Allocate treasury funds</li>
            <li>Modify governance parameters</li>
          </ul>

          <h3 className="text-xl font-semibold text-gray-800 mb-3">
            7.2 Voting Rights and Responsibilities
          </h3>
          <p className="text-gray-700 mb-4">
            Voting rights are typically based on token holdings. By
            participating in governance, you:
          </p>
          <ul className="list-disc pl-6 mb-4 text-gray-700">
            <li>Accept personal responsibility for your votes</li>
            <li>
              Acknowledge that votes are publicly recorded on the blockchain
            </li>
            <li>Agree to respect governance outcomes, even if you disagree</li>
            <li>Will not manipulate or game voting mechanisms</li>
            <li>
              Understand that governance decisions may affect token value or
              Platform functionality
            </li>
          </ul>

          <h3 className="text-xl font-semibold text-gray-800 mb-3">
            7.3 Proposal Execution
          </h3>
          <p className="text-gray-700 mb-4">
            Approved proposals are typically executed automatically via smart
            contracts. You understand:
          </p>
          <ul className="list-disc pl-6 mb-4 text-gray-700">
            <li>Execution is automated and irreversible</li>
            <li>Smart contract bugs could cause unintended consequences</li>
            <li>
              No manual intervention or appeals process exists for blockchain
              execution
            </li>
          </ul>

          <h3 className="text-xl font-semibold text-gray-800 mb-3">
            7.4 Governance Limitations
          </h3>
          <p className="text-gray-700 mb-4">
            While governance is decentralized, SpiritDAO reserves the right to:
          </p>
          <ul className="list-disc pl-6 mb-4 text-gray-700">
            <li>
              Prevent or reverse proposals that violate laws or these Terms
            </li>
            <li>Implement emergency measures for Platform security</li>
            <li>Modify governance structures to comply with regulations</li>
            <li>Suspend governance during critical incidents</li>
          </ul>
        </section>

        {/* Bounties and Marketplace */}
        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            8. Bounties and Marketplace
          </h2>

          <h3 className="text-xl font-semibold text-gray-800 mb-3">
            8.1 Bounty System
          </h3>
          <p className="text-gray-700 mb-4">
            The Platform includes a bounty system for task completion and
            rewards. Bounties involve:
          </p>
          <ul className="list-disc pl-6 mb-4 text-gray-700">
            <li>
              <strong>Posting:</strong> Pod leaders/treasuries create bounties
              with task descriptions and rewards
            </li>
            <li>
              <strong>Bidding:</strong> Users submit bids to complete bounties
            </li>
            <li>
              <strong>Assignment:</strong> Bounties are assigned to selected
              bidders
            </li>
            <li>
              <strong>Completion:</strong> Assignees complete tasks and submit
              proof
            </li>
            <li>
              <strong>Payment:</strong> Upon approval, rewards are distributed
              from Pod treasuries
            </li>
          </ul>

          <h3 className="text-xl font-semibold text-gray-800 mb-3">
            8.2 Bounty Liability
          </h3>
          <p className="text-gray-700 mb-4">
            <strong>SpiritDAO is not a party to bounty agreements.</strong>{' '}
            Bounties are contracts between Pod treasuries and assignees. You
            acknowledge:
          </p>
          <ul className="list-disc pl-6 mb-4 text-gray-700">
            <li>SpiritDAO does not guarantee bounty payment or quality</li>
            <li>
              Disputes must be resolved between parties or through Pod
              governance
            </li>
            <li>Bounty creators are liable for payment obligations</li>
            <li>
              Bounty assignees are liable for work quality and deliverables
            </li>
            <li>
              Tax reporting for bounty income is the assignee's responsibility
            </li>
          </ul>

          <h3 className="text-xl font-semibold text-gray-800 mb-3">
            8.3 Marketplace Transactions
          </h3>
          <p className="text-gray-700 mb-4">
            The Platform may include marketplace features for goods/services.
            All marketplace transactions:
          </p>
          <ul className="list-disc pl-6 mb-4 text-gray-700">
            <li>Are between buyers and sellers (SpiritDAO is not a party)</li>
            <li>Use blockchain transactions (irreversible and final)</li>
            <li>Require buyer verification and acceptance before completion</li>
            <li>Are subject to seller terms and policies</li>
          </ul>
          <p className="text-gray-700">
            <strong>
              No refunds, returns, or chargebacks are available for
              blockchain-based marketplace transactions.
            </strong>
          </p>
        </section>

        {/* Events and NFTs */}
        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            9. Events and NFTs
          </h2>

          <h3 className="text-xl font-semibold text-gray-800 mb-3">
            9.1 Event Registration
          </h3>
          <p className="text-gray-700 mb-4">
            Pods may organize events through the Platform. Event registration
            typically involves:
          </p>
          <ul className="list-disc pl-6 mb-4 text-gray-700">
            <li>Minting an Event Registration NFT</li>
            <li>Payment of registration fees (if applicable)</li>
            <li>Token-gating based on membership or holdings</li>
          </ul>

          <h3 className="text-xl font-semibold text-gray-800 mb-3">
            9.2 Event Completion NFTs
          </h3>
          <p className="text-gray-700 mb-4">
            Upon event completion/attendance, participants may receive Event
            Completion NFTs as proof of attendance. These NFTs:
          </p>
          <ul className="list-disc pl-6 mb-4 text-gray-700">
            <li>Are permanently recorded on the blockchain</li>
            <li>May unlock future benefits or access</li>
            <li>Cannot be transferred or sold (soulbound)</li>
            <li>Represent attendance, not endorsement or certification</li>
          </ul>

          <h3 className="text-xl font-semibold text-gray-800 mb-3">
            9.3 Event Liability
          </h3>
          <p className="text-gray-700 mb-4">
            <strong>
              SpiritDAO is not liable for events organized through the Platform.
            </strong>{' '}
            Event organizers and attendees are personally responsible for:
          </p>
          <ul className="list-disc pl-6 mb-4 text-gray-700">
            <li>Event safety, security, and compliance with laws</li>
            <li>Accuracy of event information and descriptions</li>
            <li>Fulfillment of event promises or deliverables</li>
            <li>Refunds or cancellations (per organizer's policies)</li>
            <li>Injuries, damages, or issues arising during events</li>
          </ul>
        </section>

        {/* Intellectual Property */}
        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            10. Intellectual Property
          </h2>

          <h3 className="text-xl font-semibold text-gray-800 mb-3">
            10.1 Platform Ownership
          </h3>
          <p className="text-gray-700 mb-4">
            The Platform, including its code, design, graphics, and trademarks,
            is owned by SpiritDAO or its licensors. You may not:
          </p>
          <ul className="list-disc pl-6 mb-4 text-gray-700">
            <li>
              Copy, modify, or distribute Platform code without permission
            </li>
            <li>Use SpiritDAO trademarks or branding without authorization</li>
            <li>Reverse engineer or decompile Platform software</li>
            <li>Create derivative works based on the Platform</li>
          </ul>

          <h3 className="text-xl font-semibold text-gray-800 mb-3">
            10.2 User Content
          </h3>
          <p className="text-gray-700 mb-4">
            You retain ownership of content you post (forum posts, proposals,
            profiles, etc.). However, by posting, you grant SpiritDAO a
            worldwide, non-exclusive, royalty-free license to:
          </p>
          <ul className="list-disc pl-6 mb-4 text-gray-700">
            <li>Display your content on the Platform</li>
            <li>Store content in our databases and blockchain</li>
            <li>
              Distribute content to other users as part of Platform
              functionality
            </li>
          </ul>
          <p className="text-gray-700">
            You represent that you own or have rights to all content you post
            and that it does not infringe on others' rights.
          </p>

          <h3 className="text-xl font-semibold text-gray-800 mb-3">
            10.3 Smart Contracts
          </h3>
          <p className="text-gray-700 mb-4">
            Certain smart contracts are open-source under specified licenses.
            Review individual contract licenses before use or modification.
          </p>
        </section>

        {/* Disclaimers */}
        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            11. Disclaimers and Warranties
          </h2>

          <div className="bg-gray-100 border-l-4 border-gray-500 p-4 mb-4">
            <p className="text-gray-900 font-bold mb-2">
              THE PLATFORM IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT
              WARRANTIES OF ANY KIND.
            </p>
            <p className="text-gray-700 text-sm mb-2">
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, SPIRITDAO DISCLAIMS ALL
              WARRANTIES, EXPRESS OR IMPLIED, INCLUDING:
            </p>
            <ul className="list-disc pl-6 text-gray-700 text-sm space-y-1">
              <li>
                Warranties of merchantability, fitness for a particular purpose,
                and non-infringement
              </li>
              <li>
                That the Platform will be error-free, secure, or uninterrupted
              </li>
              <li>
                That defects will be corrected or that smart contracts are
                bug-free
              </li>
              <li>
                Regarding the accuracy, reliability, or completeness of Platform
                content
              </li>
              <li>That tokens will maintain value or be redeemable</li>
            </ul>
          </div>

          <p className="text-gray-700 mb-4">
            <strong>Specific Disclaimers:</strong>
          </p>
          <ul className="list-disc pl-6 mb-4 text-gray-700">
            <li>
              <strong>No Financial Advice:</strong> Nothing on the Platform is
              financial, investment, tax, or legal advice
            </li>
            <li>
              <strong>No Guarantees:</strong> We make no guarantees about token
              value, governance outcomes, or Platform features
            </li>
            <li>
              <strong>Third-Party Services:</strong> We are not responsible for
              third-party wallets, blockchains, or services
            </li>
            <li>
              <strong>User Actions:</strong> We are not liable for user
              decisions, transactions, or Pod activities
            </li>
            <li>
              <strong>Regulatory Risks:</strong> Future regulations may affect
              Platform operations or token legality
            </li>
          </ul>
        </section>

        {/* Limitation of Liability */}
        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            12. Limitation of Liability
          </h2>

          <div className="bg-red-100 border-l-4 border-red-500 p-4 mb-4">
            <p className="text-red-900 font-bold mb-2">
              TO THE MAXIMUM EXTENT PERMITTED BY LAW:
            </p>
            <p className="text-red-800 text-sm mb-2">
              SPIRITDAO AND ITS DIRECTORS, OFFICERS, EMPLOYEES, VOLUNTEERS, AND
              AFFILIATES SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL,
              SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING WITHOUT
              LIMITATION:
            </p>
            <ul className="list-disc pl-6 text-red-800 text-sm space-y-1">
              <li>Loss of tokens, funds, or digital assets</li>
              <li>Loss of profits or business opportunities</li>
              <li>Smart contract bugs, exploits, or failures</li>
              <li>Blockchain network issues or failures</li>
              <li>Unauthorized access to your wallet or account</li>
              <li>Errors in governance execution or voting</li>
              <li>Actions or decisions of Pods or other users</li>
              <li>Bounty disputes or non-payment</li>
              <li>Event issues, cancellations, or injuries</li>
              <li>Loss or corruption of data</li>
            </ul>
          </div>

          <p className="text-gray-700 mb-4">
            <strong>
              IN NO EVENT SHALL SPIRITDAO'S TOTAL LIABILITY EXCEED $100 USD OR
              THE AMOUNT YOU PAID TO SPIRITDAO IN THE PAST 12 MONTHS, WHICHEVER
              IS LESS.
            </strong>
          </p>

          <p className="text-gray-700">
            Some jurisdictions do not allow limitation of liability for certain
            damages. In such jurisdictions, our liability is limited to the
            maximum extent permitted by law.
          </p>
        </section>

        {/* Indemnification */}
        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            13. Indemnification
          </h2>
          <p className="text-gray-700 mb-4">
            You agree to indemnify, defend, and hold harmless SpiritDAO and its
            directors, officers, employees, volunteers, and affiliates from any
            claims, liabilities, damages, losses, and expenses (including legal
            fees) arising from:
          </p>
          <ul className="list-disc pl-6 mb-4 text-gray-700">
            <li>Your use of the Platform</li>
            <li>Your violation of these Terms</li>
            <li>Your violation of any laws or third-party rights</li>
            <li>Content you post on the Platform</li>
            <li>Your participation in Pods, governance, bounties, or events</li>
            <li>Your token transactions or smart contract interactions</li>
            <li>Disputes with other users or third parties</li>
          </ul>
        </section>

        {/* Dispute Resolution */}
        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            14. Dispute Resolution
          </h2>

          <h3 className="text-xl font-semibold text-gray-800 mb-3">
            14.1 Informal Resolution
          </h3>
          <p className="text-gray-700 mb-4">
            Before filing any formal action, you agree to attempt informal
            resolution by contacting us at support@spiritdao.org with a
            description of the dispute.
          </p>

          <h3 className="text-xl font-semibold text-gray-800 mb-3">
            14.2 Arbitration
          </h3>
          <p className="text-gray-700 mb-4">
            Any disputes not resolved informally shall be resolved through
            binding arbitration in accordance with the American Arbitration
            Association's rules. Arbitration shall be conducted in Florida, USA
            and governed by Florida State law.
          </p>
          <p className="text-gray-700 mb-4">
            <strong>
              You waive your right to a jury trial and to participate in class
              actions.
            </strong>
          </p>

          <h3 className="text-xl font-semibold text-gray-800 mb-3">
            14.3 Exceptions
          </h3>
          <p className="text-gray-700 mb-4">
            Either party may seek equitable relief in court for:
          </p>
          <ul className="list-disc pl-6 mb-4 text-gray-700">
            <li>Intellectual property infringement</li>
            <li>
              Violations of these Terms requiring immediate injunctive relief
            </li>
            <li>
              Statutory claims that cannot be arbitrated under applicable law
            </li>
          </ul>
        </section>

        {/* Governing Law */}
        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            15. Governing Law and Jurisdiction
          </h2>
          <p className="text-gray-700 mb-4">
            These Terms are governed by the laws of the United States and [Your
            State], without regard to conflict of law principles.
          </p>
          <p className="text-gray-700">
            Any legal actions not subject to arbitration must be brought in
            courts located in [Your County/State], and you consent to personal
            jurisdiction in those courts.
          </p>
        </section>

        {/* Changes to Terms */}
        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            16. Changes to These Terms
          </h2>
          <p className="text-gray-700 mb-4">
            We reserve the right to modify these Terms at any time. Changes will
            be effective upon:
          </p>
          <ul className="list-disc pl-6 mb-4 text-gray-700">
            <li>
              Posting updated Terms on the Platform with a new "Last Updated"
              date
            </li>
            <li>
              Notice to users via email or Platform notification (for material
              changes)
            </li>
          </ul>
          <p className="text-gray-700 mb-4">
            Material changes may require your acceptance before continued use.
            Your continued use after changes indicates acceptance of updated
            Terms.
          </p>
          <p className="text-gray-700">
            If you disagree with changes, you must stop using the Platform.
            Continued use constitutes agreement to the new Terms.
          </p>
        </section>

        {/* Miscellaneous */}
        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            17. Miscellaneous
          </h2>

          <h3 className="text-xl font-semibold text-gray-800 mb-3">
            17.1 Entire Agreement
          </h3>
          <p className="text-gray-700 mb-4">
            These Terms, along with our Privacy Policy, constitute the entire
            agreement between you and SpiritDAO regarding the Platform.
          </p>

          <h3 className="text-xl font-semibold text-gray-800 mb-3">
            17.2 Severability
          </h3>
          <p className="text-gray-700 mb-4">
            If any provision of these Terms is found invalid or unenforceable,
            the remaining provisions remain in full effect.
          </p>

          <h3 className="text-xl font-semibold text-gray-800 mb-3">
            17.3 No Waiver
          </h3>
          <p className="text-gray-700 mb-4">
            Our failure to enforce any provision of these Terms does not
            constitute a waiver of that provision or our right to enforce it
            later.
          </p>

          <h3 className="text-xl font-semibold text-gray-800 mb-3">
            17.4 Assignment
          </h3>
          <p className="text-gray-700 mb-4">
            You may not assign or transfer these Terms. We may assign these
            Terms to any successor or affiliate without notice.
          </p>

          <h3 className="text-xl font-semibold text-gray-800 mb-3">
            17.5 Force Majeure
          </h3>
          <p className="text-gray-700 mb-4">
            We are not liable for delays or failures due to events beyond our
            reasonable control, including natural disasters, war, terrorism,
            network failures, or government actions.
          </p>

          <h3 className="text-xl font-semibold text-gray-800 mb-3">
            17.6 Survival
          </h3>
          <p className="text-gray-700 mb-4">
            Provisions that by their nature should survive termination
            (liability limitations, indemnification, dispute resolution, etc.)
            shall survive.
          </p>
        </section>

        {/* Contact */}
        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            18. Contact Information
          </h2>
          <p className="text-gray-700 mb-4">
            For questions about these Terms or the Platform, please contact:
          </p>
          <div className="bg-gray-50 p-4 rounded-md">
            <p className="text-gray-700">
              <strong>SpiritDAO</strong>
            </p>
            <p className="text-gray-700">501(c)(3) Religious Organization</p>
            <p className="text-gray-700 mt-2">Email: community@spiritdao.org</p>
            <p className="text-gray-700">Support: community@spiritdao.org</p>
            <p className="text-gray-700">
              Support Form: Available through Platform Forum
            </p>
          </div>
        </section>

        {/* Acknowledgment */}
        <section>
          <div className="bg-blue-50 border border-blue-200 rounded-md p-6">
            <h3 className="text-lg font-bold text-blue-900 mb-3">
              ACKNOWLEDGMENT AND ACCEPTANCE
            </h3>
            <p className="text-blue-800 mb-3">
              BY USING THE SPIRITDAO PLATFORM, YOU ACKNOWLEDGE THAT:
            </p>
            <ul className="list-disc pl-6 text-blue-800 space-y-2 mb-4">
              <li>
                You have read, understood, and agree to these Terms of Service
              </li>
              <li>
                You are at least 18 years old and have legal capacity to enter
                into these Terms
              </li>
              <li>
                You are personally and solely liable for your actions on the
                Platform
              </li>
              <li>
                SpiritDAO is a platform provider and not liable for user actions
                or Pod activities
              </li>
              <li>
                Blockchain transactions are permanent, irreversible, and public
              </li>
              <li>
                You are responsible for securing the authentication credentials
                used to access your embedded wallet account
              </li>
              <li>Tokens may lose value and redemption is not guaranteed</li>
              <li>
                You accept all risks associated with blockchain technology and
                digital assets
              </li>
              <li>
                You will comply with all applicable laws in your jurisdiction
              </li>
              <li>
                You waive certain rights including jury trial and class action
                participation
              </li>
            </ul>
            <p className="text-blue-900 font-semibold">
              If you do not agree to these Terms, you must immediately cease
              using the Platform.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
