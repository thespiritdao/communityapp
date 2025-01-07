'use client';

export function Footer() {
  return (
    <footer className="w-full bg-gray-800 text-white py-4 mt-8">
      <div className="container mx-auto text-center">
        <p className="text-sm">&copy; {new Date().getFullYear()} SpiritDAO. All rights reserved.</p>
        <nav className="mt-2">
          <a href="/privacy" className="text-indigo-400 hover:text-indigo-600 mx-2">
            Privacy Policy
          </a>
          <a href="/terms" className="text-indigo-400 hover:text-indigo-600 mx-2">
            Terms of Service
          </a>
          <a href="/contact" className="text-indigo-400 hover:text-indigo-600 mx-2">
            Contact Us
          </a>
        </nav>
      </div>
    </footer>
  );
}
