'use client';

export default function TestNavPage() {
  return (
    <div className="p-4">
      <h1 className="text-3xl font-bold mb-4">Bottom Nav Test Page</h1>
      <p className="mb-4">This page tests the bottom navigation implementation.</p>
      
      <div className="space-y-4">
        {/* Create a long scrollable page to test nav positioning */}
        {Array.from({ length: 50 }, (_, i) => (
          <div key={i} className="p-4 border rounded">
            <h2>Test Item {i + 1}</h2>
            <p>
              This is test content item {i + 1}. The bottom navigation should always 
              remain fixed at the bottom of the screen regardless of scroll position.
            </p>
          </div>
        ))}
      </div>
      
      <div className="mt-8 p-4 bg-blue-100 rounded">
        <h2 className="font-bold">Navigation Test Complete</h2>
        <p>
          If you can see the bottom navigation bar at the bottom of your screen throughout 
          scrolling this page, the implementation is working correctly.
        </p>
      </div>
    </div>
  );
}