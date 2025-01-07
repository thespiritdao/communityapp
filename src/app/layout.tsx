"use client";

import React from "react";
import { CommunityProvider } from "src/context/CommunityContext";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <CommunityProvider>{children}</CommunityProvider>
      </body>
    </html>
  );
}
