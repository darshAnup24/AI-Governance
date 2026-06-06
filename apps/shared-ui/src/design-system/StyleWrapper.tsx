import React from 'react';
import './tokens.css';

interface StyleWrapperProps {
  children: React.ReactNode;
}

function StyleWrapper({ children }: StyleWrapperProps) {
  return (
    <div
      style={{
        backgroundColor: 'var(--background)',
        color: 'var(--foreground)',
        fontFamily: 'var(--font-body)',
      }}
    >
      {children}
    </div>
  );
}

export { StyleWrapper };
