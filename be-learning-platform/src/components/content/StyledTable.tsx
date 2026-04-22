import type { ReactNode } from 'react';

interface StyledTableProps {
  children: ReactNode;
}

export function StyledTable({ children }: StyledTableProps) {
  return (
    <div className="my-3 overflow-x-auto rounded-lg border border-gh-border">
      {children}
    </div>
  );
}
