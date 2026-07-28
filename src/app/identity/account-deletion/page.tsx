// src/app/identity/account-deletion/page.tsx
// Public page (no auth) — linked from the Google Play data-safety form and
// the privacy policy. Must remain reachable without login.
import Link from 'next/link';

export const metadata = {
  title: 'Account Deletion — SpiritDAO Community',
  description:
    'How to request deletion of your SpiritDAO Community account and associated data.',
};

export default function AccountDeletionPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto bg-white shadow-sm rounded-lg p-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Account Deletion
        </h1>
        <p className="text-sm text-gray-600 mb-8">
          For the SpiritDAO Community app (org.spiritdao.app) and
          app.spiritdao.org
        </p>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            How to Request Deletion
          </h2>
          <p className="text-gray-700 mb-4">
            The fastest way: while signed in, open your{' '}
            <Link href="/identity" className="text-green-800 underline">
              Identity page
            </Link>{' '}
            in the app and use the <strong>Delete Account</strong> button at
            the bottom of the page.
          </p>
          <p className="text-gray-700 mb-4">
            Alternatively, email us from the address associated with your
            account:
          </p>
          <p className="mb-4">
            <a
              href="mailto:tech@spiritdao.org?subject=Account%20Deletion%20Request"
              className="inline-block bg-green-800 text-white font-semibold px-6 py-3 rounded-lg hover:bg-green-900"
            >
              Email tech@spiritdao.org
            </a>
          </p>
          <p className="text-gray-700 mb-4">
            Use the subject line &ldquo;Account Deletion Request&rdquo; and
            include the email address you sign in with. We will verify the
            request, confirm it with you, and complete the deletion within 30
            days.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            What Is Deleted
          </h2>
          <ul className="list-disc pl-6 mb-4 text-gray-700">
            <li>Your account and sign-in credentials</li>
            <li>Profile information (name, photo, bio, links)</li>
            <li>Direct messages and chat history</li>
            <li>Event registrations</li>
            <li>Email address and notification preferences</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            What Is Retained
          </h2>
          <ul className="list-disc pl-6 mb-4 text-gray-700">
            <li>
              <strong>Blockchain records</strong> — wallet addresses,
              transaction history, token holdings, and voting records are part
              of a permanent public ledger that no one, including us, can alter
              or erase.
            </li>
            <li>
              <strong>Community content</strong> — forum posts and proposals
              may be anonymized rather than removed, so that community
              discussions and governance records remain coherent.
            </li>
            <li>
              <strong>Legal and financial records</strong> — donation records
              and data we are required to keep for legal, tax, or compliance
              purposes are retained for the legally required period.
            </li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            Questions
          </h2>
          <p className="text-gray-700 mb-4">
            See our{' '}
            <Link href="/privacy" className="text-green-800 underline">
              Privacy Policy
            </Link>{' '}
            for full details on the data we collect and your rights, or contact
            us at{' '}
            <a
              href="mailto:tech@spiritdao.org"
              className="text-green-800 underline"
            >
              tech@spiritdao.org
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
